import "server-only";

/** 从 WAV 中提取 PCM（16bit little-endian）。返回 { pcm, sampleRate, channels, bits }。 */
export function parseWav(buf: Buffer): {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bits: number;
} {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    // 不是标准 WAV，按裸 PCM 16bit 处理
    return { pcm: buf, sampleRate: 16000, channels: 1, bits: 16 };
  }
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  // 遍历 chunk 找到 data
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      return {
        pcm: buf.subarray(off + 8, off + 8 + size),
        sampleRate,
        channels,
        bits,
      };
    }
    off += 8 + size + (size & 1);
  }
  return { pcm: Buffer.alloc(0), sampleRate, channels, bits };
}

/** 把 16bit PCM 封装成标准 WAV。 */
export function pcmToWav(
  pcm: Buffer,
  sampleRate = 16000,
  channels = 1,
  bits = 16,
): Buffer {
  const bytesPerSample = bits / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}
