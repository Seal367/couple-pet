const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 数据库连接 ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ========== 中间件 ==========
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 会话管理
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 天
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// ========== 数据库初始化 ==========
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
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
    `);
    console.log('✅ 数据库初始化完成');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ========== 认证中间件 ==========
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '请先登录 💕' });
  }
  next();
}

// ========== 工具函数 ==========

function generateCoupleCode() {
  // 生成 6 位大写字母/数字的组合，容易口述
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getUserDisplayName(userId) {
  const result = await pool.query('SELECT display_name FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.display_name || '小可爱';
}

// 计算属性衰减（离线期间也要算）
async function updatePetStats(coupleId) {
  const pet = await pool.query('SELECT * FROM pets WHERE couple_id = $1', [coupleId]);
  if (pet.rows.length === 0) return;

  const p = pet.rows[0];
  const now = new Date();
  const lastUpdate = new Date(p.last_stats_update);
  const minutesPassed = (now - lastUpdate) / (1000 * 60);

  if (minutesPassed < 1) return; // 太频繁不衰减

  // 每 5 分钟衰减系数
  const hungerDecay = minutesPassed * 0.25;
  const happyDecay = minutesPassed * 0.18;
  const energyChange = p.is_sleeping
    ? -minutesPassed * 0.4   // 睡觉恢复精力
    : minutesPassed * 0.22;   // 醒着消耗

  await pool.query(
    `UPDATE pets SET
      hunger = GREATEST(0, ROUND((hunger - $1)::numeric, 1)),
      happiness = GREATEST(0, ROUND((happiness - $2)::numeric, 1)),
      energy = GREATEST(0, LEAST(100, ROUND((energy - $3)::numeric, 1))),
      last_stats_update = NOW()
    WHERE couple_id = $4`,
    [hungerDecay, happyDecay, energyChange, coupleId]
  );
}

async function recordInteraction(userId, coupleId, action) {
  const name = await getUserDisplayName(userId);
  await pool.query(
    'INSERT INTO interactions (user_id, couple_id, user_name, action) VALUES ($1, $2, $3, $4)',
    [userId, coupleId, name, action]
  );
  // 更新宠物最后互动时间
  await pool.query(
    'UPDATE pets SET last_interaction_at = NOW() WHERE couple_id = $1',
    [coupleId]
  );
}

// ========== 🙋 认证接口 ==========

// 注册
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2) {
      return res.status(400).json({ error: '用户名至少 2 个字符' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密码至少 4 个字符' });
    }

    const hash = await bcrypt.hash(password, 10);
    const code = generateCoupleCode();

    // 在一个事务中创建伴侣组、用户和宠物
    const result = await pool.query(
      `WITH new_couple AS (
        INSERT INTO couples (code) VALUES ($1) RETURNING id
      )
      INSERT INTO users (username, password_hash, display_name, couple_id)
      VALUES ($2, $3, $4, (SELECT id FROM new_couple))
      RETURNING id, display_name, couple_id`,
      [code, username, hash, displayName || username]
    );

    const user = result.rows[0];

    // 创建宠物
    await pool.query(
      'INSERT INTO pets (couple_id, name) VALUES ($1, $2)',
      [user.couple_id, '泡泡']
    );

    req.session.userId = user.id;
    req.session.coupleId = user.couple_id;

    res.json({
      success: true,
      user: { id: user.id, name: user.display_name },
      coupleCode: code,
      message: `🎉 注册成功！这是你们的伴侣码：${code}，分享给 TA 来连接你们的小世界吧！`,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: '这个用户名已经被用啦，换一个吧 🥺' });
    }
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败了，稍后再试试吧~' });
  }
});

// 登录
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      'SELECT id, password_hash, display_name, couple_id FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '用户名或密码不对哦 🤔' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: '用户名或密码不对哦 🤔' });
    }

    // 更新在线状态
    await pool.query('UPDATE users SET is_online = TRUE, last_active = NOW() WHERE id = $1', [user.id]);

    req.session.userId = user.id;
    req.session.coupleId = user.couple_id;

    res.json({
      success: true,
      user: { id: user.id, name: user.display_name },
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败了，稍后再试试吧~' });
  }
});

// 连接伴侣（输入伴侣码）
app.post('/api/link', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.length !== 6) {
      return res.status(400).json({ error: '伴侣码是 6 位字符哦' });
    }

    const codeUpper = code.toUpperCase();

    // 查找伴侣组
    const coupleResult = await pool.query('SELECT id FROM couples WHERE code = $1', [codeUpper]);
    if (coupleResult.rows.length === 0) {
      return res.status(404).json({ error: '这个伴侣码不存在，检查一下有没有输错？' });
    }

    const coupleId = coupleResult.rows[0].id;

    // 检查是否已经有 2 个人了
    const memberCount = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE couple_id = $1',
      [coupleId]
    );
    if (parseInt(memberCount.rows[0].count) >= 2) {
      return res.status(400).json({ error: '这个小世界已经有两个人了，不能再加入了 🌸' });
    }

    // 关联用户到伴侣组
    await pool.query('UPDATE users SET couple_id = $1 WHERE id = $2', [coupleId, req.session.userId]);
    req.session.coupleId = coupleId;

    // 确保有宠物
    const petCheck = await pool.query('SELECT id FROM pets WHERE couple_id = $1', [coupleId]);
    if (petCheck.rows.length === 0) {
      await pool.query('INSERT INTO pets (couple_id) VALUES ($1)', [coupleId]);
    }

    res.json({ success: true, message: '💕 连接成功！你们的小世界完整了！' });
  } catch (err) {
    console.error('连接失败:', err);
    res.status(500).json({ error: '连接失败了，稍后再试试吧~' });
  }
});

// 登出
app.post('/api/logout', (req, res) => {
  if (req.session.userId) {
    pool.query('UPDATE users SET is_online = FALSE WHERE id = $1', [req.session.userId]).catch(() => {});
  }
  req.session.destroy();
  res.json({ success: true });
});

// 获取当前用户信息
app.get('/api/me', async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  try {
    // 更新在线状态
    await pool.query('UPDATE users SET is_online = TRUE, last_active = NOW() WHERE id = $1', [req.session.userId]);

    const result = await pool.query(
      `SELECT u.id, u.display_name as name, u.couple_id,
        (SELECT display_name FROM users WHERE couple_id = u.couple_id AND id != u.id LIMIT 1) as partner_name,
        (SELECT COUNT(*) FROM users WHERE couple_id = u.couple_id)::int as member_count
      FROM users u WHERE u.id = $1`,
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ user: null });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.json({ user: null });
  }
});

// ========== 🐾 宠物接口 ==========

// 获取宠物状态
app.get('/api/pet', requireAuth, async (req, res) => {
  try {
    await updatePetStats(req.session.coupleId);

    const result = await pool.query(
      `SELECT p.*,
        (SELECT display_name FROM users WHERE id = $1) as my_name,
        (SELECT display_name FROM users WHERE couple_id = p.couple_id AND id != $1 LIMIT 1) as partner_name
      FROM pets p WHERE p.couple_id = $2`,
      [req.session.userId, req.session.coupleId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '宠物还没出生呢 🥺' });
    }

    const pet = result.rows[0];
    res.json({
      id: pet.id,
      name: pet.name,
      happiness: Math.round(Math.max(0, pet.happiness)),
      hunger: Math.round(Math.max(0, pet.hunger)),
      energy: Math.round(Math.max(0, pet.energy)),
      is_sleeping: pet.is_sleeping,
      myName: pet.my_name,
      partnerName: pet.partner_name,
      lastInteractionAt: pet.last_interaction_at,
    });
  } catch (err) {
    console.error('获取宠物状态失败:', err);
    res.status(500).json({ error: '获取宠物状态失败' });
  }
});

// 🍼 喂食
app.post('/api/pet/feed', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE pets SET
        hunger = LEAST(100, ROUND((hunger + 18)::numeric, 1)),
        happiness = LEAST(100, ROUND((happiness + 3)::numeric, 1)),
        is_sleeping = FALSE
      WHERE couple_id = $1`,
      [req.session.coupleId]
    );
    await recordInteraction(req.session.userId, req.session.coupleId, 'feed');
    const name = await getUserDisplayName(req.session.userId);
    res.json({ message: `${name} 喂了泡泡 🍼`, success: true });
  } catch (err) {
    console.error('喂食失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 🤚 摸摸
app.post('/api/pet/pet', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE pets SET
        happiness = LEAST(100, ROUND((happiness + 12)::numeric, 1)),
        is_sleeping = FALSE
      WHERE couple_id = $1`,
      [req.session.coupleId]
    );
    await recordInteraction(req.session.userId, req.session.coupleId, 'pet');
    const name = await getUserDisplayName(req.session.userId);
    res.json({ message: `${name} 摸了摸泡泡 💕`, success: true });
  } catch (err) {
    console.error('摸摸失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 🎾 玩耍
app.post('/api/pet/play', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE pets SET
        happiness = LEAST(100, ROUND((happiness + 10)::numeric, 1)),
        energy = GREATEST(0, ROUND((energy - 12)::numeric, 1)),
        is_sleeping = FALSE
      WHERE couple_id = $1`,
      [req.session.coupleId]
    );
    await recordInteraction(req.session.userId, req.session.coupleId, 'play');
    const name = await getUserDisplayName(req.session.userId);
    res.json({ message: `${name} 和泡泡玩了一会儿 🎉`, success: true });
  } catch (err) {
    console.error('玩耍失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 😴 睡觉/叫醒
app.post('/api/pet/sleep', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT is_sleeping FROM pets WHERE couple_id = $1',
      [req.session.coupleId]
    );
    const isSleeping = !result.rows[0].is_sleeping;
    await pool.query(
      'UPDATE pets SET is_sleeping = $1 WHERE couple_id = $2',
      [isSleeping, req.session.coupleId]
    );
    await recordInteraction(
      req.session.userId,
      req.session.coupleId,
      isSleeping ? 'sleep' : 'wake'
    );
    res.json({ is_sleeping: isSleeping, success: true });
  } catch (err) {
    console.error('睡觉操作失败:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取最近的互动记录
app.get('/api/interactions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_name, action,
        to_char(created_at, 'HH24:MI') as time,
        (created_at + INTERVAL '8 hours') as local_time
      FROM interactions
      WHERE couple_id = $1
      ORDER BY created_at DESC LIMIT 30`,
      [req.session.coupleId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('获取互动记录失败:', err);
    res.status(500).json({ error: '获取互动记录失败' });
  }
});

// 检查伴侣在线状态
app.get('/api/partner', requireAuth, async (req, res) => {
  try {
    // 超时 30 秒算离线
    const result = await pool.query(
      `SELECT display_name as name, is_online,
        (EXTRACT(EPOCH FROM (NOW() - last_active)) < 10) as recently_active
      FROM users
      WHERE couple_id = (SELECT couple_id FROM users WHERE id = $1)
        AND id != $1
      LIMIT 1`,
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ online: false, name: null });
    }

    const partner = result.rows[0];
    res.json({
      name: partner.name,
      online: partner.is_online && partner.recently_active,
    });
  } catch (err) {
    console.error('获取伴侣状态失败:', err);
    res.json({ online: false, name: null });
  }
});

// ========== 🚀 启动 ==========

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`\n🌟 电子宠物服务器启动成功！`);
      console.log(`  地址: http://localhost:${PORT}`);
      console.log(`  模式: ${process.env.NODE_ENV || 'development'}\n`);
    });
  } catch (err) {
    console.error('❌ 服务器启动失败:', err.message);
    process.exit(1);
  }
}

start();
