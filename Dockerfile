FROM node:22-slim AS base

# 安装系统依赖（ffmpeg 保留兼容，当前未使用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml ./
COPY prisma ./prisma
ENV DATABASE_URL="file:/app/data/app.db"
RUN corepack enable && pnpm install --frozen-lockfile=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="file:/app/data/app.db" \
    AUTH_SECRET="docker-build-only-secret" \
    NODE_ENV=production
RUN mkdir -p data && touch data/app.db && ./node_modules/.bin/prisma db push && ./node_modules/.bin/next build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
