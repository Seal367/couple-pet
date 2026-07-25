# ─── CloudBase Cloud Run Dockerfile ─────────────────────
# 基于 Node.js 20 Alpine（最小镜像，约 50MB + 依赖）

FROM node:20-alpine

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package*.json ./
RUN npm ci --production

# 复制应用代码
COPY . .

# Express 监听端口（Cloud Run 通过 PORT 环境变量注入）
EXPOSE 3000

CMD ["npm", "start"]
