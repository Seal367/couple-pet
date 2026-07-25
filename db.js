// db.js — Database adapter: PostgreSQL (via pg) when DATABASE_URL is set, SQLite otherwise

const path = require('path');

let pool = null;
let dbType = null;
let poolPromise = null;

function getDbType() {
  if (dbType) return dbType;
  dbType = process.env.DATABASE_URL ? 'postgres' : 'sqlite';
  return dbType;
}

// 同步创建 pool（不测试连接），用于 Vercel 模块加载时注册 session 中间件
function getPoolSync() {
  if (pool) return pool;

  if (getDbType() === 'postgres') {
    const { Pool } = require('pg');
    const databaseUrl = process.env.DATABASE_URL;
    const url = new URL(databaseUrl);

    pool = new Pool({
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      family: 4,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: process.env.VERCEL ? 5 : undefined,
      connectionTimeoutMillis: 15000,
    });
    return pool;
  } else {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'pet-local.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    pool = {
      _db: db,

      async query(sql, params) {
        try {
          const normalized = sql.trim();
          const upperSQL = normalized.toUpperCase();
          if (upperSQL.startsWith('SELECT')) return _select(db, normalized, params);
          if (upperSQL.startsWith('INSERT') || upperSQL.startsWith('WITH')) return _insert(db, normalized, params);
          if (upperSQL.startsWith('UPDATE')) return _update(db, normalized, params);
          if (upperSQL.startsWith('DELETE')) return _run(db, normalized, params);
          const converted = pgToSQLite(normalized);
          const statements = converted.split(';').map(s => s.trim()).filter(s => s);
          for (const s of statements) { if (s) db.exec(s); }
          return { rows: [], rowCount: 0 };
        } catch (err) {
          console.error('DB query error:', err.message, '| SQL:', sql.substring(0, 200));
          throw err;
        }
      },

      async connect() {
        return { query: (...args) => pool.query(...args), release: () => {} };
      },
    };

    return pool;
  }
}

async function getPool() {
  if (pool) return pool;
  if (poolPromise) return poolPromise;

  if (getDbType() === 'postgres') {
    poolPromise = (async () => {
      const { Pool } = require('pg');
      const databaseUrl = process.env.DATABASE_URL;
      const url = new URL(databaseUrl);

      pool = new Pool({
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        family: 4, // 仅 IPv4
        ssl: process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
        max: process.env.VERCEL ? 5 : undefined,
        connectionTimeoutMillis: 15000,
      });

      // 快速连接测试
      try {
        const client = await pool.connect();
        client.release();
        console.log('✅ PostgreSQL pool connected');
      } catch (e) {
        pool = null;
        throw e;
      }
      return pool;
    })();
    return poolPromise;
  } else {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'pet-local.db');
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    pool = {
      _db: db,

      async query(sql, params) {
        try {
          const normalized = sql.trim();
          const upperSQL = normalized.toUpperCase();

          if (upperSQL.startsWith('SELECT')) {
            return _select(db, normalized, params);
          } else if (upperSQL.startsWith('INSERT') || upperSQL.startsWith('WITH')) {
            return _insert(db, normalized, params);
          } else if (upperSQL.startsWith('UPDATE')) {
            return _update(db, normalized, params);
          } else if (upperSQL.startsWith('DELETE')) {
            return _run(db, normalized, params);
          } else {
            const converted = pgToSQLite(normalized);
            const statements = converted.split(';').map(s => s.trim()).filter(s => s);
            for (const s of statements) {
              if (s) db.exec(s);
            }
            return { rows: [], rowCount: 0 };
          }
        } catch (err) {
          console.error('DB query error:', err.message, '| SQL:', sql.substring(0, 200));
          throw err;
        }
      },

      async connect() {
        return {
          query: (...args) => pool.query(...args),
          release: () => {},
        };
      },
    };

    return pool;
  }
}

// ─── SQLite query helpers ───────────────────────────────────────────

function _params(params) {
  if (!params) return [];
  const arr = Array.isArray(params) ? params : [params];
  return arr.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
}

