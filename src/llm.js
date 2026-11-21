// Offline fallback: Qwen2.5-1.5B (INT4 via Ollama). Only called when the deterministic parser gives up.
const env = typeof process !== 'undefined' ? process.env : {};
// In the browser we call our own server (/ollama) so there is no CORS and no direct exposure of Ollama.
const OLLAMA = typeof window !== 'undefined' ? '/ollama' : (env.OLLAMA_URL || 'http://localhost:11434');
export const QWEN_MODEL = env.QWEN_MODEL || 'qwen2.5:1.5b';

const SYSTEM = `You convert a kirana shopkeeper's Hindi/English/Hinglish sentence into JSON.
Return ONLY: {"actions":[{"kind":"credit|payment|correction|query_total|query_today|query_customer","customer":"name or null","amount":number or null,"date_offset_days":0}]}
credit = customer took goods on udhaar (owes more). payment = customer paid money back.
kal=-1, parso=-2, aaj=0. Amounts are integers in rupees. If unsure, return {"actions":[]}.`;

export async function parseWithQwen(text, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal: ctl.signal,
      body: JSON.stringify({
        model: QWEN_MODEL, stream: false, format: 'json', options: { temperature: 0 },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
      }),
    });
    const data = await res.json();
    const parsed = JSON.parse(data.message.content);
    return (parsed.actions || []).filter((a) => a && typeof a.kind === 'string').map((a) => ({
      kind: a.kind,
      amount: Number.isFinite(a.amount) ? Math.round(a.amount) : undefined,
      customer: { matches: [], name: a.customer ? String(a.customer).toLowerCase() : null },
      dateOffset: a.date_offset_days ?? 0,
      source: 'qwen',
    }));
  } catch {
    return []; // offline/slow model must never break the sale
  } finally {
    clearTimeout(timer);
  }
}
