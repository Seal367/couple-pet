# 🐾 泡泡 - 你们的小世界

异地恋专属电子宠物。你和 TA 一起在线上养一只叫"泡泡"的小可爱。

## 功能

- 💕 **两个人共养一只宠物** — 注册后输入伴侣码连接彼此
- 🍼 **喂食、摸摸、玩耍、睡觉** — 四种互动，泡泡会开心地回应
- ❤️ **实时同步** — 你的另一半做了什么，你这边立刻看到
- 🌙 **状态随时间变化** — 泡泡会饿、会困，需要两个人一起照顾
- 🎨 **可爱 Canvas 动画** — 眨眼、脸红、跳跃、冒爱心

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JS + Canvas |
| 后端 | Node.js + Express |
| 数据库 | PostgreSQL (Supabase) |
| 认证 | Session + bcrypt |
| 托管 | Render (Web Service) |

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 设置数据库连接
export DATABASE_URL=postgresql://...

# 3. 启动
npm start
# 或
npm run dev
```

## 部署

1. 推送代码到 GitHub
2. 在 [Render](https://render.com) 创建 Web Service，连接该仓库
3. 设置环境变量 `DATABASE_URL`（指向 Supabase PostgreSQL）
4. 部署完成 🎉