function expandParams(sql, params) {
  if (!params || params.length === 0) return [];
  const refs = [];
  const re = /\$(\d+)/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    refs.push(parseInt(m[1]) - 1);
  }
  if (refs.length === 0) return params;
  const result = refs.map(idx => _params(params)[idx]);
  return result;
}

function _select(db, sql, params) {
  const converted = pgToSQLite(sql);
  const expandedParams = expandParams(sql, params);
  const stmt = db.prepare(converted);
  const rows = expandedParams.length > 0
    ? stmt.all(...expandedParams)
    : stmt.all();
  const processed = rows.map(r => {
    const o = { ...r };
    if ('is_sleeping' in o) o.is_sleeping = !!o.is_sleeping;
    if ('is_online' in o) o.is_online = !!o.is_online;
    if ('recently_active' in o) o.recently_active = !!o.recently_active;
    if ('member_count' in o && typeof o.member_count !== 'number') o.member_count = Number(o.member_count) || 0;
    return o;
  });
  return { rows: processed, rowCount: processed.length };
}

function _insert(db, sql, params) {
  const upperSQL = sql.trim().toUpperCase();

  if (upperSQL.startsWith('WITH')) {
    return _insertCTE(db, sql, _params(params));
  }

  let returningCols = null;
  let cleanSQL = sql;
  const retMatch = cleanSQL.match(/\s*RETURNING\s+(.+?)(?:\s*;?\s*)$/is);
  if (retMatch) {
    returningCols = retMatch[1].split(',').map(s => s.trim().replace(/".*?"/, '').split(/\s+/)[0]);
    cleanSQL = cleanSQL.replace(/\s*RETURNING\s+.+$/is, '');
  }

  const converted = pgToSQLite(cleanSQL);
  const stmt = db.prepare(converted);
  const info = _params(params).length > 0
    ? stmt.run(..._params(params))
    : stmt.run();

  if (returningCols && info.changes > 0) {
    const tableMatch = cleanSQL.match(/INTO\s+(\w+)/i);
    if (tableMatch) {
      const row = db.prepare(`SELECT * FROM ${tableMatch[1]} WHERE id = ?`).get(info.lastInsertRowid);
      if (row) {
        const r = { ...row };
        if ('is_sleeping' in r) r.is_sleeping = !!r.is_sleeping;
        if ('is_online' in r) r.is_online = !!r.is_online;
        return { rows: [r], rowCount: info.changes };
      }
    }
  }
  return { rows: [], rowCount: info.changes };
}

