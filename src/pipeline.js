// transcript -> actions (parser first, Qwen only as fallback) -> ledger -> spoken reply
import { parse } from './parser.js';
import { parseWithQwen } from './llm.js';

export async function handleTranscript(text, ledger, { useQwen = true } = {}) {
  const pend = ledger.resolvePending(text);
  if (pend) return { ...pend, via: 'clarify' };
  let { actions, needs_llm } = parse(text, { customers: ledger.customerList() });
  let via = 'parser';
  if (needs_llm && useQwen) {
    const q = await parseWithQwen(text);
    if (q.length) { actions = actions.concat(q); via = 'qwen'; }
  }
  if (!actions.length) return { replies: ['Samajh nahi aaya, dobara bolein.'], changed: false, via };
  return { ...ledger.apply(actions), via };
}
