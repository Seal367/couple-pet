---
title: "Couple Pet Database / 数据库设计"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [database, postgresql, schema, supabase]
aliases: [pet-database, 泡泡数据库]
summary: "PostgreSQL schema for Couple Pet: 5 tables (couples, users, pets, interactions, user_sessions) with cascade relationships and time-based stat decay."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-architecture, couple-pet-api, couple-pet-pet-mechanics]
---

# Couple Pet Database / 数据库设计

## Definition / 定义

Couple Pet 使用 PostgreSQL（托管在 Supabase）存储所有持久化数据。数据库包含 5 张表，通过 `couple_id` 外键建立核心关联链：`couples → users → pets/interactions`。Session 数据也存储在 PostgreSQL 中（通过 `connect-pg-simple`）。

## Entity Relationship Diagram / 实体关系图

```
┌──────────┐
│ couples  │  1 对 1 伴侣码，2 人共享
│──────────│
│ id (PK)  │◄──────────────────────┐
│ code (U) │  6-char unique code   │
│ created  │                        │
└──────────┘                        │
       │                            │
       │ 1:N                        │ 1:1 (FK reference)
       ▼                            │
┌──────────────┐                    │
│    users     │  2 users/couple    │
│──────────────│                    │
│ id (PK)      │                    │
│ username (U) │  login name       │
│ password_hash│  bcrypt hash       │
│ display_name │  shown in UI      │
│ couple_id FK │────────────────────┘
│ is_online    │  boolean flag
│ last_active  │  timestamp
│ created      │
└──────┬───────┘
       │
       │ 1:1 (shared couple_id)
       ▼
┌──────────────┐         ┌──────────────────┐
│     pets     │         │  interactions     │
│──────────────│         │──────────────────│
│ id (PK)      │         │ id (PK)          │
│ couple_id(U) │◄────────│ couple_id FK      │
│ name         │         │ user_id FK        │
│ happiness    │ REAL    │ user_name         │
│ hunger       │ REAL    │ action  VARCHAR   │
│ energy       │ REAL    │ created_at        │
│ is_sleeping  │ BOOL    └──────────────────┘
│ last_interact│
│ last_stats   │         ┌──────────────────┐
│ created      │         │  user_sessions    │
└──────────────┘         │──────────────────│
                         │ sid (PK)         │
                         │ sess (JSON)      │
                         │ expire (TIMESTMP) │
                         └──────────────────┘
```

## Table Definitions / 表定义

### `couples` — 伴侣组

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Auto-increment ID |
| `code` | VARCHAR(6) | UNIQUE, NOT NULL | 6-character couple code (excludes I,O,0,1) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation time |

**Purpose**: Each registered user creates a new `couples` row. The second user links to the same row via partner code.

### `users` — 用户

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | User ID |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Login username |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt hash (10 salt rounds) |
| `display_name` | VARCHAR(50) | DEFAULT '' | Display name shown in UI |
| `couple_id` | INTEGER | REFERENCES couples(id) | FK to couples table |
| `is_online` | BOOLEAN | DEFAULT FALSE | Online status flag |
| `last_active` | TIMESTAMP | DEFAULT NOW() | Last activity heartbeat |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Registration time |

**Constraints**:
- Max 2 users per `couple_id` enforced at application level ([[couple-pet-api]] `/api/link`)
- Username must be ≥ 2 characters (validated server-side)
- Password must be ≥ 4 characters (validated server-side)

### `pets` — 宠物

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Pet ID |
| `couple_id` | INTEGER | UNIQUE, NOT NULL, REFERENCES couples(id) | One pet per couple |
| `name` | VARCHAR(50) | DEFAULT '泡泡' | Pet name |
| `happiness` | REAL | DEFAULT 70.0 | Happiness level (0–100) |
| `hunger` | REAL | DEFAULT 70.0 | Satiety level (0–100) |
| `energy` | REAL | DEFAULT 70.0 | Energy level (0–100) |
| `is_sleeping` | BOOLEAN | DEFAULT FALSE | Sleep state |
| `last_interaction_at` | TIMESTAMP | DEFAULT NOW() | Last user interaction time |
| `last_stats_update` | TIMESTAMP | DEFAULT NOW() | Last stat decay calculation |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Pet creation time |

**Three core stats**: All start at 70.0, range 0–100. See [[couple-pet-pet-mechanics]] for decay formulas.

### `interactions` — 互动记录

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | SERIAL | PRIMARY KEY | Record ID |
| `user_id` | INTEGER | NOT NULL, REFERENCES users(id) | Actor |
| `couple_id` | INTEGER | NOT NULL, REFERENCES couples(id) | Couple group |
| `user_name` | VARCHAR(50) | NOT NULL | Denormalized display name (faster reads) |
| `action` | VARCHAR(20) | NOT NULL | Action type: feed/pet/play/sleep/wake |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Interaction time |

**Design note**: `user_name` is denormalized (copied from `users.display_name`) to avoid a JOIN when rendering the activity feed.

### `user_sessions` — 会话存储

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sid` | VARCHAR | PRIMARY KEY | Session ID (from express-session) |
| `sess` | JSON | NOT NULL | Session data (serialized) |
| `expire` | TIMESTAMP(6) | NOT NULL | Session expiration time |

**Managed by**: `connect-pg-simple` library. Created automatically via `createTableIfMissing: true` in Vercel adapter.

## Database Initialization / 数据库初始化

Both `server.js` and `api/index.js` call `initDB()` on startup, which executes:

```sql
CREATE TABLE IF NOT EXISTS couples ( ... );
CREATE TABLE IF NOT EXISTS users ( ... );
CREATE TABLE IF NOT EXISTS pets ( ... );
CREATE TABLE IF NOT EXISTS interactions ( ... );
CREATE TABLE IF NOT EXISTS user_sessions ( ... );  -- server.js only
```

In Vercel serverless mode (`api/index.js`), `initDB()` is called lazily on the first request, guarded by an `initialized` boolean flag to avoid repeated schema checks on subsequent invocations.

## Connection Pool Configuration / 连接池配置

| Environment | Settings |
|-------------|----------|
| **Render** (server.js) | Default pool settings, `ssl: { rejectUnauthorized: false }` in production |
| **Vercel** (api/index.js) | `max: 5`, `connectionTimeoutMillis: 10000`, `ssl: { rejectUnauthorized: false }`, IPv4 forced |

**IPv4 workaround** (commit `c9ab7fc`): `dns.setDefaultResultOrder('ipv4first')` is called in `api/index.js` because Vercel's IPv6-first DNS resolution failed to connect to Supabase.

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-architecture]] — 整体架构
- [[couple-pet-api]] — 如何使用这些表
- [[couple-pet-pet-mechanics]] — pets 表的属性如何变化

## References / 参考资料

- `server.js:42-98` — `initDB()` function and schema definitions
- `api/index.js:44-90` — Vercel adapter's `initDB()`
- `server.js:15-18` — Pool creation (standalone)
- `api/index.js:15-20` — Pool creation (serverless, with IPv4 fix)