function _insertCTE(db, sql, params) {
  const cteNameMatch = sql.match(/WITH\s+(\w+)\s+AS\s*\(/is);
  const cteName = cteNameMatch ? cteNameMatch[1] : 'new_couple';

  const insertPattern = /INSERT\s+INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(/ig;
  const insertStarts = [];
  let m;
  while ((m = insertPattern.exec(sql)) !== null) {
    insertStarts.push({ table: m[1], cols: m[2], pos: m.index, afterValues: m.index + m[0].length });
  }
  if (insertStarts.length < 2) {
    const converted = pgToSQLite(sql.replace(/\s*RETURNING\s+.+$/is, ''));
    db.exec(converted);
    return { rows: [], rowCount: 0 };
  }

  // First INSERT
  const firstIns = insertStarts[0];
  const firstAfter = sql.substring(firstIns.afterValues);
  const firstCloseIdx = firstAfter.indexOf(')');
  const firstVals = firstAfter.substring(0, firstCloseIdx);
  const firstValsArr = firstVals.split(',').map(s => s.trim());
  const firstParamCount = firstValsArr.filter(v => v.startsWith('$')).length;
  const firstSQL = `INSERT INTO ${firstIns.table} (${firstIns.cols}) VALUES (${firstVals})`;
  const firstSQLite = pgToSQLite(firstSQL);
  const firstInfo = db.prepare(firstSQLite).run(...params.slice(0, firstParamCount));
  if (firstInfo.changes === 0) return { rows: [], rowCount: 0 };
  const cteId = firstInfo.lastInsertRowid;

  // Second INSERT
  const secondIns = insertStarts[1];
  const secondAfter = sql.substring(secondIns.afterValues);

  let depth = 1;
  let valsEndIdx = 0;
  for (let i = 0; i < secondAfter.length; i++) {
    if (secondAfter[i] === '(') depth++;
    else if (secondAfter[i] === ')') {
      depth--;
      if (depth === 0) { valsEndIdx = i; break; }
    }
  }
  let secondVals = secondAfter.substring(0, valsEndIdx);

  secondVals = secondVals.replace(
    new RegExp(`\\(\\s*SELECT\\s+id\\s+FROM\\s+${cteName}\\s*\\)`, 'i'),
    '?'
  );

  const afterVals = secondAfter.substring(valsEndIdx + 1);
  const retMatch = afterVals.match(/RETURNING\s+(.+)$/is);
  const retCols = retMatch ? retMatch[1].split(',').map(s => s.trim()) : null;

  const secondSQL = `INSERT INTO ${secondIns.table} (${secondIns.cols}) VALUES (${secondVals})`;
  const secondSQLite = pgToSQLite(secondSQL);

  const secondParamCount = (secondSQLite.match(/\?/g) || []).length;
  const remainingParams = params.slice(firstParamCount);
  const secondParams = [...remainingParams.slice(0, secondParamCount - 1), cteId];

  const secondInfo = db.prepare(secondSQLite).run(...secondParams);
  if (secondInfo.changes === 0) return { rows: [], rowCount: 0 };
  const outerId = secondInfo.lastInsertRowid;

  const row = {};
  if (retCols) {
    const colNames = secondIns.cols.split(',').map(s => s.trim());
    if (retCols.some(c => c.toLowerCase() === 'id')) row.id = outerId;
    if (retCols.some(c => c.toLowerCase() === 'display_name')) {
      const idx = colNames.indexOf('display_name');
      row.display_name = idx >= 0 ? secondParams[idx] : '';
    }
    if (retCols.some(c => c.toLowerCase() === 'couple_id')) row.couple_id = cteId;
  }

  return { rows: [row], rowCount: 1 };
}

function _update(db, sql, params) {
  const converted = pgToSQLite(sql);
  const expandedParams = expandParams(sql, params);
  const stmt = db.prepare(converted);
  const info = expandedParams.length > 0
    ? stmt.run(...expandedParams)
    : stmt.run();
  return { rows: [], rowCount: info.changes };
}

function _run(db, sql, params) {
  const converted = pgToSQLite(sql);
  const expandedParams = expandParams(sql, params);
  const stmt = db.prepare(converted);
  const info = expandedParams.length > 0
    ? stmt.run(...expandedParams)
    : stmt.run();
  return { rows: [], rowCount: info.changes };
}

// ─── SQL translation ────────────────────────────────────────────────

function replaceGreatLeast(sql, pgFunc, sqliteFunc) {
  const pattern = new RegExp(`${pgFunc}\\s*\\(`, 'gi');
  let result = sql;
  let match;
  while ((match = pattern.exec(result)) !== null) {
    const openParen = match.index + match[0].length - 1;

    const afterOpen = result.substring(openParen + 1);
    const commaIdx = afterOpen.indexOf(',');
    if (commaIdx === -1) continue;
    const firstArg = afterOpen.substring(0, commaIdx).trim();

    let depth = 1;
    let closeIdx = -1;
    for (let i = commaIdx + 1; i < afterOpen.length; i++) {
      if (afterOpen[i] === '(') depth++;
      else if (afterOpen[i] === ')') {
        depth--;
        if (depth === 0) { closeIdx = i; break; }
      }
    }
    if (closeIdx === -1) continue;

    const secondArg = afterOpen.substring(commaIdx + 1, closeIdx).trim();
    const fullMatch = result.substring(match.index, openParen + 2 + closeIdx);
    result = result.replace(fullMatch, `${sqliteFunc}(${firstArg}, ${secondArg})`);

    pattern.lastIndex = 0;
  }
  return result;
}

function pgToSQLite(sql) {
  let result = sql;

  result = result.replace(/\$(\d+)/g, '?');

  result = result
    .replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\bSERIAL\b/gi, 'INTEGER')
    .replace(/VARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT')
    .replace(/BOOLEAN\s+DEFAULT\s+FALSE/gi, 'INTEGER DEFAULT 0')
    .replace(/BOOLEAN\s+DEFAULT\s+TRUE/gi, 'INTEGER DEFAULT 1')
    .replace(/\bBOOLEAN\b/gi, 'INTEGER')
    .replace(/TIMESTAMP\s+DEFAULT\s+NOW\(\)/gi, "TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .replace(/TIMESTAMP\b(?!\()/gi, 'TEXT')
    .replace(/\bJSON\b/gi, 'TEXT');

  result = result.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*NOW\s*\(\s*\)\s*-\s*(\w+(?:\.\w+)?)\s*\)\s*\)/gi,
    "(unixepoch('now') - unixepoch($1))");

  result = result.replace(/\bNOW\(\)/gi, "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");

  result = result.replace(/to_char\s*\(\s*([^,]+)\s*,\s*'HH24:MI'\s*\)/gi, "strftime('%H:%M', $1)");

  result = result.replace(/\(?(\w+\.)?(\w+)\s*\+\s*INTERVAL\s*'(\d+)\s*(\w+)'\)?/gi, (match, prefix, col, num, unit) => {
    return `datetime(${prefix || ''}${col}, '+${num} ${unit}')`;
  });

  result = replaceGreatLeast(result, 'GREATEST', 'MAX');
  result = replaceGreatLeast(result, 'LEAST', 'MIN');

  result = result.replace(/ROUND\s*\(\s*\(([^)]+)\)::numeric\s*,\s*(\d+)\s*\)/gi, 'ROUND($1, $2)');

  result = result.replace(/::int(eger)?\b/gi, '');

  result = result.replace(/\s+ON\s+CONFLICT\s+DO\s+NOTHING/gi, '');

  return result;
}

