import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { findAmount } from '../src/numbers.js';

const NOW = new Date('2026-11-21T10:00:00Z');
const amt = (s) => findAmount(s.split(' '))?.value;

test('amounts in any spoken form', () => {
  assert.equal(amt('340'), 340);
  assert.equal(amt('teen sau chaalis'), 340);
  assert.equal(amt('three forty'), 340);
  assert.equal(amt('three hundred forty'), 340);
  assert.equal(amt('dedh sau'), 150);
  assert.equal(amt('dhai sau'), 250);
  assert.equal(amt('saade teen sau'), 350);
  assert.equal(amt('do hazaar paanch sau'), 2500);
  assert.equal(amt('paanch sau'), 500);
  assert.equal(amt('chaar sau tees'), 430);
});

test('credit + payment in one utterance with relative date', () => {
  const r = parse('Ramesh ka 340 udhaar, kal 200 diya tha', { now: NOW });
  assert.equal(r.actions.length, 2);
  assert.deepEqual([r.actions[0].kind, r.actions[0].amount, r.actions[0].customer.name], ['credit', 340, 'ramesh']);
  assert.deepEqual([r.actions[1].kind, r.actions[1].amount, r.actions[1].date], ['payment', 200, '2026-11-20']);
  assert.equal(r.actions[1].customer.name, 'ramesh');
});

test('spoken correction', () => {
  const r = parse('nahi, 430', { now: NOW });
  assert.equal(r.actions[0].kind, 'correction');
  assert.equal(r.actions[0].amount, 430);
});

test('queries', () => {
  assert.equal(parse('Aaj kitna udhaar gaya?', { now: NOW }).actions[0].kind, 'query_today');
  const r = parse('Ramesh ka total?', { now: NOW });
  assert.equal(r.actions[0].kind, 'query_customer');
  assert.equal(r.actions[0].customer.name, 'ramesh');
});

test('known customer hotwords + duplicate first name', () => {
  const customers = [{ id: 1, name: 'Ramesh Kumar' }, { id: 2, name: 'Ramesh Gupta' }];
  const r = parse('Ramesh ka 500 udhaar', { customers, now: NOW });
  assert.equal(r.actions[0].customer.matches.length, 2);
});

test('gibberish falls through to the LLM', () => {
  assert.equal(parse('mausam bahut accha hai', { now: NOW }).needs_llm, true);
});

test('parser is fast (<5ms)', () => {
  const t = performance.now();
  for (let i = 0; i < 100; i++) parse('Ramesh ka teen sau chaalis udhaar, kal 200 diya tha', { now: NOW });
  assert.ok((performance.now() - t) / 100 < 5);
});

test('new customers keep a two-word name', () => {
  assert.equal(parse('Ramesh Kumar ka 100 udhaar', { now: NOW }).actions[0].customer.name, 'ramesh kumar');
  assert.equal(parse('kal Sunita ka 50 diya', { now: NOW }).actions[0].customer.name, 'sunita');
});

test('Hindi script (what Gnani Prisma actually returns)', () => {
  assert.equal(amt('तीन सौ चालीस'), 340);
  assert.equal(amt('पाँच सौ'), 500);
  assert.equal(amt('डेढ़ सौ'), 150);
  const a = parse('Ramesh का तीन सौ चालीस रुपये उधार।', { now: NOW }).actions;
  assert.deepEqual([a[0].kind, a[0].amount, a[0].customer.name], ['credit', 340, 'ramesh']);
});

test('two entries with no comma: "500 udhaar kal 200 diya"', () => {
  const a = parse('Sunita का पाँच सौ उधार कल दो सौ दिया था।', { now: NOW }).actions;
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].kind, a[0].amount, a[1].kind, a[1].amount, a[1].date], ['credit', 500, 'payment', 200, '2026-11-20']);
  assert.equal(a[1].customer.name, 'sunita');
  const b = parse('Ramesh ka 340 udhaar kal 200 diya', { now: NOW }).actions;
  assert.deepEqual(b.map((x) => [x.kind, x.amount]), [['credit', 340], ['payment', 200]]);
});
