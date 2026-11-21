// Ledger logic: applies parsed actions, handles corrections + duplicate-name clarification, answers queries.
import { titleCase } from './parser.js';

export class Ledger {
  constructor() { this.customers = []; this.txns = []; this.nextId = 1; this.pending = null; }

  customerList() { return this.customers.map((c) => ({ id: c.id, name: c.name })); }

  _resolve(ref) {
    if (ref.matches?.length === 1) return { customer: this.customers.find((c) => c.id === ref.matches[0].id) };
    if (ref.matches?.length > 1) return { ambiguous: ref.matches };
    if (!ref.name) return { missing: true };
    let c = this.customers.find((x) => x.name.toLowerCase() === ref.name);
    if (!c) { c = { id: this.customers.length + 1, name: titleCase(ref.name) }; this.customers.push(c); }
    return { customer: c };
  }

  balance(customerId) {
    return this.txns.filter((t) => t.customerId === customerId)
      .reduce((s, t) => s + (t.kind === 'credit' ? t.amount : -t.amount), 0);
  }

  // Returns { replies: [string], changed: bool }. Replies are short, speakable sentences.
  apply(actions, today = new Date().toISOString().slice(0, 10)) {
    const replies = [];
    for (const a of actions) {
      if (a.kind === 'credit' || a.kind === 'payment') {
        const r = this._resolve(a.customer);
        if (r.ambiguous) {
          this.pending = { action: a, options: r.ambiguous };
          replies.push(`Kaun sa ${a.customer.matches[0].name.split(' ')[0]}? ${r.ambiguous.map((o) => o.name).join(' ya ')}?`);
          continue;
        }
        if (r.missing) { replies.push('Kiska naam?'); continue; }
        const t = { id: this.nextId++, customerId: r.customer.id, kind: a.kind, amount: a.amount, date: a.date || today };
        this.txns.push(t);
        replies.push(`${r.customer.name} ka ${a.amount} rupaye ${a.kind === 'credit' ? 'udhaar' : 'jama'} likh diya. Total ${this.balance(r.customer.id)}.`);
      } else if (a.kind === 'correction') {
        const last = this.txns[this.txns.length - 1];
        if (!last) { replies.push('Kuch sudharne ko nahi hai.'); continue; }
        last.amount = a.amount;
        const c = this.customers.find((x) => x.id === last.customerId);
        replies.push(`Theek hai, ${c.name} ka ${a.amount} kar diya. Total ${this.balance(c.id)}.`);
      } else if (a.kind === 'query_today') {
        const kind = a.direction === 'payment' ? 'payment' : 'credit';
        const sum = this.txns.filter((t) => t.date === today && t.kind === kind).reduce((s, t) => s + t.amount, 0);
        replies.push(`Aaj ${sum} rupaye ${kind === 'credit' ? 'udhaar gaya' : 'wapas aaya'}.`);
      } else if (a.kind === 'query_customer') {
        const r = this._resolve(a.customer);
        if (r.customer) replies.push(`${r.customer.name} ka total ${this.balance(r.customer.id)} rupaye baaki hai.`);
        else if (r.ambiguous) replies.push(`Kaun sa? ${r.ambiguous.map((o) => o.name).join(' ya ')}?`);
      } else if (a.kind === 'query_total') {
        replies.push(`Kul baaki ${this.customers.reduce((s, c) => s + this.balance(c.id), 0)} rupaye hai.`);
      }
    }
    return { replies, changed: actions.length > 0 };
  }

  // Answer to a "which Ramesh?" question
  resolvePending(text) {
    if (!this.pending) return null;
    const w = text.toLowerCase();
    const pick = this.pending.options.find((o) => w.includes(o.name.toLowerCase().split(' ').pop()) || w.includes(o.name.toLowerCase()));
    if (!pick) return null;
    const a = { ...this.pending.action, customer: { matches: [pick], name: null } };
    this.pending = null;
    return this.apply([a]);
  }
}

Ledger.prototype.toJSON = function () {
  return { customers: this.customers, txns: this.txns, nextId: this.nextId };
};
Ledger.fromJSON = function (o) {
  const l = new Ledger();
  if (o) { l.customers = o.customers || []; l.txns = o.txns || []; l.nextId = o.nextId || 1; }
  return l;
};
