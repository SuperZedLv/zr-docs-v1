# Docker 构建问题修复记录

## 问题概述

在构建 Docker 镜像时遇到多个问题：

1. **Next.js 安全漏洞警告** - 构建时显示 `next@16.0.7` 存在安全漏洞
2. **tsx 命令缺失** - prebuild 脚本需要 tsx，但被 `--omit=dev` 排除
3. **多个源文件丢失** - layout.tsx、source.ts 等关键文件被误删
4. **Alpine 兼容性问题** - Turbopack 不支持 WASM，musl libc 兼容性问题
5. **devDependencies 缺失** - 构建时需要 tailwindcss 等开发依赖
6. **网络问题** - npm 包下载和 Alpine 包仓库访问不稳定

## 修复方案

### 1. 升级 Next.js 版本

**文件**: `package.json`

```json
{
  "dependencies": {
    "next": "16.2.9",
    "@next/third-parties": "^16.2.9"
  }
}
```

**说明**: 从 16.0.7 升级到 16.2.9，修复安全漏洞（2025-12-11 披露）

### 2. 移动 tsx 到 dependencies

**文件**: `package.json`

```json
{
  "dependencies": {
    "tsx": "^4.19.2"
  },
  "devDependencies": {
    // tsx 已从 devDependencies 移除
  }
}
```

**说明**: prebuild 脚本 `tsx scripts/prebuild.ts` 需要 tsx，Docker 构建时不能排除

### 3. 恢复被删除的文件

从 git 历史恢复以下文件：

```bash
# 从 commit 27ee00a^ 恢复
git show 27ee00a^:src/app/layout.tsx > src/app/layout.tsx
git show 27ee00a^:src/lib/source.ts > src/lib/source.ts
git show 27ee00a^:src/mdx-components.tsx > src/mdx-components.tsx
git show 27ee00a^:src/components/feedback.tsx > src/components/feedback.tsx
git show 27ee00a^:src/components/page-actions.tsx > src/components/page-actions.tsx
git show 27ee00a^:src/lib/github.ts > src/lib/github.ts
```

**说明**: commit 27ee00a（"简化项目为纯文档站点"）误删了这些关键文件

### 4. 切换基础镜像为 Debian-slim

**文件**: `Dockerfile`

```dockerfile
# 改用 Debian-based 镜像避免 Alpine/musl 兼容性问题
FROM node:20-slim AS base
```

**说明**: 
- Alpine 使用 musl libc，Next.js 的 SWC 原生绑定需要 glibc
- Turbopack 不支持 WASM 绑定，在 Alpine 上无法使用
- Debian-slim 体积适中，兼容性更好

### 5. 安装完整依赖（包括 devDependencies）

**文件**: `Dockerfile`

```dockerfile
# 安装所有依赖（包括 devDependencies，构建时需要）
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
```

**说明**: 
- 移除了 `--omit=dev` / `--production` 标志
- 构建时需要 tailwindcss、postcss 等开发依赖
- 仍使用 `--ignore-scripts` 防止恶意 postinstall 脚本

### 6. 配置代理解决网络问题

**文件**: `Dockerfile`

```dockerfile
# 配置 npm 代理（解决网络问题）
ARG HTTP_PROXY=http://192.168.110.60:9300
ARG HTTPS_PROXY=http://192.168.110.60:9300
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV npm_config_proxy=${HTTP_PROXY}
ENV npm_config_https_proxy=${HTTPS_PROXY}
```

**说明**: 国内网络访问 npm 和 Alpine 包仓库不稳定，配置代理提高稳定性

### 7. 修复用户创建命令

**文件**: `Dockerfile`

```dockerfile
# Debian 系统使用 groupadd/useradd
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
```

**说明**: Alpine 使用 `addgroup/adduser`，Debian 使用 `groupadd/useradd`

## 完整 Dockerfile

```dockerfile
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
```

## 构建和运行

### 构建镜像

```bash
# 标准构建
docker build -t zr-doc:v8 .

# 无缓存构建
docker build --no-cache -t zr-doc:v8 .

# 自定义代理（如果需要）
docker build --build-arg HTTP_PROXY=http://your-proxy:port \
             --build-arg HTTPS_PROXY=http://your-proxy:port \
             -t zr-doc:v8 .
```

### 运行容器

```bash
# 基础运行
docker run -d -p 3000:3000 --name docs zr-doc:v8

# 带环境变量
docker run -d -p 3000:3000 \
  -e NEXT_PUBLIC_GA_ID=your-ga-id \
  -e GITHUB_APP_ID=your-app-id \
  -e GITHUB_APP_PRIVATE_KEY=your-key \
  --name docs zr-doc:v8

# 使用 docker-compose
docker-compose up -d
```

### 验证服务

```bash
# 检查容器状态
docker ps

# 查看日志
docker logs docs

# 测试访问
curl -I http://localhost:3000
# 应该返回 HTTP 307（重定向到语言路径）
```

## 镜像信息

- **基础镜像**: node:20-slim (Debian-based)
- **镜像大小**: 1.57GB (磁盘) / 323MB (内容)
- **Next.js 版本**: 16.2.9
- **Node.js 版本**: 20.x
- **运行端口**: 3000
- **运行用户**: nextjs (非 root)

## 安全特性

1. ✅ 使用 `--ignore-scripts` 防止恶意 postinstall 脚本
2. ✅ 多阶段构建，最终镜像不包含构建工具和源代码
3. ✅ 使用非 root 用户运行（nextjs:nodejs）
4. ✅ 禁用 Next.js telemetry
5. ✅ 使用安全的依赖版本（Next.js 16.2.9 修复了安全漏洞）

## 故障排除

### 问题：构建时提示 "Cannot find module"

**原因**: devDependencies 未安装

**解决**: 确保 Dockerfile 中的 npm ci 命令没有 `--omit=dev` 标志

### 问题：Alpine 上构建失败 "Turbopack is not supported"

**原因**: Alpine 使用 musl libc，Turbopack 不支持 WASM

**解决**: 使用 `node:20-slim`（Debian-based）替代 `node:20-alpine`

### 问题：构建时网络超时

**原因**: 国内访问 npm 仓库不稳定

**解决**: 配置代理或设置 npm 镜像源

```dockerfile
# 方案1：使用代理
ENV HTTP_PROXY=http://proxy:port
ENV HTTPS_PROXY=http://proxy:port

# 方案2：使用淘宝镜像
RUN npm config set registry https://registry.npmmirror.com
```

### 问题：prebuild 脚本失败 "tsx: not found"

**原因**: tsx 在 devDependencies 中被排除

**解决**: 将 tsx 移到 dependencies 或安装完整依赖

## 更新日志

### 2026-06-22
- ✅ 升级 Next.js 到 16.2.9 修复安全漏洞
- ✅ 切换基础镜像为 node:20-slim
- ✅ 恢复被误删的源文件
- ✅ 安装完整依赖（包括 devDependencies）
- ✅ 配置代理解决网络问题
- ✅ 修复 Debian 用户创建命令
- ✅ 构建成功并验证运行正常

## 参考链接

- [Next.js Security Update 2025-12-11](https://nextjs.org/blog/security-update-2025-12-11)
- [Next.js Docker Optimization](https://nextjs.org/docs/app/api-reference/config/next-config-js/output#automatically-copying-traced-files)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md)
