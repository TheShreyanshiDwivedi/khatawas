// Downsamples mic audio to 16 kHz mono PCM16 and posts ~100 ms chunks. Runs off the main thread.
class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.ratio = sampleRate / 16000; this.acc = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) { this.acc -= this.ratio; this.buf.push(Math.max(-1, Math.min(1, ch[i]))); }
    }
    if (this.buf.length >= 1600) {
      const out = new Int16Array(this.buf.length);
      this.buf.forEach((v, i) => { out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; });
      this.port.postMessage(out.buffer, [out.buffer]);
      this.buf = [];
    }
    return true;
  }
}
registerProcessor('pcm', Pcm);
