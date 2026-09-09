import base64
import json
import os
import uuid
from datetime import datetime

import requests

from config.logger import setup_logging
from core.providers.tts.base import TTSProviderBase

TAG = __name__
logger = setup_logging()


class TTSProvider(TTSProviderBase):
    """火山引擎 Seed TTS v3（seed-tts-2.0 unidirectional）适配：复用食刻现有音色。"""

    def __init__(self, config, delete_audio_file):
        super().__init__(config, delete_audio_file)
        self.api_key = config.get("api_key", "")
        self.voice = config.get("voice", "zh_female_shuangkuaisisi_uranus_bigtts")
        self.format = config.get("format", "mp3")
        self.sample_rate = config.get("sample_rate", 24000)
        self.resource_id = config.get("resource_id", "seed-tts-2.0")
        self.api_url = config.get(
            "api_url", "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
        )
        self.audio_file_type = self.format
        self.output_file = config.get("output_dir", "tmp/")

    def generate_filename(self):
        return os.path.join(
            self.output_file,
            f"tts-{datetime.now().date()}@{uuid.uuid4().hex}.{self.audio_file_type}",
        )

    async def text_to_speak(self, text, output_file):
        audio_params = {"format": self.format}
        if self.sample_rate:
            audio_params["sample_rate"] = self.sample_rate
        body = {
            "user": {"uid": f"shike-{uuid.uuid4().hex[:12]}"},
            "req_params": {
                "text": text,
                "speaker": self.voice,
                "audio_params": audio_params,
            },
        }
        try:
            resp = requests.post(
                self.api_url,
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Api-Resource-Id": self.resource_id,
                    "X-Api-Key": self.api_key,
                },
                timeout=self.tts_timeout,
            )
        except Exception as e:
            raise Exception(f"Seed TTS 网络错误: {e}")

        if resp.status_code != 200:
            raise Exception(f"Seed TTS HTTP {resp.status_code}: {resp.text[:300]}")

        chunks = []
        for line in resp.text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                p = json.loads(line)
            except Exception:
                continue
            if not isinstance(p, dict):
                continue
            code = p.get("code")
            if code in (0, 20000000):
                if p.get("data"):
                    try:
                        chunks.append(base64.b64decode(p["data"]))
                    except Exception:
                        continue
                continue
            if code is not None:
                raise Exception(
                    f"Seed TTS 流错误: {json.dumps(p, ensure_ascii=False)[:300]}"
                )

        audio = b"".join(chunks)
        if not audio:
            raise Exception("Seed TTS 返回空音频")
        if output_file:
            with open(output_file, "wb") as f:
                f.write(audio)
            return None
        return audio
