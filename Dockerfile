# ═══════════════════════════════════════════════════════════════════
# Stage 1 — 构建前端（Alpine，仅构建产物，不进最终镜像）
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine AS frontend

WORKDIR /build

# 先复制 package 文件，利用 Docker 层缓存
COPY client/chat/package*.json ./
RUN npm ci --prefer-offline

COPY client/chat/ ./
RUN npm run build

# ═══════════════════════════════════════════════════════════════════
# Stage 2 — 生产镜像
# ═══════════════════════════════════════════════════════════════════
FROM node:20-slim

WORKDIR /app

# better-sqlite3 和 sharp 含有 native addon，需要编译工具。
# 将"安装工具 → npm ci → 删除工具"合并在同一 RUN 层，
# 确保编译工具不进入最终镜像的文件系统。
COPY package*.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev --prefer-offline \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

# 拷贝服务端代码（敏感配置由环境变量在运行时注入，不写死在镜像里）
COPY config.js  ./
COPY server/    ./server/

# 拷贝 Stage 1 构建好的前端产物
COPY --from=frontend /build/dist ./client/chat/dist/

# 预建数据目录（容器首次启动时若 volume 为空会自动继承）
RUN mkdir -p data/uploads/chat data/uploads/share

# 暴露端口（与 config.js PORT 保持一致）
EXPOSE 8881

# 健康检查：轮询 /api/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "\
    require('http')\
      .get('http://localhost:' + (process.env.PORT||8881) + '/api/health', r => \
        process.exit(r.statusCode === 200 ? 0 : 1)\
      )\
      .on('error', () => process.exit(1))"

CMD ["node", "server/index.js"]
