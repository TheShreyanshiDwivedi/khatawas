// transcript -> actions (parser first, Qwen only as fallback) -> ledger -> spoken reply
import { parse } from './parser.js';
import { parseWithQwen } from './llm.js';

export async function handleTranscript(text, ledger, { useQwen = true } = {}) {
  const pend = ledger.resolvePending(text);
  if (pend) return { ...pend, via: 'clarify' };
  const parsed = parse(text, { customers: ledger.customerList() });
  let actions = parsed.actions;
  let via = 'parser';
  if (parsed.needs_llm && useQwen) {
    // Qwen only sees the clauses the rules could not understand, never the whole sentence.
    const lastName = [...actions].reverse().map((a) => a.customer?.name).find(Boolean) || null;
    for (const clause of parsed.unknown_clauses.length ? parsed.unknown_clauses : [text]) {
      const q = await parseWithQwen(clause, { fallbackCustomer: lastName });
      if (q.length) { actions = actions.concat(q); via = 'qwen'; }
    }
  }
  if (!actions.length) return { replies: ['Samajh nahi aaya, dobara bolein.'], changed: false, via };
  return { ...ledger.apply(actions), via };
}
