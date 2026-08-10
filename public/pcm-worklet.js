// AudioWorklet：把麦克风音频实时重采样为 16kHz 单声道 PCM16（供字节流式 ASR 使用）
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 输入采样率（通常 48000 或 44100）到 16000 的重采样比例
    this.ratio = sampleRate / 16000;
    this.buffer = new Float32Array(0);
    this.pos = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const channel = input[0];

    const merged = new Float32Array(this.buffer.length + channel.length);
    merged.set(this.buffer);
    merged.set(channel, this.buffer.length);
    this.buffer = merged;

    const out = [];
    let i = Math.floor(this.pos);
    while (i + 1 < this.buffer.length) {
      const frac = this.pos - i;
      const sample = this.buffer[i] * (1 - frac) + this.buffer[i + 1] * frac;
      out.push(Math.max(-1, Math.min(1, sample)));
      this.pos += this.ratio;
      i = Math.floor(this.pos);
    }

    // 保留未消费的尾部样本
    this.buffer = this.buffer.slice(i);
    this.pos = this.pos - i;

    // 每 200ms（3200 个 16k 采样）发一包
    if (out.length >= 3200) {
      const pcm = new Int16Array(out.length);
      for (let j = 0; j < out.length; j++) {
        const s = out[j];
        pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PCMCaptureProcessor);
