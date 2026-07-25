# Solution: 方案一 — 最小迁移（推荐）

## Options Considered

### 方案一: 最小迁移 — Cloud Run 容器 + SDK 增强层（推荐）

- **Description**: Express 容器化部署到 CloudBase Cloud Run。前端通过 CDN script 标签加载 JS SDK（适配无打包器），后端添加 Node SDK 和 dotenv。保持 PostgreSQL + session 认证不变。CloudBase SDK 作为平台集成层（用于匿名身份识别、未来扩展）。
- **Complexity**: Low
- **Files touched**: 5-6
- **Pros**:
  - 改动最小，风险最低，当天可上线
  - 不改变认证逻辑、数据库结构、API 接口
  - 前端零 API 改动（仍然是 `fetch('/api/*')`）
  - 以后可以逐步利用 CloudBase 更多服务
- **Cons**:
  - JS SDK 通过 CDN 加载比 npm 多 ~50ms 首屏时间
  - 目前 SDK 的实际业务价值有限（更多是"准备好了"的状态）

### 方案二: 纯 CloudBase 原生（Cloud Functions + CloudBase DB）

- **Description**: 完全重写后端为 CloudBase 云函数（每个 API 路由一个函数），数据库从 PostgreSQL 迁移到 CloudBase 数据库。前端完全使用 JS SDK 访问。
- **Complexity**: High
- **Files touched**: 15+
- **Pros**:
  - 真正的"全栈 CloudBase"，与腾讯云生态深度集成
  - 不需要管理 Docker/容器
  - 数据库国内访问更快
- **Cons**:
  - 完全重写，需要 3-5 天
  - 需要数据迁移（PostgreSQL → CloudBase 数据库 schema 完全不同）
  - SQL 查询全部重写（CloudBase 数据库是 NoSQL/document 模型，不是 SQL）
  - 放弃 Supabase 的 SQL 兼容性

### 方案三: 前后端分离（CloudBase 静态托管 + Cloud Run API）

- **Description**: 前端部署到 CloudBase 静态托管，后端单独部署到 Cloud Run。通过 CloudBase HTTP 访问服务连接。
- **Complexity**: Medium
- **Files touched**: 8-10
- **Pros**:
  - 前端利用 CDN 加速，API 独立扩展
  - 静态资源不走容器，节省 Cloud Run 资源
- **Cons**:
  - 需要配置 CORS（跨域，当前是同源 `same-origin`）
  - session cookie 跨域不可靠
  - 部署复杂度翻倍（管理两个服务）
  - 对于这个小应用，过设计了

## Selected: 方案一 — 最小迁移（推荐）

**Rationale**:
1. **方案三被排除** — session cookie 在同源模式下最可靠，跨域后需要改为 JWT token 认证（额外大改动）
2. **方案二被排除** — 用户明确说使用 PostgreSQL。CloudBase 数据库不支持 SQL，现有 500 行 `db.js`（含复杂 CTE、GREATEST/LEAST、EXTRACT 等 SQL 函数）无法迁移
3. **方案一是唯一可行方案** — 保持应用架构完全不变，CloudBase 仅作为容器运行平台。SDK 集成作为基础设施准备

## Implementation Plan

### Step 1: 安装新依赖
**`package.json`** — 添加 `@cloudbase/node-sdk` 和 `dotenv`

### Step 2: 创建后端 CloudBase 初始化模块
**新建 `cloudbase.js`** — CloudBase SDK 初始化（供 server.js 引用）
```js
const cloudbaseSDK = require("@cloudbase/node-sdk");
require("dotenv").config();

const cloudbase = cloudbaseSDK.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY
});

module.exports = { cloudbase };
```

### Step 3: 修改 server.js
**`server.js`** — 顶部加 `require('dotenv').config()`，引入 cloudbase 模块

### Step 4: 前端添加 JS SDK CDN
**`public/index.html`** — 在 `</body>` 前添加 CDN script 标签，初始化 CloudBase

### Step 5: 添加环境变量和配置文件
| 文件 | 用途 |
|------|------|
| **新建 `.env`** | 本地开发用（加入 .gitignore） |
| **新建 `.env.example`** | 提交到 git 的环境变量模板 |
| **新建 `Dockerfile`** | CloudBase Cloud Run 容器定义 |
| **新建 `.dockerignore`** | 排除无关文件 |
| **新建 `cloudbaserc.json`** | CloudBase CLI 部署配置 |

### Step 6: 清理
不删除 Vercel 文件（`vercel.json`, `api/index.js`），保留兼容性。

## Verification

- [ ] `npm install` 成功安装新依赖
- [ ] `node -e "require('./cloudbase')"` 不报错
- [ ] `npm start` 服务器启动正常
- [ ] 浏览器访问 `http://localhost:3000` — 页面正常加载
- [ ] CDN 加载的 CloudBase JS SDK 在控制台可访问
- [ ] 注册 → 登录 → 仪表板 → 宠物互动 完整流程正常
- [ ] `docker build -t couple-pet .` 构建成功
