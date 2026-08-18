# 食刻 ShiKe · 后端服务

冰箱食品保质期管理 · 智能扫描识别 · 家庭库存共享。

## 技术栈

- Next.js 15（App Router + Route Handlers）+ React 19
- Prisma + SQLite（Docker 卷持久化）
- JWT 会话 Cookie（httpOnly / SameSite=Lax / 7 天）+ bcrypt
- Docker Compose 单容器部署，nginx + Certbot（HTTPS）

## 快速开始

```bash
pnpm install
cp .env.example .env   # 填入 AUTH_SECRET / ARK_API_KEY / ARK_VISION_API_KEY 等
pnpm db:push           # 建表
pnpm db:seed:shike     # 食刻演示数据（菜谱 / 容器 / 识别库）
pnpm dev               # http://localhost:3000 → 跳转食刻 H5
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js 开发 / 构建 / 运行 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 单元测试（node:test + tsx） |
| `pnpm db:push` / `pnpm db:migrate` | 数据库建表 / 迁移 |
| `pnpm db:seed:shike` | 食刻种子数据 |
| `pnpm db:devices` | 生成 / 重置设备 Token（固件 `X-Device-Token`） |
| `bash scripts/backup.sh` | 数据卷备份（服务器每日 03:00 crontab） |

## 接口概览

- 账号：`/api/auth/register|login|logout|me|password`
- 食刻：`/api/scan`（设备 Token / 登录会话双通道）、`/api/items`、`/api/reminders`、
  `/api/recipes`、`/api/members`、`/api/shopping-list`、`/api/notifications`、
  `/api/catalog`、`/api/shelf-life`、`/api/trace`、`/api/consume`、`/api/nutrition`、`/api/logs`
- 设备：`/api/device/heartbeat`、`/api/device/state`
- 除登录/健康/设备外，全部接口需登录会话；设备接口需 `X-Device-Token`

详细契约见根目录 `后端对接说明.md`。

## 部署

服务器路径 `/opt/shike`，容器 `shike-app-1`，数据卷 `shike_app-data`。
CI（GitHub Actions）推送 main 后自动部署；仓库 Secrets 需配置：
`SHIKE_SSH_HOST` / `SHIKE_SSH_PORT` / `SHIKE_SSH_USER` / `SHIKE_SSH_KEY` / `SHIKE_DEPLOY_DIR`。
