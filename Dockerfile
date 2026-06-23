# ====================== 安全优化的 Dockerfile ======================
# 使用 Debian-based 镜像避免 Alpine/musl 兼容性问题
FROM node:20-slim AS base

# ==================== 依赖安装阶段 ====================
FROM base AS deps
WORKDIR /app

# 只复制 lockfile 和 package.json，充分利用缓存
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# 安装所有依赖（包括 devDependencies，构建时需要）
# 使用 --ignore-scripts 防止恶意 postinstall 脚本
RUN \
  if [ -f package-lock.json ]; then \
    npm ci --legacy-peer-deps --ignore-scripts; \
  elif [ -f yarn.lock ]; then \
    yarn --frozen-lockfile --ignore-scripts; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm i --frozen-lockfile --ignore-scripts; \
  else \
    echo "Lockfile not found." && exit 1; \
  fi

# ==================== 构建阶段 ====================
FROM base AS builder
WORKDIR /app

# 从 deps 阶段复制 node_modules（已优化）
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 配置 npm 代理（解决网络问题）
ARG HTTP_PROXY=http://192.168.110.60:9300
ARG HTTPS_PROXY=http://192.168.110.60:9300
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV npm_config_proxy=${HTTP_PROXY}
ENV npm_config_https_proxy=${HTTPS_PROXY}

# 执行 MDX 生成
RUN npx fumadocs-mdx

# 构建（Debian-slim 支持原生 SWC 绑定，可用 Turbopack）
ENV NEXT_TELEMETRY_DISABLED=1
RUN \
  if [ -f package-lock.json ]; then \
    npm run build; \
  elif [ -f yarn.lock ]; then \
    yarn build; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm run build; \
  else \
    echo "Lockfile not found." && exit 1; \
  fi

# ==================== 生产运行阶段 ====================
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 创建非 root 用户（安全最佳实践）
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 权限控制
RUN mkdir -p .next/cache \
    && chown -R nextjs:nodejs .next

USER nextjs

EXPOSE 3000

# 使用 standalone 输出（体积更小）
CMD ["node", "server.js"]