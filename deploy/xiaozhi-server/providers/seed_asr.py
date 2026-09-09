import asyncio
import gzip
import json
import time
import uuid

import websockets

from config.logger import setup_logging
from core.providers.asr.base import ASRProviderBase
from core.providers.asr.dto.dto import InterfaceType

TAG = __name__
logger = setup_logging()

SERVER_FULL_RESPONSE = 0b1001
SERVER_ERROR_RESPONSE = 0b1111
JSON_SERIALIZATION = 0b0001
GZIP_COMPRESSION = 0b0001
FINAL_FLAG = 0b0010


class ASRProvider(ASRProviderBase):
    """火山引擎 Seed ASR v3（bigmodel_async）适配：复用食刻现有 VOLC_SPEECH_API_KEY。"""

    def __init__(self, config, delete_audio_file):
        super().__init__()
        self.interface_type = InterfaceType.NON_STREAM
        self.api_key = config.get("api_key", "")
        self.resource_id = config.get("resource_id", "volc.seedasr.sauc.duration")
        self.ws_url = config.get(
            "ws_url", "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"
        )
        self.output_dir = config.get("output_dir", "tmp/")
        self.delete_audio_file = delete_audio_file
        self.timeout = float(config.get("timeout", 30))

    def _full_header(self):
        return bytearray([0x11, 0x11, 0x11, 0x00])

    def _audio_header(self, last=False):
        return bytearray([0x11, 0x23 if last else 0x21, 0x01, 0x00])

    def _construct_request(self, reqid):
        return {
            "user": {"uid": "shike"},
            "audio": {
                "format": "pcm",
                "codec": "raw",
                "rate": 16000,
                "bits": 16,
                "channel": 1,
            },
            "request": {
                "reqid": reqid,
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": True,
                "show_utterances": True,
                "result_type": "full",
                "enable_nonstream": True,
                "end_window_size": 800,
                "force_to_speech_time": 1000,
            },
        }

    async def _send_request(self, pcm: bytes) -> str:
        headers = {
            "X-Api-Resource-Id": self.resource_id,
            "X-Api-Request-Id": str(uuid.uuid4()),
            "X-Api-Sequence": "-1",
            "X-Api-Connect-Id": str(uuid.uuid4()),
            "X-Api-Key": self.api_key,
        }
        try:
            async with websockets.connect(
                self.ws_url, additional_headers=headers
            ) as ws:
                payload = gzip.compress(
                    json.dumps(
                        self._construct_request(str(uuid.uuid4())),
                        ensure_ascii=False,
                    ).encode("utf-8")
                )
                frame = self._full_header()
                frame += (1).to_bytes(4, "big", signed=True)
                frame += len(payload).to_bytes(4, "big")
                frame += payload
                await ws.send(bytes(frame))

                step = 3200
                seq = 1
                for i in range(0, len(pcm), step):
                    seq += 1
                    chunk = pcm[i : i + step]
                    if len(chunk) % 2:
                        chunk = chunk[:-1]
                    body = gzip.compress(chunk)
                    f = self._audio_header(False)
                    f += seq.to_bytes(4, "big", signed=True)
                    f += len(body).to_bytes(4, "big")
                    f += body
                    await ws.send(bytes(f))

                body = gzip.compress(b"")
                f = self._audio_header(True)
                f += (-(seq + 1)).to_bytes(4, "big", signed=True)
                f += len(body).to_bytes(4, "big")
                f += body
                await ws.send(bytes(f))

                final_text = ""
                deadline = time.time() + self.timeout
                while time.time() < deadline:
                    raw = await asyncio.wait_for(ws.recv(), timeout=8)
                    if isinstance(raw, str):
                        continue
                    frame = bytes(raw)
                    if len(frame) < 4:
                        continue
                    hs = frame[0] & 0x0F
                    msg_type = frame[1] >> 4
                    flags = frame[1] & 0x0F
                    serial = frame[2] >> 4
                    comp = frame[2] & 0x0F
                    logger.bind(tag=TAG).debug(
                        f"ASR 响应帧 type={msg_type} flags={flags} "
                        f"serial={serial} comp={comp} len={len(frame)}"
                    )
                    off = hs * 4
                    if flags & 0x01:
                        off += 4
                    if msg_type == SERVER_ERROR_RESPONSE:
                        code = int.from_bytes(frame[off : off + 4], "big", signed=True)
                        detail = ""
                        if len(frame) >= off + 8:
                            msize = int.from_bytes(
                                frame[off + 4 : off + 8], "big"
                            )
                            body = frame[off + 8 : off + 8 + msize]
                            if body[:2] == b"\x1f\x8b":
                                try:
                                    body = gzip.decompress(body)
                                except Exception:
                                    pass
                            try:
                                detail = body.decode("utf-8", "ignore")[:300]
                            except Exception:
                                detail = repr(body[:300])
                        logger.bind(tag=TAG).error(
                            f"Seed ASR 服务端错误 code={code} detail={detail}"
                        )
                        return ""
                    if msg_type != SERVER_FULL_RESPONSE:
                        continue
                    if len(frame) < off + 4:
                        continue
                    size = int.from_bytes(frame[off : off + 4], "big")
                    off += 4
                    data = frame[off : off + size]
                    if comp == GZIP_COMPRESSION and data:
                        try:
                            data = gzip.decompress(data)
                        except Exception:
                            pass
                    payload = {}
                    if serial == JSON_SERIALIZATION and data:
                        try:
                            payload = json.loads(data.decode("utf-8"))
                        except Exception:
                            payload = {}
                    logger.bind(tag=TAG).debug(
                        f"ASR payload={json.dumps(payload, ensure_ascii=False)[:400]}"
                    )
                    if flags & FINAL_FLAG:
                        logger.bind(tag=TAG).debug(
                            f"ASR 最终帧 payload={json.dumps(payload, ensure_ascii=False)[:500]}"
                        )
                        res = payload.get("result") or {}
                        if isinstance(res, dict):
                            final_text = res.get("text") or ""
                        elif isinstance(res, list) and res:
                            final_text = res[0].get("text") or ""
                        return final_text
            return final_text
        except Exception as e:
            logger.bind(tag=TAG).error(f"Seed ASR request failed: {e}")
            return ""

    async def speech_to_text(self, opus_data, session_id, artifacts=None):
        try:
            if artifacts is None or not getattr(artifacts, "pcm_bytes", b""):
                return "", None
            start = time.time()
            text = await self._send_request(artifacts.pcm_bytes)
            if text:
                logger.bind(tag=TAG).info(
                    f"Seed ASR ({time.time() - start:.2f}s): {text}"
                )
            return text, artifacts.file_path
        except Exception as e:
            logger.bind(tag=TAG).error(f"Seed ASR failed: {e}")
            return "", None
