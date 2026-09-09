#!/usr/bin/env bash
# 在服务器上执行：从 /opt/shike/.env 渲染小智服务端配置并启动容器。
set -euo pipefail

SRC_DIR="/opt/shike/deploy/xiaozhi-server"
XZ_DIR="/opt/xiaozhi-server"

env_val() {
  grep -E "^$1=" /opt/shike/.env | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}

LLM_BASE_URL="$(env_val ARK_BASE_URL)"
LLM_MODEL="$(env_val ARK_CHAT_MODEL)"
LLM_API_KEY="$(env_val ARK_API_KEY)"
SPEECH_API_KEY="$(env_val VOLC_SPEECH_API_KEY)"
TTS_VOICE="$(env_val TTS_VOICE)"
TTS_VOICE="${TTS_VOICE:-zh_female_shuangkuaisisi_uranus_bigtts}"

for req in ARK_BASE_URL ARK_CHAT_MODEL ARK_API_KEY VOLC_SPEECH_API_KEY; do
  v="$(env_val "$req")"
  if [ -z "$v" ]; then
    echo "ERROR: /opt/shike/.env 缺少 $req"
    exit 1
  fi
done

mkdir -p "$XZ_DIR/data" "$XZ_DIR/providers" "$XZ_DIR/patches"

sed -e "s|__LLM_BASE_URL__|${LLM_BASE_URL}|g" \
    -e "s|__LLM_MODEL__|${LLM_MODEL}|g" \
    -e "s|__LLM_API_KEY__|${LLM_API_KEY}|g" \
    -e "s|__SPEECH_API_KEY__|${SPEECH_API_KEY}|g" \
    -e "s|__TTS_VOICE__|${TTS_VOICE}|g" \
    "$SRC_DIR/config.template.yaml" > "$XZ_DIR/data/.config.yaml"
chmod 600 "$XZ_DIR/data/.config.yaml"

cp -f "$SRC_DIR/providers/seed_asr.py" "$XZ_DIR/providers/seed_asr.py"
cp -f "$SRC_DIR/providers/seed_tts.py" "$XZ_DIR/providers/seed_tts.py"
cp -f "$SRC_DIR/patches/helloHandle.py" "$XZ_DIR/patches/helloHandle.py"
cp -f "$SRC_DIR/docker-compose.yml" "$XZ_DIR/docker-compose.yml"

cd "$XZ_DIR"
docker compose pull
docker compose up -d
echo "XIAOZHI_DEPLOY_OK"
