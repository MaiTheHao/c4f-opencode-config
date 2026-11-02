import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachPricing, baseId, BOOTSTRAP_RUNTIME, classifyCost, DECISION, DEFAULT_CLASSIFICATION, DEFAULT_DECISION, isAllowed, loadRuntime, loadSnapshot, modelRef, policyDecision,
} from '../src/policy/index.js';
import { pricingKey } from '../src/policy/ids.js';
import { expandTokens, guardRecursion, runScript } from '../src/scripts/runner.js';

const cost = (input, output, read = 0, write = 0) => ({ input, output, cache: { read, write } });

async function tmpJson(value) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const file = join(dir, 'allowlist.json');
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

const VALID = { filteredProviders: ['OpenCode '], authorized: ['good-model'], banned: ['bad-model'] };
const VALID_RUNTIME = { enabled: true, gate: 'interrupt', onSnapshotFailure: 'fail-closed', refreshMs: 60_000 };

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

test('golden: verdict matrix frozen from the current engine', () => {
  const snap = {
    filteredProviders: new Set(['opencode']),
    authorized: new Map([['auth-model', { id: 'auth-model' }]]),
    banned: new Set(['banned-model', 'both-model']),
    pricing: new Map([
      [pricingKey('opencode', 'free-model'), { classification: 'FREE' }],
      [pricingKey('opencode', 'both-model'), { classification: 'FREE' }],
      [pricingKey('opencode', 'paid-model'), { classification: 'PAID' }],
    ]),
  };
  const cases = [
    [{ providerID: 'other', id: 'anything' }, 'OUT_OF_SCOPE'],
    [{ providerID: 'opencode', id: 'banned-model' }, 'BANNED'],
    [{ providerID: 'opencode', id: 'auth-model' }, 'AUTHORIZED'],
    [{ providerID: 'opencode', id: 'free-model' }, 'FREE'],
    [{ providerID: 'opencode', id: 'paid-model' }, 'DENIED'],
    [{ providerID: 'opencode', id: 'both-model' }, 'BANNED'],
    [{ providerID: 'other', id: 'banned-model' }, 'OUT_OF_SCOPE'],
    [null, 'DENIED'],
    [{}, 'DENIED'],
  ];
  for (const [ref, expected] of cases) assert.equal(policyDecision(snap, ref), expected);
  assert.equal(policyDecision(snap, { providerID: 'opencode', id: 'free-model' }), DECISION.FREE);
  const allowedRefs = [
    { providerID: 'other', id: 'anything' },
    { providerID: 'opencode', id: 'auth-model' },
    { providerID: 'opencode', id: 'free-model' },
  ];
  for (const ref of allowedRefs) assert.equal(isAllowed(snap, ref), true);
  const deniedRefs = [
    { providerID: 'opencode', id: 'banned-model' },
    { providerID: 'opencode', id: 'paid-model' },
    { providerID: 'opencode', id: 'both-model' },
  ];
  for (const ref of deniedRefs) assert.equal(isAllowed(snap, ref), false);
  assert.equal(isAllowed(snap, { providerID: 'opencode', id: 'auth-model' }), true);
  assert.equal(isAllowed(snap, { providerID: 'opencode', id: 'free-model' }), true);
  assert.equal(isAllowed(snap, { providerID: 'opencode', id: 'paid-model' }), false);
});

test('config: rejects invalid envelopes', async () => {
  const FULL_ORDER = ['OUT_OF_SCOPE', 'BANNED', 'AUTHORIZED', 'FREE', 'DENIED'];
  const cases = [
    { ...VALID, schemaVersion: 2 },
    { ...VALID, decision: { order: ['OUT_OF_SCOPE', 'GRANTED', 'DENIED'] } },
    { ...VALID, decision: { order: ['BANNED', 'BANNED', 'DENIED'] } },
    { ...VALID, decision: { order: ['OUT_OF_SCOPE', 'DENIED', 'BANNED'] } },
    { ...VALID, decision: { order: 'DENIED' } },
    { ...VALID, decision: { order: FULL_ORDER, allowed: ['FREE', 'DENIED'] } },
    { ...VALID, decision: { order: FULL_ORDER, allowed: ['FREE', 'BANNED'] } },
    { ...VALID, decision: { order: FULL_ORDER, allowed: [] } },
    { ...VALID, decision: { order: ['BANNED', 'AUTHORIZED', 'DENIED'], allowed: ['FREE'] } },
    { ...VALID, classification: { free: 'sometimes' } },
    { ...VALID, classification: { invalidTier: 'paid' } },
  ];
  for (const c of cases) await assert.rejects(loadSnapshot({ file: await tmpJson(c) }), /allowlist:/);
});

test('config: runtime is not validated on data reload', async () => {
  const s = await loadSnapshot({ file: await tmpJson({ ...VALID, runtime: { gate: 'warn' } }) });
  assert.deepEqual(s.filteredProviders, new Set(['opencode']));
  assert.deepEqual(s.decision, DEFAULT_DECISION);
});

