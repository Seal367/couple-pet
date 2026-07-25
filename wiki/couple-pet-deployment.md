---
title: "Couple Pet Deployment / 部署配置"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [deployment, render, vercel, serverless, hosting]
aliases: [pet-deployment, 泡泡部署]
summary: "Dual-platform deployment: Render (primary, long-running Express server) and Vercel (alternative, serverless function). PostgreSQL via Supabase with IPv4 DNS workaround."
confidence: high
related_concepts: [couple-pet-overview, couple-pet-architecture]
---

# Couple Pet Deployment / 部署配置

## Definition / 定义

Couple Pet 支持两种部署方式：Render（长期运行 Web Service）和 Vercel（Serverless Function）。两种模式共享同一个 Supabase PostgreSQL 数据库。项目通过 `render.yaml` 和 `vercel.json` 分别声明两套部署配置。

## Platform Comparison / 平台对比

| Aspect | Render | Vercel |
|--------|--------|--------|
| Type | Web Service (long-running) | Serverless Function |
| Entry point | `server.js` (calls `app.listen()`) | `api/index.js` (exports handler) |
| Static files | `express.static('public/')` | `vercel.json` routes to `public/` |
| DB init | At startup (`start()` → `initDB()`) | Lazy, on first request |
| Cold start | N/A (always running) | ~200-500ms per invocation |
| Region | Singapore (`region: singapore`) | Auto (nearest edge) |
| Plan | Free tier | Free tier (256MB, 10s max) |
| Session secret | Auto-generated (`generateValue: true`) | From `SESSION_SECRET` env var |

## Render Configuration / Render 配置

File: `render.yaml`

```yaml
services:
  - type: web
    name: couple-pet
    env: node
    region: singapore
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false           # Manually set in Render dashboard
      - key: SESSION_SECRET
        generateValue: true   # Auto-generate random secret
```

**Key details**:
- `region: singapore` — Close to Supabase's Singapore region for low latency
- `sync: false` for `DATABASE_URL` — Connection string is set manually (contains sensitive credentials)
- `generateValue: true` for `SESSION_SECRET` — Render auto-generates and persists a random secret

## Vercel Configuration / Vercel 配置

File: `vercel.json`

```json
{
  "buildCommand": null,
  "outputDirectory": "public",
  "functions": {
    "api/index.js": {
      "memory": 256,
      "maxDuration": 10
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "api/index.js" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

**Route resolution**:
1. `/api/*` → `api/index.js` (Express handler as serverless function)
2. `/*` → Static files from `public/` directory

**Serverless adapter code** (`api/index.js`):

```js
let initialized = false;

async function handler(req, res) {
  if (!initialized) {
    await initDB();
    initialized = true;
  }
  app(req, res);  // Express app as request handler
}

module.exports = handler;
```

**Key differences from `server.js`**:
- No `app.listen()` — Vercel manages HTTP layer
- `createTableIfMissing: true` for session store (Vercel cold starts may lose table)
- `max: 5` pool connections (serverless needs connection limiting)
- `connectionTimeoutMillis: 10000` (generous timeout for cold starts)
- `dns.setDefaultResultOrder('ipv4first')` — Critical fix for Supabase connectivity

## DNS Fix / DNS 修复

**Problem**: Vercel's serverless environment uses IPv6-first DNS resolution. Supabase PostgreSQL connections failed because the hostname resolved to an unreachable IPv6 address.

**Fix** (commit `c9ab7fc`):
```js
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
```

This forces Node.js to prefer IPv4 addresses when resolving hostnames, allowing connections to Supabase's IPv4-only PostgreSQL endpoints.

## Environment Variables / 环境变量

| Variable | Required | Purpose | Set In |
|----------|----------|---------|--------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string (Supabase) | Both platforms |
| `SESSION_SECRET` | Recommended | Session signing key | Both platforms |
| `NODE_ENV` | Auto-set | `production` triggers SSL, secure cookies | Both platforms |
| `PORT` | Optional | Server port (default: 3000) | Render only |

## Database / 数据库

- **Provider**: [Supabase](https://supabase.com) PostgreSQL
- **Connection format**: `postgresql://user:password@host:6543/postgres`
- **SSL**: Required in production (`rejectUnauthorized: false` for Supabase's self-signed cert)
- **Pool size**: Default on Render, max 5 on Vercel

**Initialization**: Schema is created automatically via `CREATE TABLE IF NOT EXISTS` — no manual migration needed.

## Local Development / 本地开发

```bash
npm install
export DATABASE_URL=postgresql://...
npm start       # node server.js
# or
npm run dev     # node --watch server.js (auto-restart)
```

**Testing**:
```bash
./test-api.sh                    # Test against localhost:3000
./test-api.sh http://localhost:8080  # Test against custom URL
node test-db.js                  # Test database connectivity only
```

## Related Concepts / 相关概念

- [[couple-pet-overview]] — 项目概览
- [[couple-pet-architecture]] — 两种部署模式的架构对比
- [[couple-pet-database]] — 数据库连接配置

## References / 参考资料

- `render.yaml:1-16` — Render Blueprint config
- `vercel.json:1-14` — Vercel routing config
- `api/index.js:1-11` — Serverless adapter imports and DNS fix
- `api/index.js:350-358` — Lazy init handler
- `package.json:7-8` — npm scripts
- `test-db.js:1-29` — Database connection test tool
