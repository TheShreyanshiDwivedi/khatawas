import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';
import { handleTranscript } from '../src/pipeline.js';

const run = async (l, t) => (await handleTranscript(t, l, { useQwen: false }));

test('credit, payment, balance', async () => {
  const l = new Ledger();
  await run(l, 'Ramesh ka 340 udhaar, kal 200 diya tha');
  assert.equal(l.balance(1), 140);
});

test('spoken correction changes last amount', async () => {
  const l = new Ledger();
  await run(l, 'Ramesh ka 340 udhaar');
  const r = await run(l, 'nahi, 430');
  assert.equal(l.balance(1), 430);
  assert.match(r.replies[0], /430/);
});

test('two Ramesh -> asks which one, then books it', async () => {
  const l = new Ledger();
  l.customers = [{ id: 1, name: 'Ramesh Kumar' }, { id: 2, name: 'Ramesh Gupta' }];
  const q = await run(l, 'Ramesh ka 500 udhaar');
  assert.match(q.replies[0], /Kaun sa/);
  await run(l, 'Gupta');
  assert.equal(l.balance(2), 500);
  assert.equal(l.balance(1), 0);
});

test('spoken answers to queries', async () => {
  const l = new Ledger();
  await run(l, 'Ramesh ka 340 udhaar');
  assert.match((await run(l, 'Ramesh ka total?')).replies[0], /340/);
});
