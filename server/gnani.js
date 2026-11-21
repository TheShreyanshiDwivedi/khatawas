// ONE place that knows Gnani's wire protocol. Prisma v3.0 (STT) and Timbre v3.0 (TTS) over WebSocket.
// !! The message formats below are PLACEHOLDERS until filled in from Gnani's docs. !!
// Everything else in the app talks to /stt and /tts on our own server, never to Gnani directly,
// so the API key stays server-side.
import WebSocket from 'ws';

export const gnaniConfigured = () => !!(process.env.GNANI_API_KEY && process.env.GNANI_STT_WS_URL);

const headers = () => ({ Authorization: `Bearer ${process.env.GNANI_API_KEY}`, 'X-API-Key': process.env.GNANI_API_KEY });

// Browser sends: JSON {type:'start', hotwords:[...]}, then binary PCM16 16kHz mono chunks, then JSON {type:'stop'}.
// We forward to Prisma and relay transcripts back as JSON {type:'partial'|'final', text}.
export function bridgeStt(client) {
  let up = null;
  const queue = [];
  client.on('message', (data, isBinary) => {
    if (!isBinary) {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'start') {
        up = new WebSocket(process.env.GNANI_STT_WS_URL, { headers: headers() });
        up.on('open', () => {
          // TODO(gnani-docs): exact init message (language, sample rate, hotword/context-biasing field names).
          up.send(JSON.stringify({ config: { language: 'hi-IN', sample_rate: 16000, encoding: 'pcm16', hotwords: msg.hotwords || [] } }));
          queue.splice(0).forEach((c) => up.send(c));
        });
        up.on('message', (m) => {
          // TODO(gnani-docs): map Prisma's response shape to { text, is_final }.
          try {
            const r = JSON.parse(m.toString());
            const text = r.text ?? r.transcript ?? r.result?.text;
            if (text) client.send(JSON.stringify({ type: r.is_final || r.final ? 'final' : 'partial', text }));
          } catch { /* ignore non-JSON frames */ }
        });
        up.on('error', (e) => client.send(JSON.stringify({ type: 'error', message: String(e.message) })));
      } else if (msg.type === 'stop' && up) {
        // TODO(gnani-docs): end-of-stream message, if Prisma needs one.
        if (up.readyState === WebSocket.OPEN) up.send(JSON.stringify({ eof: true }));
      }
    } else if (up?.readyState === WebSocket.OPEN) up.send(data);
    else queue.push(data);
  });
  client.on('close', () => up?.close());
}

// Browser sends JSON {type:'speak', text, lang}; we stream back binary audio chunks then {type:'done'}.
export function bridgeTts(client) {
  client.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== 'speak') return;
    const up = new WebSocket(process.env.GNANI_TTS_WS_URL, { headers: headers() });
    up.on('open', () => {
      // TODO(gnani-docs): exact Timbre request (voice id, language, output encoding).
      up.send(JSON.stringify({ text: msg.text, language: msg.lang || 'hi-IN', output_format: 'pcm16', sample_rate: 24000 }));
    });
    up.on('message', (m, isBinary) => (isBinary ? client.send(m, { binary: true }) : null));
    up.on('close', () => client.send(JSON.stringify({ type: 'done' })));
    up.on('error', (e) => client.send(JSON.stringify({ type: 'error', message: String(e.message) })));
  });
}
