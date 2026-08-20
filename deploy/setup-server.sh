#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
ADMIN_EMAIL="${2:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "用法: sudo bash setup-server.sh <你的域名> [邮箱]"
  echo "示例: sudo bash setup-server.sh shike.example.com admin@example.com"
  echo "说明: 邮箱用于 Let's Encrypt 证书到期提醒（可省略）"
  exit 1
fi

if [[ "$(id -u)" != "0" ]]; then
  echo "请使用 root 或 sudo 运行此脚本"
  exit 1
fi

echo "==> 1/6 安装 Docker、Nginx、Certbot"
apt-get update -y
apt-get install -y docker.io nginx certbot python3-certbot-nginx

# Ubuntu 源不含 docker-compose 插件时，从 Docker 官方 GitHub 下载独立 compose 二进制
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose 插件未安装，下载独立 compose 二进制…"
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  docker compose version || echo "警告: docker compose 安装失败，请手动检查"
fi

echo "==> 2/6 启动 Docker"
systemctl enable --now docker

echo "==> 3/6 检查 .env"
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "已生成 .env —— 请先编辑填写以下两项后再重新运行本脚本："
  echo "  nano .env"
  echo "  ARK_API_KEY=你的方舟 API Key"
  echo "  ARK_VISION_API_KEY=你的视觉 API Key（扫描识别用）"
  exit 1
fi

if grep -qE '^ARK_API_KEY=$' .env; then
  echo "警告: .env 中 ARK_API_KEY 为空，AI 推荐/助手/营养将不可用"
fi
if grep -qE '^ARK_VISION_API_KEY=$' .env; then
  echo "警告: .env 中 ARK_VISION_API_KEY 为空，扫描识别将不可用"
fi
if grep -qE '^AUTH_SECRET=please-change-me$' .env || grep -qE '^AUTH_SECRET=$' .env; then
  echo "警告: .env 中 AUTH_SECRET 仍是默认值，建议改为随机字符串（执行: openssl rand -hex 32）"
fi

echo "==> 4/6 构建并启动应用"
docker compose up -d --build
sleep 5
docker compose exec -T app sh -c "mkdir -p data && touch data/app.db && npx prisma db push && npx tsx prisma/seed.ts"

echo "==> 5/6 配置 Nginx 反向代理"
cat > /tmp/shike-nginx <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
EOF
cp /tmp/shike-nginx /etc/nginx/sites-available/shike
ln -sf /etc/nginx/sites-available/shike /etc/nginx/sites-enabled/shike
nginx -t
systemctl reload nginx

echo "==> 6/6 申请 HTTPS 证书"
if [[ -n "$ADMIN_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
fi

echo ""
echo "=============================================="
echo "✅ 部署完成，访问地址: https://$DOMAIN"
echo "管理员账号: admin@example.com"
echo "管理员密码: 查看 .env 中的 SEED_ADMIN_PASSWORD"
echo "=============================================="
