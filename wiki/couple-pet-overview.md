---
title: "泡泡 (Couple Pet) — 异地恋电子宠物 / Long-Distance Couple Virtual Pet"
type: concept
language: bilingual
created: 2026-07-25
modified: 2026-07-25
tags: [nodejs, express, postgresql, canvas, virtual-pet, couple-app]
aliases: [泡泡, couple-pet, bubble-pet, virtual-pet]
summary: "A virtual pet web app for long-distance couples — two people co-raise a pet named 泡泡 (Bubble) with real-time interaction syncing."
confidence: high
related_concepts: [couple-pet-architecture, couple-pet-database, couple-pet-api, couple-pet-frontend, couple-pet-pet-mechanics, couple-pet-deployment]
---

# 泡泡 (Couple Pet) — 你们的小世界

## Definition / 定义

泡泡 (Couple Pet) 是一款面向异地恋伴侣的单页 Web 应用。两个人通过"伴侣码"连接，共同饲养一只名叫"泡泡"的电子宠物。宠物状态（饱食度、心情、精力、睡眠）随时间衰减，需要两个人一起互动来维持。所有操作实时记录并显示在共享的互动时间线中。

**核心理念**: 异地恋伴侣通过共同照顾一个小生命，产生"在一起做同一件事"的连接感。

## Key Properties / 关键特性

- **两人共养 (Pair-based)**: 注册即生成 6 位伴侣码，伴侣输入后两人绑定到同一 `couple` 组
- **四种互动 (4 Actions)**: 🍼 喂食、🤚 摸摸、🎾 玩耍、😴 睡觉/叫醒
- **状态衰减 (Stat Decay)**: 宠物属性随时间自然衰减，离线期间也会计算衰减量
- **实时同步 (Polling sync)**: 前端每 3 秒轮询宠物状态、每 10 秒检查伴侣在线状态
- **Canvas 动画**: 宠物用 Canvas 2D 绘制，有眨眼、表情变化（开心/饥饿/困倦）、粒子特效
- **互动时间线**: 所有操作记录以时间线形式展示，标记操作者和时间
- **伴侣在线状态**: 实时显示伴侣是否在线，绿色指示灯 + 用户名

## Tech Stack / 技术栈

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Vanilla HTML/CSS/JS + Canvas 2D | No framework, single `index.html` + `app.js` + `style.css` |
| Backend | Node.js + Express 4.18 | RESTful JSON API |
| Database | PostgreSQL (Supabase) | 5 tables: couples, users, pets, interactions, user_sessions |
| Session | express-session + connect-pg-simple | Server-side sessions stored in PostgreSQL |
| Auth | bcryptjs | Password hashing with bcrypt, salt rounds = 10 |
| Hosting | Render (primary) + Vercel (alternative) | See [[couple-pet-deployment]] |

## Project Structure / 项目结构

```
pet/
├── server.js           # Express server (standalone, for Render)
├── api/index.js        # Express app as Vercel serverless function
├── package.json        # Node.js dependencies
├── public/
│   ├── index.html      # Single-page frontend
│   ├── app.js          # Frontend logic (auth, canvas, polling)
│   └── style.css       # Pink-themed responsive styles
├── test-api.sh         # Bash API test suite (14 test cases)
├── test-db.js          # Database connection test
├── render.yaml         # Render Blueprint config
└── vercel.json         # Vercel routing config
```

## History / 版本历史

| Commit | Description |
|--------|-------------|
| `e06a163` | Initial commit — 电子宠物泡泡 |
| `b6331ba` | Add Render deployment config |
| `98f051d` | Add README |
| `13a745c` | Add API endpoint test script |
| `df8ce4e` | Refactor: add Vercel serverless support (extract Express app to `api/index.js`) |
| `c9ab7fc` | Fix: force IPv4 DNS resolution for Supabase connection |

## Related Concepts / 相关概念

- [[couple-pet-architecture]] — 前后端架构与数据流
- [[couple-pet-database]] — PostgreSQL 数据库 schema
- [[couple-pet-api]] — REST API 端点设计
- [[couple-pet-frontend]] — 前端设计：Canvas 动画、状态管理、UI
- [[couple-pet-pet-mechanics]] — 宠物机制：属性计算、衰减公式、互动效果
- [[couple-pet-deployment]] — 部署：Render + Vercel 双平台

## References / 参考资料

- Source code: `server.js`, `api/index.js`, `public/`
- Package dependencies: Express 4.18, pg 8.11, bcryptjs 2.4, connect-pg-simple 9.0
- Test suite: `test-api.sh` (14 API test cases)
