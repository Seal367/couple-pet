---
title: "Couple Pet API / 接口设计"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [api, rest, express, endpoints]
aliases: [pet-api, 泡泡接口]
summary: "RESTful JSON API with 10 endpoints: 4 auth routes + 6 pet/interaction routes. Session-based auth via express-session with PostgreSQL store."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-architecture, couple-pet-database, couple-pet-pet-mechanics]
---

# Couple Pet API / 接口设计

## Definition / 定义

Couple Pet 提供 10 个 RESTful JSON API 端点，分为认证组（4 个）和宠物组（6 个）。所有宠物相关接口需要通过 session 认证（`requireAuth` 中间件）。Session 存储在 PostgreSQL 中，过期时间为 30 天。

## Authentication / 认证机制

```
Request → express-session (cookie: connect.sid) → PgSession (PostgreSQL lookup)
         → req.session.userId / req.session.coupleId
         → requireAuth middleware (401 if missing)
```

- Session cookie lifetime: 30 days
- `httpOnly: true` — not accessible from JavaScript
- `secure: true` in production (HTTPS only)
- `sameSite: 'lax'` — CSRF protection
- `saveUninitialized: false` — only create sessions for logged-in users

## API Endpoints / 接口列表

### 🔐 Auth Endpoints

#### `POST /api/register` — 注册新用户

```
Body: { username: string, password: string, displayName?: string }
```

**Process**:
1. Validate: username ≥ 2 chars, password ≥ 4 chars
2. Hash password with bcrypt (10 rounds)
3. Generate 6-char couple code
4. INSERT into `couples`, `users`, `pets` (transaction via CTE)
5. Set session (auto-login after register)

**Response**:
```json
{
  "success": true,
  "user": { "id": 1, "name": "小明" },
  "coupleCode": "XK7MNP",
  "message": "🎉 注册成功！伴侣码: XK7MNP"
}
```

**Error cases**:
- `400`: Empty username/password, too short username/password
- `400`: Username already taken (`code: '23505'` — PostgreSQL unique violation)

#### `POST /api/login` — 登录

```
Body: { username: string, password: string }
```

**Process**:
1. Look up user by username
2. Compare bcrypt hash
3. Set `is_online = TRUE`, `last_active = NOW()`
4. Create session

**Error cases**:
- `401`: Wrong username or password (same message for both — prevents user enumeration)

#### `POST /api/link` — 连接伴侣 🔐

```
Body: { code: string }   // 6-char couple code
```

**Process**:
1. Validate code length = 6
2. Uppercase the code and look up `couples` table
3. Check member count < 2
4. Update user's `couple_id`
5. Ensure pet exists for this couple

**Error cases**:
- `400`: Code not 6 chars / couple already has 2 members
- `404`: Code not found

#### `POST /api/logout` — 登出

**Process**:
1. Set `is_online = FALSE` (fire-and-forget — `.catch(() => {})`)
2. Destroy session

### 🐾 Pet Endpoints

All pet endpoints are protected by `requireAuth` middleware.

#### `GET /api/pet` — 获取宠物状态 🔐

**Process**:
1. Call `updatePetStats()` — apply time-based stat decay
2. Query pet + my display name + partner display name

**Response**:
```json
{
  "id": 1,
  "name": "泡泡",
  "happiness": 65,
  "hunger": 58,
  "energy": 72,
  "is_sleeping": false,
  "myName": "小明",
  "partnerName": "小红",
  "lastInteractionAt": "2026-07-25T10:30:00.000Z"
}
```

#### `POST /api/pet/feed` — 喂食 🔐

| Stat | Change |
|------|--------|
| hunger | +18 (capped at 100) |
| happiness | +3 (capped at 100) |
| is_sleeping | set to FALSE |

**Response**: `{ message: "小明 喂了泡泡 🍼", success: true }`

#### `POST /api/pet/pet` — 摸摸 🔐

| Stat | Change |
|------|--------|
| happiness | +12 (capped at 100) |
| is_sleeping | set to FALSE |

**Response**: `{ message: "小明 摸了摸泡泡 💕", success: true }`

#### `POST /api/pet/play` — 玩耍 🔐

| Stat | Change |
|------|--------|
| happiness | +10 (capped at 100) |
| energy | -12 (floored at 0) |
| is_sleeping | set to FALSE |

**Response**: `{ message: "小明 和泡泡玩了一会儿 🎉", success: true }`

#### `POST /api/pet/sleep` — 切换睡眠 🔐

**Toggle behavior**: If currently sleeping → wake up. If awake → go to sleep.

**Response**: `{ is_sleeping: true, success: true }` (new state)

#### `GET /api/interactions` — 互动记录 🔐

**Returns**: Array of recent 30 interactions, ordered by `created_at DESC`.

```json
[
  {
    "user_name": "小明",
    "action": "feed",
    "time": "18:35"
  }
]
```

Time is formatted as `HH24:MI` via PostgreSQL `to_char()`.

#### `GET /api/partner` — 伴侣在线状态 🔐

**Online determination**: `is_online = TRUE` AND `last_active` within last 10 seconds.

```json
{ "name": "小红", "online": true }
// or
{ "online": false, "name": null }
```

## Interaction Actions / 互动类型

| Action Value | Display | Trigger |
|-------------|---------|---------|
| `feed` | 🍼 喂了泡泡 | POST /api/pet/feed |
| `pet` | 🤚 摸了摸泡泡 | POST /api/pet/pet |
| `play` | 🎾 和泡泡玩耍 | POST /api/pet/play |
| `sleep` | 😴 哄泡泡睡觉 | POST /api/pet/sleep (going to sleep) |
| `wake` | 🌞 叫醒了泡泡 | POST /api/pet/sleep (waking up) |

## Error Handling Pattern / 错误处理

All endpoints follow the same pattern:

```js
try {
  // ... business logic ...
  res.json({ success: true, ... });
} catch (err) {
  console.error('...', err);
  res.status(500).json({ error: '用户友好的中文消息' });
}
```

- Validation errors return 400
- Auth errors return 401
- Not found errors return 404
- Server errors return 500 with generic Chinese message
- Passwords are never echo'd in error messages

## Test Suite / 测试套件

`test-api.sh` provides 14 test cases covering:
- Register → Login → Get me → Get pet → Feed → Pet → Play → Sleep → Wake → Interactions → Partner → Logout → Post-logout verification
- Edge cases: empty username rejection, wrong password rejection

Uses `curl` with cookie jar (`-b`/`-c` flags) for session persistence. Supports `jq` for JSON validation or falls back to `grep`.

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-architecture]] — 请求处理流程
- [[couple-pet-database]] — 表结构与查询
- [[couple-pet-pet-mechanics]] — 宠物属性变化逻辑
- [[couple-pet-frontend]] — 前端如何调用这些 API

## References / 参考资料

- `server.js:169-508` — All API route handlers
- `api/index.js:147-346` — Vercel adapter route handlers (duplicated)
- `test-api.sh:1-256` — API test suite
- `public/app.js:60-73` — Frontend API helpers (`apiPost`, `apiGet`)
