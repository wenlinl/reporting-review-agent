# 部署指南

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

1. 注册域名（如 `midyear-workshop.com`），DNS A 记录指向服务器 IP
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
# 编辑 .env：AUTH_SECRET / ARK_API_KEY / VOLC_SPEECH_API_KEY / SEED_ADMIN_*
docker compose up -d --build
docker compose exec app sh -c "mkdir -p data && touch data/app.db && npx prisma db push && npx tsx prisma/seed.ts"
```

## 4. 使用

- 浏览器访问 `https://your-domain.com`
- 管理员登录后创建同事账号，每人获得"姓名 + 邮箱 + 初始密码"

## 5. 备份

```bash
# 备份数据目录（SQLite + 上传文件）
docker run --rm -v midyear-workshop_app-data:/data -v $PWD:/backup alpine tar czf /backup/backup-$(date +%F).tar.gz /data
```

## 环境变量

见 `.env.example` 注释。核心：

| 变量 | 说明 |
| --- | --- |
| `AUTH_SECRET` | 会话签名密钥，`openssl rand -hex 32` 生成 |
| `ARK_API_KEY` | 火山方舟 API Key（豆包大模型） |
| `VOLC_SPEECH_API_KEY` | 火山语音服务 API Key（ASR 转写） |
| `VOLC_ASR_MODE` | `flash`（极速版，推荐）/ `standard`（标准版） |

## 6. 食刻接口（后端已并入本工程）

- 新增路由：`/api/scan`（硬件上传+AI识别+入库）、`/api/items`、`/api/items/[id]`（改容器）、`/api/reminders`；
- 数据库新增模型：`FoodItem`、`ScanLog`（`prisma db push` 自动建表）；
- 部署 .env 需新增：`ARK_VISION_MODEL=doubao-seed-2-1-turbo-260628`、`ARK_VISION_API_KEY=<支持视觉的方舟 Key>`；
- 详细契约见工程根目录 `后端对接说明.md`（位于 HsHH 工作区）。
