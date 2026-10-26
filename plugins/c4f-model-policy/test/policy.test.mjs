import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachPricing, baseId, classifyCost, DECISION, isAllowed, loadSnapshot, modelRef, policyDecision,
} from '../src/policy/index.js';
import { expandTokens, guardRecursion, runScript } from '../src/scripts/runner.js';

const cost = (input, output, read = 0, write = 0) => ({ input, output, cache: { read, write } });

async function tmpJson(value) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const file = join(dir, 'allowlist.json');
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

const VALID = { filteredProviders: ['OpenCode '], authorized: ['good-model'], banned: ['bad-model'] };

test('baseId strips provider prefix, #variant, case', () => {
  assert.equal(baseId('opencode-go/DeepSeek-V4.1-Flash#high'), 'deepseek-v4.1-flash');
  assert.equal(baseId('  a/b/c  '), 'c');
});

test('modelRef accepts string, {id}, {modelID}, garbage', () => {
  assert.deepEqual(modelRef('a/b/c'), { providerID: 'a', id: 'b/c' });
  assert.deepEqual(modelRef('solo'), { providerID: '', id: 'solo' });
  assert.deepEqual(modelRef({ providerID: 'p', modelID: 'm' }), { providerID: 'p', id: 'm' });
  assert.deepEqual(modelRef(undefined), { providerID: '', id: '' });
});

test('classifyCost', () => {
  assert.equal(classifyCost([cost(0, 0)]), 'FREE');
  assert.equal(classifyCost([cost(0, 0, 0, 0.1)]), 'PAID');
  assert.equal(classifyCost([cost(0, 0), cost(2, 0)]), 'PAID');
  assert.equal(classifyCost([{ ...cost(0, 0), tier: { type: 'context', size: 200000 } }]), 'FREE');
  for (const bad of [
    undefined, [], [null],
    [{ input: '0', output: 0, cache: { read: 0, write: 0 } }],
    [cost(-1, 0)],
    [cost(Number.NaN, 0)],
    [{ input: 0, output: 0 }],
    [{ ...cost(0, 0), tier: { type: 'x', size: 1 } }],
  ]) assert.equal(classifyCost(bad), 'UNPRICED');
});

test('loadSnapshot rejects invalid allowlists', async () => {
  const cases = [
    'not json', '[]', '{}',
    { filteredProviders: [], authorized: ['a'] },
    { filteredProviders: ['p'], authorized: [] },
    { filteredProviders: ['p'], authorized: [{ id: '' }] },
    { filteredProviders: ['p'], authorized: ['a'], banned: [1] },
    { filteredProviders: ['p'], authorized: ['a'], banned: 'x' },
  ];
  for (const c of cases) await assert.rejects(loadSnapshot({ file: await tmpJson(c) }), /allowlist:/);
  await assert.rejects(loadSnapshot({ file: '/nonexistent/x.json' }), /cannot read/);
});

test('loadSnapshot normalizes valid allowlist', async () => {
  const s = await loadSnapshot({ file: await tmpJson(VALID) });
  assert.ok(s.filteredProviders.has('opencode'));
  assert.ok(s.authorized.has('good-model'));
  assert.ok(s.banned.has('bad-model'));
  assert.equal(s.pricingStatus, 'unavailable');
});

test('policyDecision order: scope > banned > authorized > FREE > deny', async () => {
  const base = await loadSnapshot({ file: await tmpJson(VALID) });
  const snap = attachPricing(base, {
    models: [
      { providerID: 'opencode', id: 'bad-model', cost: [cost(0, 0)] },
      { providerID: 'opencode', id: 'free-model', cost: [cost(0, 0)] },
      { providerID: 'opencode', id: 'paid-model', cost: [cost(1, 1)] },
      { providerID: 'opencode', id: 'unpriced-model' },
      { providerID: 'other', id: 'free-other', cost: [cost(0, 0)] },
    ],
  });
  const d = (providerID, id) => policyDecision(snap, { providerID, id });
  assert.equal(d('opencode', 'bad-model'), DECISION.BANNED);          // banned thắng cả FREE
  assert.equal(d('OPENCODE', 'GOOD-MODEL#high'), DECISION.AUTHORIZED);
  assert.equal(d('opencode', 'free-model'), DECISION.FREE);
  assert.equal(d('opencode', 'paid-model'), DECISION.DENIED);
  assert.equal(d('opencode', 'unpriced-model'), DECISION.DENIED);
  assert.equal(d('opencode', 'not-in-registry'), DECISION.DENIED);
  assert.equal(d('other', 'anything'), DECISION.OUT_OF_SCOPE);
  assert.equal(d('', 'x'), DECISION.DENIED);
  assert.equal(d('opencode', ''), DECISION.DENIED);
  assert.equal(snap.pricing.size, 4);                                  // provider 'other' không được định giá
});

test('attachPricing is pure and handles registry failure', async () => {
  const base = await loadSnapshot({ file: await tmpJson(VALID) });
  const ok = attachPricing(base, { models: [] });
  assert.equal(base.pricingStatus, 'unavailable');
  assert.equal(ok.pricingStatus, 'loaded');
  const failed = attachPricing(base, { models: null, error: 'boom' });
  assert.equal(failed.pricingStatus, 'unavailable');
  assert.equal(failed.pricingError, 'boom');
  assert.equal(attachPricing(null, {}), null);
});

test('isAllowed never throws and denies garbage', async () => {
  const snap = await loadSnapshot({ file: await tmpJson(VALID) });
  for (const g of [null, undefined, {}, [], { filteredProviders: 'x' }])
    assert.equal(isAllowed(g, { providerID: 'opencode', id: 'x' }), false);
  assert.equal(isAllowed(snap, null), false);
  assert.equal(isAllowed(snap, { providerID: 'opencode', id: 'good-model' }), true);
  assert.equal(isAllowed(snap, { providerID: 'elsewhere', id: 'x' }), true); // out of scope => allowed
});

test('runner: recursion guard, tokens, exit codes', async () => {
  assert.equal(guardRecursion(['/usr/bin/opencode', 'run']), 'spawns opencode');
  assert.equal(guardRecursion(['C:\\bin\\OpenCode.EXE']), 'spawns opencode');
  assert.equal(guardRecursion(['node', 'x.js']), null);
  assert.equal(expandTokens('{ROOT}/a/{HOME}', { ROOT: '/r', HOME: '/h' }), '/r/a//h');

  assert.equal((await runScript(['opencode'], 1000)).code, -2);
  assert.equal((await runScript(['node', '-e', 'process.exit(0)'], 3000)).code, 0);
  assert.equal((await runScript(['node', '-e', 'process.exit(3)'], 3000)).code, 3);
  assert.equal((await runScript(['node', '-e', 'setTimeout(()=>{},5000)'], 200)).code, -1);
  assert.equal((await runScript(['definitely-not-a-binary-xyz'], 1000)).code, -1);
  assert.equal((await runScript([], 1000)).code, -1);
});
