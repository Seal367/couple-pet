// session-store.js — Session store for express-session
// Uses connect-pg-simple for PostgreSQL, built-in SQLite store for local dev

function createSessionStore(pool, dbType) {
  if (dbType === 'postgres') {
    const PgSession = require('connect-pg-simple')(require('express-session'));
    return new PgSession({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: false, // 表已在 initDB() 中创建，避免 PgBouncer DDL 兼容问题
      errorLog: (...args) => console.error('[session-store]', ...args),
    });
  }

  // SQLite session store
  const session = require('express-session');
  const Store = session.Store;

  class SQLiteStore extends Store {
    constructor(options) {
      super(options);
      this._db = options.db || pool._db;
      // Ensure sessions table exists
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expire TEXT NOT NULL
        )
      `);
      // Start periodic cleanup
      this._cleanupInterval = setInterval(() => this._cleanup(), 15 * 60 * 1000);
    }

    _cleanup() {
      try {
        this._db.prepare("DELETE FROM user_sessions WHERE expire < datetime('now')").run();
      } catch (e) { /* ignore */ }
    }

    get(sid, callback) {
      try {
        const row = this._db.prepare(
          "SELECT sess FROM user_sessions WHERE sid = ? AND expire >= datetime('now')"
        ).get(sid);
        if (row) {
          if (callback) callback(null, JSON.parse(row.sess));
        } else {
          if (callback) callback(null, null);
        }
      } catch (err) {
        if (callback) callback(err);
      }
    }

    set(sid, session, callback) {
      try {
        const maxAge = session.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
        const expire = new Date(Date.now() + maxAge).toISOString();
        const sess = JSON.stringify(session);
        this._db.prepare(
          'INSERT OR REPLACE INTO user_sessions (sid, sess, expire) VALUES (?, ?, ?)'
        ).run(sid, sess, expire);
        if (callback) callback(null);
      } catch (err) {
        if (callback) callback(err);
      }
    }

    destroy(sid, callback) {
      try {
        this._db.prepare('DELETE FROM user_sessions WHERE sid = ?').run(sid);
        if (callback) callback(null);
      } catch (err) {
        if (callback) callback(err);
      }
    }

    touch(sid, session, callback) {
      try {
        const maxAge = session.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
        const expire = new Date(Date.now() + maxAge).toISOString();
        this._db.prepare(
          'UPDATE user_sessions SET expire = ? WHERE sid = ?'
        ).run(expire, sid);
        if (callback) callback(null);
      } catch (err) {
        if (callback) callback(err);
      }
    }

    close() {
      if (this._cleanupInterval) {
        clearInterval(this._cleanupInterval);
      }
    }
  }

  return new SQLiteStore({ db: pool._db });
}

module.exports = { createSessionStore };
