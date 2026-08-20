# 部署指南

## 0. 当前生产环境（2026-08-20）

| 项 | 值 |
|---|---|
| 域名 | `shike.live`（HTTPS，nginx + Certbot） |
| 服务器目录 | `/opt/shike` |
| Docker 容器 | `shike-app-1`（compose 项目名 `shike`） |
| 数据卷 | `shike_app-data`（SQLite + 上传文件） |
| CI/CD | GitHub Actions 推送 main 自动部署（Secrets：`SHIKE_SSH_HOST/PORT/USER/KEY/DEPLOY_DIR`，`DEPLOY_DIR=/opt/shike`） |
| 备份 | `bash scripts/backup.sh`（crontab 每日 03:00，保留 14 份，目录 `/root/shike-backups`） |
| 数据库变更 | 部署后在容器内执行 `docker exec shike-app-1 npx prisma db push`（变更前先 `docker cp` 备份 `app.db`） |

生产环境已按下面第 1–6 节配置完成；新服务器可照此流程从零搭建。

## 1. 准备服务器

- 建议：境外 VPS，2 核 4G 起（推荐 4 核 8G），磁盘 100G，Ubuntu 22.04
- 安装 Docker 与 Docker Compose

## 一键部署（推荐）

把项目上传到服务器后（含 `deploy/setup-server.sh`），域名解析生效后执行：

```bash
sudo bash deploy/setup-server.sh your-domain.com admin@example.com
```

脚本会自动完成：安装 Docker/Nginx/Certbot → 构建启动应用 → 初始化数据库和管理员 → 配置 HTTPS。
首次运行如果提示 `.env` 缺失，先 `cp .env.example .env` 并填入两个 API Key，再重新运行。

> 前提：域名已解析到本服务器 IP（`nslookup your-domain.com` 应返回服务器 IP），否则证书申请会失败。

## 2. 配置域名与 HTTPS（推荐）

1. 注册域名（如 `shike.com`），DNS A 记录指向服务器 IP
2. 安装 nginx 与 certbot，申请证书：

```bash
apt install -y nginx certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

3. 将 `deploy/nginx.conf` 中的域名替换后放入 `/etc/nginx/sites-available/` 并启用

> 注意：Docker 内数据库路径固定为 `/app/data/app.db`（compose 已内置），`.env` 中的 `DATABASE_URL` 只用于本地开发。

## 3. 启动应用

```bash
cp .env.example .env
# 编辑 .env：AUTH_SECRET / ARK_API_KEY / ARK_VISION_API_KEY / ARK_VISION_MODEL / SEED_ADMIN_*
docker compose up -d --build
docker compose exec app sh -c "mkdir -p data && touch data/app.db && npx prisma db push && npx tsx prisma/seed.ts"
```

## 4. 使用

- 浏览器访问 `https://your-domain.com`
- 注册 / 登录后先创建家庭（或输邀请码加入），即可使用全部功能；种子管理员账号见 `.env` 的 `SEED_ADMIN_*`

## 5. 备份

```bash
# 备份数据目录（SQLite + 上传文件）
docker run --rm -v shike_app-data:/data -v $PWD:/backup alpine tar czf /backup/backup-$(date +%F).tar.gz /data
```

## 环境变量

见 `.env.example` 注释。核心：

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 会话签名密钥，`openssl rand -hex 32` 生成 |
| `ARK_API_KEY` | 火山方舟 API Key（豆包大模型） |
| `ARK_VISION_API_KEY` | 火山方舟视觉 API Key（扫描识别，优先于 `ARK_API_KEY`） |
| `ARK_VISION_MODEL` | 视觉模型 ID（`doubao-seed-2-1-turbo-260628`） |

## 6. 食刻接口（后端已并入本工程）

- 完整接口清单与契约见 `docs/后端对接说明.md`（账号 / 家庭 / 扫描 / 库存 / 提醒 / 菜谱 / AI 助手等）。