// ─── Database initialization ─────────────────────────────────────────

async function initDB() {
  const type = getDbType();

  if (type === 'sqlite') {
    const pg = await getPool();
    const db = pg._db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS couples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        couple_id INTEGER REFERENCES couples(id),
        is_online INTEGER DEFAULT 0,
        last_active TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        couple_id INTEGER UNIQUE NOT NULL REFERENCES couples(id),
        name TEXT DEFAULT '泡泡',
        happiness REAL DEFAULT 70.0,
        hunger REAL DEFAULT 70.0,
        energy REAL DEFAULT 70.0,
        is_sleeping INTEGER DEFAULT 0,
        last_interaction_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        last_stats_update TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        couple_id INTEGER NOT NULL REFERENCES couples(id),
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);
    `);
    console.log('✅ SQLite 数据库初始化完成');
  } else {
    const pgPool = await getPool();
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS couples (
          id SERIAL PRIMARY KEY,
          code VARCHAR(6) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(50) NOT NULL DEFAULT '',
          couple_id INTEGER REFERENCES couples(id),
          is_online BOOLEAN DEFAULT FALSE,
          last_active TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS pets (
          id SERIAL PRIMARY KEY,
          couple_id INTEGER UNIQUE NOT NULL REFERENCES couples(id),
          name VARCHAR(50) DEFAULT '泡泡',
          happiness REAL DEFAULT 70.0,
          hunger REAL DEFAULT 70.0,
          energy REAL DEFAULT 70.0,
          is_sleeping BOOLEAN DEFAULT FALSE,
          last_interaction_at TIMESTAMP DEFAULT NOW(),
          last_stats_update TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS interactions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          couple_id INTEGER NOT NULL REFERENCES couples(id),
          user_name VARCHAR(50) NOT NULL,
          action VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid VARCHAR NOT NULL PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);
      `);
    console.log('✅ PostgreSQL 数据库初始化完成');
  }
}

module.exports = { getPool, getPoolSync, getDbType, initDB };
