---
title: "Couple Pet Architecture / 架构设计"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [architecture, nodejs, express, serverless, mvvm]
aliases: [pet-architecture, 泡泡架构]
summary: "Client-server architecture with polling sync: vanilla JS frontend ↔ Express REST API ↔ PostgreSQL, deployable as both long-running server and serverless function."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-database, couple-pet-api, couple-pet-frontend, couple-pet-deployment]
---

# Couple Pet Architecture / 架构设计

## Definition / 定义

Couple Pet 采用经典的 **客户端-服务器** 架构，前端为原生 JavaScript 单页应用，后端为 Express RESTful API，数据持久化在 PostgreSQL 中。项目支持两种部署模式：Render 上的长期运行服务器和 Vercel 上的 serverless 函数。

## Architecture Diagram / 架构图

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ index.html│  │  app.js  │  │ style.css         │  │
│  │ (DOM)    │  │ (Logic)  │  │ (Pink theme)      │  │
│  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │                                │
│       │    Canvas 2D  │  Polling (every 3s/10s/15s)  │
│       ▼              ▼                                │
│  ┌──────────────────────────────────────────────┐    │
│  │         Pet Canvas Animation Loop             │    │
│  │  - drawPetBody (radial gradient, eyes, blush) │    │
│  │  - Expression: normal/happy/hungry/sleepy     │    │
│  │  - Particles: hearts, stars, sparkles         │    │
│  │  - Blink timer, float animation               │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (fetch, credentials: same-origin)
                       ▼
┌─────────────────────────────────────────────────────┐
│                 Express API Server                    │
│                                                      │
│  Middleware Pipeline:                                │
│  express.json() → session() → routes                 │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │  Auth Routes          Pet Routes              │    │
│  │  POST /api/register   GET  /api/pet          │    │
│  │  POST /api/login      POST /api/pet/feed     │    │
│  │  POST /api/link       POST /api/pet/pet      │    │
│  │  POST /api/logout     POST /api/pet/play     │    │
│  │  GET  /api/me         POST /api/pet/sleep    │    │
│  │                       GET  /api/interactions │    │
│  │                       GET  /api/partner      │    │
│  └──────────────────────────────────────────────┘    │
│                                                      │
│  Business Logic:                                     │
│  - requireAuth middleware (session check)            │
│  - updatePetStats (time-based stat decay)            │
│  - recordInteraction (action logging)                │
│  - generateCoupleCode (6-char code)                  │
└──────────────────────┬──────────────────────────────┘
                       │ pg (node-postgres)
                       ▼
┌─────────────────────────────────────────────────────┐
│              PostgreSQL (Supabase)                    │
│  Tables: couples, users, pets, interactions,         │
│          user_sessions                                │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions / 关键设计决策

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Vanilla JS (no React/Vue) | Minimal dependencies, fast load, simple to deploy |
| Real-time sync | Polling (3s interval) | No WebSocket complexity; sufficient for pet status |
| Database | PostgreSQL | Required for Supabase hosting; relational model fits the schema |
| Session store | PostgreSQL (connect-pg-simple) | Persists across server restarts; no Redis dependency |
| Dual deployment | Render + Vercel | `server.js` for Render (long-running), `api/index.js` for Vercel (serverless) |
| DNS resolution | `dns.setDefaultResultOrder('ipv4first')` | Fixes Supabase connection issues on Vercel's IPv6 environment |
| Password hashing | bcrypt, salt rounds = 10 | Industry standard; balance of security and performance |
| Couple code chars | Excludes I, O, 0, 1 | Avoids visual ambiguity when sharing codes verbally |

## Deployment Modes / 部署模式

### Mode 1: Render Web Service

`server.js` starts an HTTP listener:

```js
app.listen(PORT, () => { ... });
```

- Standard Express app with `express.static('public')` for static files
- Database initialized once at startup via `initDB()`

### Mode 2: Vercel Serverless Function

`api/index.js` exports a handler:

```js
module.exports = handler;
// handler(req, res) calls app(req, res)
// DB initialized lazily on first request via `initialized` flag
```

- No `app.listen()` — Vercel invokes handler per request
- `vercel.json` routes all `/api/*` to this handler
- Static files served from `public/` directory
- Lazy DB init: `initDB()` runs on first request (guarded by `initialized` boolean)

## Data Flow: Pet Interaction / 数据流示例

```
User taps "喂食" button
  → doAction('feed')
  → POST /api/pet/feed (with session cookie)
  → requireAuth middleware checks session.userId
  → UPDATE pets SET hunger += 18, happiness += 3, is_sleeping = FALSE
  → INSERT INTO interactions (user_id, couple_id, user_name, action='feed')
  → Response: { message: "xx 喂了泡泡 🍼", success: true }
  → Frontend: refreshPetState(), spawnParticles('🍰'), showActionMessage()
  → Partner's browser: picks up change on next polling cycle (3s)
```

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-database]] — 数据库 schema 详解
- [[couple-pet-api]] — 所有 API 端点
- [[couple-pet-frontend]] — 前端详解
- [[couple-pet-deployment]] — 部署配置

## References / 参考资料

- `server.js:1-525` — Standalone server entry point
- `api/index.js:1-361` — Vercel serverless adapter
- `package.json:1-17` — Dependencies and scripts
