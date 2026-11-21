// The only file that knows Gnani Vachana's wire protocol (verified against docs.gnani.ai):
//   STT  wss://api.vachana.ai/stt/v3/stream   Prisma v3.0. Config in upgrade headers, raw PCM16 mono frames of exactly
//        1024 bytes, text frame {"type":"commit"} closes the open utterance, replies are JSON {type:"transcript", text}.
//        There are NO partial transcripts: each VAD segment yields one final transcript.
//   TTS  wss://api.vachana.ai/api/v1/tts      Timbre v3.0. One JSON request, replies are JSON with base64 audio chunks.
// The API key stays on the server; the browser only ever talks to /stt and /tts on this server.
import WebSocket from 'ws';

export const gnaniConfigured = () => !!(process.env.GNANI_API_KEY && process.env.GNANI_STT_WS_URL);

const FRAME = 1024; // 512 samples x 2 bytes = 32 ms at 16 kHz

// Header values must be plain ASCII/latin1; keep only safe keyterms (Prisma accepts up to 200).
const keyterms = (list) => JSON.stringify((list || []).filter((w) => /^[\x20-\x7e]+$/.test(w)).slice(0, 50));

export function openStt({ hotwords = [], language = process.env.GNANI_STT_LANGUAGE || 'hi-IN', format = process.env.GNANI_STT_FORMAT || 'codemix' } = {}) {
  const ws = new WebSocket(process.env.GNANI_STT_WS_URL, {
    headers: {
      'x-api-key-id': process.env.GNANI_API_KEY,
      language_code: language,
      model: 'prisma-v3.0',
      'x-sample-rate': '16000',
      format,
      keyterms: keyterms(hotwords),
    },
  });
  let pending = Buffer.alloc(0);
  const api = {
    ws,
    // Accepts PCM16 of any length, forwards exact 1024-byte frames.
    sendPcm(buf) {
      pending = Buffer.concat([pending, buf]);
      while (pending.length >= FRAME && ws.readyState === WebSocket.OPEN) {
        ws.send(pending.subarray(0, FRAME));
        pending = pending.subarray(FRAME);
      }
    },
    // Flush the tail, add ~0.5 s of silence so the last word finalises, then force-close the utterance.
    finish() {
      if (ws.readyState !== WebSocket.OPEN) return;
      const tail = Buffer.concat([pending, Buffer.alloc(FRAME * 16)]);
      for (let i = 0; i + FRAME <= tail.length; i += FRAME) ws.send(tail.subarray(i, i + FRAME));
      pending = Buffer.alloc(0);
      ws.send(JSON.stringify({ type: 'commit' }));
    },
  };
  return api;
}

export function bridgeStt(client) {
  let stt = null, stopped = false, doneTimer = null;
  const send = (o) => client.readyState === 1 && client.send(JSON.stringify(o));
  const scheduleDone = (ms) => { clearTimeout(doneTimer); doneTimer = setTimeout(() => send({ type: 'done' }), ms); };

  client.on('message', (data, isBinary) => {
    if (isBinary) { stt?.sendPcm(Buffer.from(data)); return; }
    const msg = JSON.parse(data.toString());
    if (msg.type === 'start') {
      stopped = false;
      stt = openStt({ hotwords: msg.hotwords });
      stt.ws.on('message', (m) => {
        let r; try { r = JSON.parse(m.toString()); } catch { return; }
        if (r.type === 'transcript' && r.text) {
          send({ type: 'final', text: r.text, latency: r.latency, lang: r.detected_language_code });
          if (stopped) scheduleDone(250); // allow a following segment, then finish
        } else if (r.type === 'error') send({ type: 'error', message: r.message });
      });
      stt.ws.on('unexpected-response', (_q, res) => send({ type: 'error', message: `Gnani rejected the connection (HTTP ${res.statusCode}). Check GNANI_API_KEY.` }));
      stt.ws.on('error', (e) => send({ type: 'error', message: String(e.message) }));
    } else if (msg.type === 'stop' && stt) {
      stopped = true;
      stt.finish();
      scheduleDone(2500); // if no speech was detected Gnani sends nothing; don't hang the sale
    }
  });
  client.on('close', () => { clearTimeout(doneTimer); stt?.ws.close(); });
}

// Synthesize via Timbre v3.0 over WebSocket. onAudio(Buffer) is called per chunk as it arrives (raw PCM16 mono).
export function synthesize(text, { sampleRate = 24000, onAudio, language = process.env.GNANI_TTS_LANGUAGE || 'hi-en', voice = process.env.GNANI_TTS_VOICE || 'Shivani' } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(process.env.GNANI_TTS_WS_URL, { headers: { 'X-API-Key-ID': process.env.GNANI_API_KEY } });
    let firstAt = null;
    const t0 = Date.now();
    ws.on('open', () => ws.send(JSON.stringify({
      text, model: 'timbre-v3.0', voice, language, speed: 1.0,
      audio_config: { sample_rate: sampleRate, encoding: 'linear_pcm', container: 'raw', num_channels: 1, sample_width: 2 },
    })));
    ws.on('message', (m) => {
      let r; try { r = JSON.parse(m.toString()); } catch { return; }
      if (r.type === 'audio' && r.data?.audio) {
        firstAt ??= Date.now() - t0;
        onAudio?.(Buffer.from(r.data.audio, 'base64'));
      } else if (r.type === 'complete') { ws.close(); resolve({ firstAudioMs: firstAt, totalMs: Date.now() - t0 }); }
      else if (r.type === 'error') { ws.close(); reject(new Error(r.message || 'TTS error')); }
    });
    ws.on('unexpected-response', (_q, res) => reject(new Error(`Gnani TTS rejected the connection (HTTP ${res.statusCode})`)));
    ws.on('error', reject);
  });
}

export function bridgeTts(client) {
  client.on('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== 'speak') return;
    try {
      await synthesize(msg.text, { onAudio: (b) => client.readyState === 1 && client.send(b, { binary: true }) });
      client.send(JSON.stringify({ type: 'done' }));
    } catch (e) { client.send(JSON.stringify({ type: 'error', message: String(e.message) })); }
  });
}
