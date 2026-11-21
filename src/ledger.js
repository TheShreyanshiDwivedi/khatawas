// Ledger logic: applies parsed actions, handles corrections + duplicate-name clarification, answers queries.
import { nameKey, displayName } from './translit.js';
import { findAmount } from './numbers.js';

export class Ledger {
  constructor() { this.customers = []; this.txns = []; this.nextId = 1; this.pending = null; }

  // Register a customer with no entry, so their name is known to Prisma as a keyterm before it is spoken.
  addCustomer(name) {
    const key = nameKey(name);
    if (!key) return null;
    let c = this.customers.find((x) => nameKey(x.name) === key);
    if (!c) { c = { id: this.customers.length + 1, name: displayName(name.trim()) }; this.customers.push(c); }
    return c;
  }

  customerList() { return this.customers.map((c) => ({ id: c.id, name: c.name })); }

  _resolve(ref, create = true) {
    if (ref.matches?.length === 1) return { customer: this.customers.find((c) => c.id === ref.matches[0].id) };
    if (ref.matches?.length > 1) return { ambiguous: ref.matches };
    if (!ref.name) return { missing: true };
    const key = nameKey(ref.name);
    let c = this.customers.find((x) => nameKey(x.name) === key);
    if (!c && !create) return { notFound: true };
    if (!c) { c = { id: this.customers.length + 1, name: displayName(ref.name) }; this.customers.push(c); }
    return { customer: c };
  }

  balance(customerId) {
    return this.txns.filter((t) => t.customerId === customerId)
      .reduce((s, t) => s + (t.kind === 'credit' ? t.amount : -t.amount), 0);
  }

  // Returns { replies: [string], changed: bool }. Replies are short, speakable sentences.
  apply(actions, today = new Date().toISOString().slice(0, 10)) {
    const replies = [];
    if (actions.length) this.pending = null; // a new request replaces any unanswered question
    for (const a of actions) {
      if (a.kind === 'ask_direction') {
        const nm = a.customer.matches?.length === 1 ? a.customer.matches[0].name : (a.customer.matches?.length > 1 ? a.customer.matches[0].name.split(' ')[0] : displayName(a.customer.name || ''));
        this.pending = { type: 'direction', action: a };
        replies.push(`${nm} ka ${a.amount} rupaye, udhaar ya jama?`);
      } else if (a.kind === 'credit' || a.kind === 'payment') {
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
        const r = this._resolve(a.customer, false);
        if (r.notFound) replies.push('Is naam ka khata nahi mila.');
        else if (r.customer) replies.push(`${r.customer.name} ka total ${this.balance(r.customer.id)} rupaye baaki hai.`);
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
    if (this.pending.type === 'direction') {
      const t = text.toLowerCase().replace(/[.,।!?;:]/g, ' ');
      const cred = /(udhaar|udhar|उधार|credit|likh|baaki|बाकी|sudhaar|सुधार)/.test(t), pay = /(jama|जमा|diya|दिया|paid|wapas|वापस|payment|chukaya)/.test(t);
      if (cred === pay) return null; // neither (or both): not an answer
      if (findAmount(t.split(/\s+/).filter(Boolean)) || t.split(/\s+/).filter(Boolean).length > 4) return null; // a new sentence with an amount is not an answer
      const a = { ...this.pending.action, kind: cred ? 'credit' : 'payment' };
      return this.apply([a]);
    }
    const w = text.toLowerCase().replace(/[.,।!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); // Prisma adds punctuation ("Gupta.")
    const keys = w.split(/\s+/).map((t) => nameKey(t));
    const pick = this.pending.options.find((o) => keys.includes(nameKey(o.name.split(' ').pop())) || w.includes(o.name.toLowerCase()));
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
