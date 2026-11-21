// STT + TTS clients. Gnani Prisma/Timbre via our server when configured; browser fallbacks otherwise (dev only).
const wsUrl = (p) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${p}`;

export async function gnaniEnabled() {
  try { return (await (await fetch('/api/config')).json()).gnani; } catch { return false; }
}

// --- STT: push-to-talk. start() begins streaming; stop() resolves with the final transcript.
export async function createListener({ hotwords = [], onPartial = () => {}, useGnani }) {
  if (!useGnani) return webSpeechListener(onPartial);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule('/pcm-worklet.js');
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm');
  src.connect(node);
  let ws, finalText = '', resolveFinal;
  return {
    async start() {
      finalText = '';
      ws = new WebSocket(wsUrl('/stt'));
      ws.binaryType = 'arraybuffer';
      await new Promise((r) => { ws.onopen = r; });
      ws.send(JSON.stringify({ type: 'start', hotwords: hotwords.slice(0, 50) }));
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'partial') onPartial(m.text);
        if (m.type === 'final') { finalText = (finalText + ' ' + m.text).trim(); onPartial(finalText); }
        if (m.type === 'done') resolveFinal?.(finalText);
        if (m.type === 'error') onPartial(m.message);
      };
      node.port.onmessage = (e) => ws.readyState === 1 && ws.send(e.data);
    },
    stop() {
      return new Promise((res) => {
        resolveFinal = res;
        ws.send(JSON.stringify({ type: 'stop' }));
        setTimeout(() => res(finalText), 4000); // safety net: never hang the sale
      });
    },
  };
}

function webSpeechListener(onPartial) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) throw new Error('No speech recognition available. Configure Gnani in .env or use Chrome.');
  let rec, text = '', done;
  return {
    async start() {
      text = ''; rec = new SR(); rec.lang = 'hi-IN'; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => { text = [...e.results].map((r) => r[0].transcript).join(' '); onPartial(text); };
      rec.onend = () => done?.(text);
      rec.start();
    },
    stop() { return new Promise((res) => { done = res; rec.stop(); }); },
  };
}

// --- TTS
let playCtx;
export async function speak(text, { useGnani }) {
  if (!useGnani) {
    const u = new SpeechSynthesisUtterance(text); u.lang = 'hi-IN';
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    return;
  }
  playCtx ||= new AudioContext({ sampleRate: 24000 });
  const ws = new WebSocket(wsUrl('/tts'));
  ws.binaryType = 'arraybuffer';
  let t = playCtx.currentTime + 0.05;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'speak', text, lang: 'hi-IN' }));
  ws.onmessage = (e) => {
    if (typeof e.data === 'string') { if (JSON.parse(e.data).type === 'done') ws.close(); return; }
    const pcm = new Int16Array(e.data);
    const buf = playCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const s = playCtx.createBufferSource(); s.buffer = buf; s.connect(playCtx.destination);
    s.start(t); t += buf.duration; // schedule gaplessly so first audio plays as soon as the first chunk lands
  };
}
