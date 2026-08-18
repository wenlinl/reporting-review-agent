#!/usr/bin/env bash
# 食刻生产数据备份：SQLite 卷 + 上传文件，保留最近 14 份。
# 服务器用法：bash scripts/backup.sh（配合 crontab：0 3 * * * cd /opt/shike && bash scripts/backup.sh >> /var/log/shike-backup.log 2>&1）
set -euo pipefail

VOLUME="${SHIKE_VOLUME:-shike_app-data}"
OUT_DIR="${SHIKE_BACKUP_DIR:-/root/shike-backups}"
mkdir -p "$OUT_DIR"

STAMP="$(date +%F-%H%M)"
docker run --rm \
  -v "${VOLUME}:/data:ro" \
  -v "${OUT_DIR}:/backup" \
  alpine sh -c "apk add --no-cache tar >/dev/null 2>&1; tar czf /backup/shike-${STAMP}.tar.gz -C / data"

# 只保留最近 14 份
ls -1t "${OUT_DIR}"/shike-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "[$(date '+%F %T')] backup ok: ${OUT_DIR}/shike-${STAMP}.tar.gz ($(du -h "${OUT_DIR}/shike-${STAMP}.tar.gz" | cut -f1))"

# 恢复方式（必要时手动执行）：
#   docker run --rm -v shike_app-data:/data -v /root/shike-backups:/backup \
#     alpine sh -c "apk add --no-cache tar; tar xzf /backup/shike-YYYY-MM-DD-HHMM.tar.gz -C / && cp -a /data/. /backup_restore/"
