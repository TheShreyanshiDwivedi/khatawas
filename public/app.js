import { Ledger } from '/src/ledger.js';
import { handleTranscript } from '/src/pipeline.js';
import { saveLedger, loadLedger, wipeAll } from '/store.js';
import { createListener, speak, gnaniEnabled } from '/speech.js';

const $ = (id) => document.getElementById(id);
const useGnani = await gnaniEnabled();
let ledger = Ledger.fromJSON(await loadLedger());
let listener;
let disclosed = false; // the first spoken reply of a session must say it is an AI
$('mode').textContent = useGnani ? 'STT: Gnani Prisma v3 · TTS: Timbre v3' : 'DEV MODE: browser speech (Gnani not configured)';

function render() {
  $('rows').innerHTML = ledger.customers.map((c) => {
    const b = ledger.balance(c.id);
    return `<tr><td>${esc(c.name)}</td><td class="${b > 0 ? 'owes' : ''}">${b}</td></tr>`;
  }).join('') || '<tr><td colspan="2">Koi khata nahi abhi.</td></tr>';
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function process(text) {
  const t0 = performance.now();
  window.__lastText = text; // debug aid: raw transcript as received
  $('heard').textContent = text || '—';
  if (!text) return;
  const r = await handleTranscript(text, ledger);
  if (r.changed) await saveLedger(ledger.toJSON());
  let reply = r.replies.join(' ');
  if (!disclosed) { reply = `Main ek AI sahayak hoon. ${reply}`; disclosed = true; }
  $('reply').textContent = reply;
  $('via').textContent = r.via;
  $('ms').textContent = `${Math.round(performance.now() - t0)} ms to reply`;
  render();
  speak(reply, { useGnani });
}

// Push-to-talk (hold). Pointer events cover touch + mouse.
const ptt = $('ptt');
async function down(e) {
  e.preventDefault();
  if (ptt.classList.contains('on')) return;
  ptt.classList.add('on'); ptt.textContent = 'Listening…';
  try {
    listener ||= await createListener({
      hotwords: () => ledger.customers.map((c) => c.name), // customer names biased into STT, re-read on every press
      onPartial: (t) => { $('heard').textContent = t; }, useGnani,
    });
    await listener.start();
  } catch (err) { $('reply').textContent = String(err.message || err); ptt.classList.remove('on'); ptt.textContent = 'Hold to talk'; }
}
async function up() {
  if (!ptt.classList.contains('on')) return;
  ptt.classList.remove('on'); ptt.textContent = 'Hold to talk';
  if (listener) { const text = await listener.stop(); listener = useGnani ? listener : null; await process(text); }
}
ptt.addEventListener('pointerdown', down);
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => ptt.addEventListener(ev, up));
addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body && !e.repeat) down(e); });
addEventListener('keyup', (e) => { if (e.code === 'Space' && e.target === document.body) up(); });

$('typed').addEventListener('submit', (e) => { e.preventDefault(); const v = $('txt').value.trim(); $('txt').value = ''; process(v); });
$('addcust').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $('newcust').value.trim(); $('newcust').value = '';
  if (!v) return;
  ledger.addCustomer(v); await saveLedger(ledger.toJSON()); listener = null; render(); // new listener so the name list is sent next time
});
$('wipe').addEventListener('click', async () => { await wipeAll(); ledger = new Ledger(); render(); $('reply').textContent = 'Saara data delete ho gaya.'; });

render();
