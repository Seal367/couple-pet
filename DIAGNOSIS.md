# Diagnosis: Vercel → 腾讯云 CloudBase 迁移分析

## Current Architecture

```
Browser (China, blocked) → Vercel (blocked by GFW) → Supabase PostgreSQL (AWS Tokyo)
         ❌ 国内用户无法访问              ✅ 但数据库可服务端直连
```

- **前端**: 纯 HTML/CSS/JS（无框架、无打包器），由 Express 静态托管
- **后端**: Express 4.x，15 个 REST API 路由，session-based 认证
- **数据库**: Supabase PostgreSQL（通过 `pg.Pool` 直连，无 Supabase 专有功能依赖）
- **会话**: `express-session` + `connect-pg-simple`（session 存在 PostgreSQL）
- **部署入口**: Vercel 用 `api/index.js`（serverless handler），本地用 `server.js`

## Root Cause / Gap

当前应用无法在中国大陆访问，需要迁移到腾讯云 CloudBase。核心迁移路径：Express 容器化 → CloudBase Cloud Run（云托管）。数据库保持 Supabase PostgreSQL（服务端到服务端，不受 GFW 影响）。

### 🔴 关键发现：用户 SDK 模板与项目实际不匹配

用户提供的前端接入指引基于 **Vite 项目**（`import.meta.env.VITE_*`），但本项目是**纯 vanilla JS**（无打包器，`<script src="app.js">` 直接加载）。不能直接照搬模板代码，需要适配。

## Project Structure Analysis

### Frontend
- **Framework**: 无框架，纯 HTML + CSS + vanilla JS
- **Bundler**: **无** (no Vite, no Webpack)
- **API calls**: `fetch('/api/*')` 相对路径 + `credentials: 'same-origin'`
- **Auth**: session cookie（`express-session`），非 JWT，非 OAuth
- **SDK integration approach**: 由于无打包器，`@cloudbase/js-sdk` 不能通过 `import`/`npm` 方式使用。必须用 **CDN script 标签**加载：
  ```html
  <script src="https://imgcache.qq.com/qcloud/tcbjs/latest/tcb.js"></script>
  ```
  加载后 `window.cloudbase` 全局可用（注意命名是 `cloudbase` 不是 `tcb`，需验证 CDN 版本的全局变量名）。

### Backend
- **Entry point**: `server.js`（Express + `app.listen(3000)`）
- **Vercel handler**: `api/index.js`（仅用于 Vercel，迁移后不再需要）
- **Database**: PostgreSQL via `pg.Pool`，连接 Supabase。`db.js` 支持 PG + SQLite 双模式
- **Sessions**: PostgreSQL 存储，`connect-pg-simple`
- **CloudBase Node SDK 必要性**: 如果仅用 Cloud Run 运行 Express 容器，**Node SDK 不是必需的**（Express 本身就是一个完整的 HTTP 服务器）。但用户明确要求添加，可能在后续计划中会用到 CloudBase 的其他服务（Auth、云函数等）

### Key Discoveries

1. **无打包器**: `index.html:187` → `<script src="app.js"></script>`，纯文件引入。所有 JS 代码在 `public/app.js` 这一个文件中（1044 行）
2. **单进程自包含**: Express 既托管前端静态文件又提供 API，非常适合 Docker 容器化
3. **数据库不变**: `db.js` 无需任何修改。Supabase 连接从 CloudBase 容器出网不会被 GFW 拦截（服务端流量）
4. **session 需要 SESSION_SECRET**: 当前 `server.js:31` 用 `crypto.randomBytes(32).toString('hex')` 作为 fallback。在 Cloud Run 上每个实例生成不同密钥会导致 session 不共享。**必须设置 SESSION_SECRET 环境变量**
5. **Vercel 残留文件**: `vercel.json`、`api/index.js`、`render.yaml` 迁移后可以删除或保留
6. **无 `.env` 文件**: 项目目前没有 `.env` 文件，环境变量靠运行环境注入。需要添加 `.env` 用于本地开发，配合 `dotenv`

## Affected Files

| File | Role | Change Needed? | What Change |
|------|------|---------------|-------------|
| `package.json` | 依赖和脚本 | **Yes** | 添加 `@cloudbase/node-sdk`、`dotenv` 依赖 |
| `server.js` | Express 入口 | **Yes** | 顶部加 `require('dotenv').config()`，添加 CloudBase SDK 初始化（可选） |
| `public/index.html` | 前端入口 HTML | **Yes** | 添加 CloudBase JS SDK CDN script 标签 |
| `public/app.js` | 前端逻辑 | **Maybe** | 如果要用匿名登录，添加 CloudBase 初始化代码 |
| `vercel.json` | Vercel 配置 | **No** | 保留不删，不影响 |
| `api/index.js` | Vercel handler | **No** | 保留不删，不影响 |
| `db.js` | 数据库适配 | **No** | 不变，继续连 Supabase |
| `session-store.js` | Session 存储 | **No** | 不变 |
| **NEW** `Dockerfile` | 容器镜像定义 | **Yes** | 新增，用于 CloudBase Cloud Run |
| **NEW** `.env` | 环境变量 | **Yes** | 新增，本地开发用（不提交到 git） |
| **NEW** `.env.example` | 环境变量模板 | **Yes** | 新增，提交到 git 供参考 |
| **NEW** `.dockerignore` | Docker 排除规则 | **Yes** | 新增 |
| **NEW** `cloudbase.js` | CloudBase SDK 初始化模块 | **Yes** | 新增，供 server.js require |

## Unclear Items (needs user clarification)

1. **JS SDK 的使用目的**: 前端添加 CloudBase JS SDK 的目的是什么？
   - 如果只是想让前端"知道"它在 CloudBase 环境 → CDN 加载 + 初始化即可
   - 如果要用**匿名登录**（代替现有 session 认证）→ 需要较大的后端改动
   - 如果要用 CloudBase 的**数据库/存储** → 目前不适用（数据在 PostgreSQL）

2. **Node SDK 的使用目的**: 后端添加 Node SDK 后具体要做什么？
   - 如果只是初始化一个 `cloudbase` 对象供未来使用 → 简单
   - 如果需要用 CloudBase Auth 验证前端匿名登录 → 需要改认证中间件
   
3. **部署方式确认**: 用户之前选了"方案B CloudBase Cloud Run（云托管）"，这是容器托管服务。但也有"方案A CloudBase 原生"（用 CloudBase 的云函数 + 数据库）。当前诊断假设方案 B，如果实际用方案 A，需要大幅重写后端。

## Confidence
**Medium** — 项目现状完全清楚（已完整读取所有文件），但不清楚用户对 SDK 的具体使用意图。默认假设：将应用整体迁移到 Cloud Run，SDK 作为增强（非核心依赖），保持现有架构和数据库不变。