test('config: cascade still selects an override with a broken runtime', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const overrideFile = join(dir, 'allowed_models.override.json');
  await writeFile(overrideFile, JSON.stringify({
    ...VALID,
    filteredProviders: ['override-only'],
    runtime: { gate: 'warn' },
  }));
  try {
    const s = await loadSnapshot({ overrideFile });
    assert.equal(s.configSource, 'override');
    assert.equal(s.overrideError, null);
    assert.ok(s.filteredProviders.has('override-only'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: defaults reproduce today semantics', async () => {
  const s = await loadSnapshot({ file: await tmpJson(VALID) });
  assert.deepEqual(s.decision, DEFAULT_DECISION);
  assert.deepEqual(s.classification, DEFAULT_CLASSIFICATION);
});

test('config: allowed derives from order', async () => {
  const s = await loadSnapshot({ file: await tmpJson({ ...VALID, decision: { order: ['BANNED', 'AUTHORIZED', 'DENIED'] } }) });
  assert.deepEqual(s.decision.allowed, ['AUTHORIZED']);
});

test('config: override wins over default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const overrideFile = join(dir, 'allowed_models.override.json');
  const body = { ...VALID, filteredProviders: ['override-only'], authorized: ['override-model'] };
  await writeFile(overrideFile, JSON.stringify(body));
  try {
    const s = await loadSnapshot({ overrideFile });
    assert.ok(s.filteredProviders.has('override-only'));
    assert.equal(s.configSource, 'override');
    assert.equal(s.overrideError, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: broken override falls back to default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const overrideFile = join(dir, 'allowed_models.override.json');
  const bodies = ['', '{', { ...VALID, authorized: [] }];
  try {
    for (const body of bodies) {
      await writeFile(overrideFile, typeof body === 'string' ? body : JSON.stringify(body));
      const s = await loadSnapshot({ overrideFile });
      assert.ok(s.filteredProviders.has('opencode-go'));
      assert.ok(s.filteredProviders.has('opencode'));
      assert.equal(s.configSource, 'default');
      assert.equal(typeof s.overrideError, 'string');
      assert.ok(s.overrideError.length > 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: broken default still fails closed', async () => {
  await assert.rejects(loadSnapshot({ file: await tmpJson('{') }), /allowlist:/);
});

test('config: loadRuntime', async () => {
  const full = VALID_RUNTIME;
  const s = await loadRuntime({ file: await tmpJson({ ...VALID, runtime: { ...full } }) });
  assert.deepEqual(s, full);
  assert.equal(await loadRuntime({ file: '/nonexistent/x.json' }), BOOTSTRAP_RUNTIME);
  assert.equal(await loadRuntime({ file: await tmpJson('{') }), BOOTSTRAP_RUNTIME);
  for (const runtime of [
    { gate: 'warn' },
    { onSnapshotFailure: 'retry' },
    { refreshMs: 'soon' },
    { enabled: 'yes' },
  ]) {
    assert.equal(await loadRuntime({ file: await tmpJson({ ...VALID, runtime }) }), BOOTSTRAP_RUNTIME);
  }
  const off = await loadRuntime({ file: await tmpJson({ ...VALID, runtime: { enabled: false } }) });
  assert.equal(off.enabled, false);
  const rt = await loadRuntime({ file: await tmpJson({ ...VALID, runtime: { ...full } }) });
  assert.deepEqual(rt, full);
  assert.notEqual(rt, BOOTSTRAP_RUNTIME);
});

test('config: broken override runtime falls back to the default runtime', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-'));
  const overrideFile = join(dir, 'allowed_models.override.json');
  const shipped = await loadRuntime({ file: new URL('../allowed_models.json', import.meta.url) });
  try {
    // 1. The injected override is actually read (refreshMs differs from shipped).
    await writeFile(overrideFile, JSON.stringify({ ...VALID, runtime: { ...VALID_RUNTIME, refreshMs: 1 } }));
    assert.deepEqual(await loadRuntime({ overrideFile }), { ...VALID_RUNTIME, refreshMs: 1 });

    // 2. A broken override runtime falls back to the shipped runtime.
    await writeFile(overrideFile, JSON.stringify({ ...VALID, runtime: { gate: 'warn' } }));
    assert.deepEqual(await loadRuntime({ overrideFile }), shipped);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('config: shipped default file', async () => {
  const s = await loadSnapshot({ file: new URL('../allowed_models.json', import.meta.url) });
  assert.equal(s.filteredProviders.size, 2);
  assert.ok(s.filteredProviders.has('opencode-go'));
  assert.ok(s.filteredProviders.has('opencode'));
  assert.equal(s.authorized.size, 3);
  assert.ok(s.authorized.has('muse-spark-1.3-contributor'));
  assert.ok(s.authorized.has('deepseek-v4.1-flash'));
  assert.ok(s.authorized.has('longcat-2.0'));
  assert.equal(s.banned.size, 4);
  assert.deepEqual(s.decision, DEFAULT_DECISION);
});
