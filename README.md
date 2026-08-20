# 食刻 ShiKe · 后端服务

冰箱食品保质期管理 · 智能扫描识别 · 家庭库存共享。

线上地址：**https://shike.live**（根路径直达食刻 H5：`/shike-h5.html`）

## 功能

- **账号与家庭**：注册 / 登录 / 改密码；新用户必须先创建家庭（起名）或输邀请码加入，数据按家庭隔离；
  家庭内昵称与账号名分开，可邀请成员 / 重新生成邀请码 / 离开 / 解散；
- **扫描识别**：T5 设备（`X-Device-Token`）或手机摄像头（登录会话）→ 火山方舟视觉 AI 识别品名 / 保质期 / 建议容器 → 自动记账；
- **库存与提醒**：库存按容器 / 剩余天数管理，临期 / 过期自动提醒（每条带 AI 处理建议）；
- **AI**：菜谱个性化推荐（按库存 + 口味）、营养分析总结、家庭饮食助手（基于真实数据问答）——全部带无 Key 规则兜底；
- **购物清单**：手动 / 菜谱缺料 / 临期自动加入，一键复制、跳转购买；
- **冷启动**：空库存一键添加 8 种常用食材（含临期食材，立刻看到提醒价值）。

## 技术栈

- Next.js 15（App Router + Route Handlers）+ React 19
- Prisma + SQLite（Docker 卷持久化）
- JWT 会话 Cookie（httpOnly / SameSite=Lax / 7 天）+ bcrypt；数据接口统一鉴权 + 家庭隔离
- Docker Compose 单容器部署，nginx + Certbot（HTTPS + 安全响应头）

## 快速开始

```bash
pnpm install
cp .env.example .env   # 填入 AUTH_SECRET / ARK_API_KEY / ARK_VISION_API_KEY 等
pnpm db:push           # 建表
pnpm db:seed:shike     # 食刻种子数据（菜谱 / 容器 / 识别库 / 演示家庭）
pnpm dev               # http://localhost:3000 → 跳转食刻 H5
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js 开发 / 构建 / 运行 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 单元测试（node:test + tsx） |
| `pnpm db:push` / `pnpm db:migrate` | 数据库建表 / 迁移 |
| `pnpm db:seed:shike` | 食刻种子数据（含演示家庭 `SHK-DEMO01`） |
| `pnpm db:devices` | 生成 / 重置设备 Token（固件 `X-Device-Token`） |
| `bash scripts/backup.sh` | 数据卷备份（服务器每日 03:00 crontab） |

## 接口概览

- 账号：`/api/auth/register|login|logout|me|password`
- 家庭：`/api/family`（GET/POST）、`/api/family/join|leave|invite`、`/api/members/me`、`/api/members/prefs`
- 食刻数据（均需登录 + 家庭）：`/api/items`、`/api/items/batch`、`/api/reminders`、`/api/recipes`、
  `/api/recipes/recommend`、`/api/members`、`/api/shopping-list`、`/api/notifications`、`/api/catalog`、
  `/api/shelf-life`、`/api/trace`、`/api/consume`、`/api/nutrition`、`/api/logs`
- AI：`/api/recipes/recommend`、`/api/ai/chat`、`/api/nutrition`、`/api/reminders`（建议字段）
- 设备：`/api/scan`（设备 Token / 登录会话双通道）、`/api/device/heartbeat`、`/api/device/state`

详细契约见 `docs/后端对接说明.md`。

## 部署

- 服务器：`/opt/shike`，容器 `shike-app-1`，数据卷 `shike_app-data`，域名 `shike.live`；
- CI（GitHub Actions）：推送 main 自动构建部署；仓库 Secrets 需配置：
  `SHIKE_SSH_HOST` / `SHIKE_SSH_PORT` / `SHIKE_SSH_USER` / `SHIKE_SSH_KEY` / `SHIKE_DEPLOY_DIR`（`/opt/shike`）；
- 备份：`scripts/backup.sh`（服务器 crontab 每日 03:00，保留 14 份）。
