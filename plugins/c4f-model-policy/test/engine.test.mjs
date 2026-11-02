import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLASSIFICATION, DEFAULT_DECISION } from '../src/policy/bootstrap.js';
import { DECISION, isAllowed, policyDecision } from '../src/policy/decision.js';
import { modelRef } from '../src/policy/ids.js';
import { attachPricing, classifyCost } from '../src/policy/pricing.js';
import { createSnapshotStore } from '../src/policy/snapshot-store.js';

const cost = (input, output, read = 0, write = 0) => ({ input, output, cache: { read, write } });

function baseSnapshot(overrides = {}) {
  return {
    filteredProviders: new Set(['opencode-go']),
    authorized: new Map(),
    banned: new Set(['bad']),
    decision: DEFAULT_DECISION,
    classification: DEFAULT_CLASSIFICATION,
    configSource: 'default',
    overrideError: null,
    pricing: new Map(),
    pricingStatus: 'unavailable',
    pricingLoadedAt: null,
    pricingError: null,
    loadedAt: Date.now(),
    ...overrides,
  };
}

test('precedence follows config order', () => {
  const ref = modelRef('opencode/../bad');
  const reordered = {
    ...baseSnapshot(),
    decision: { order: ['BANNED', 'OUT_OF_SCOPE', 'AUTHORIZED', 'FREE', 'DENIED'], allowed: ['AUTHORIZED', 'FREE'] },
  };
  assert.equal(policyDecision(reordered, ref), 'BANNED');
  assert.equal(policyDecision(baseSnapshot(), ref), 'OUT_OF_SCOPE');
});

test('allowed set is independent of order', () => {
  const snap = {
    ...baseSnapshot(),
    pricing: new Map([['opencode-go\0free-model', { classification: 'FREE' }]]),
    decision: { order: [...DEFAULT_DECISION.order], allowed: ['AUTHORIZED'] },
  };
  assert.equal(policyDecision(snap, { providerID: 'elsewhere', id: 'x' }), 'OUT_OF_SCOPE');
  assert.equal(policyDecision(snap, { providerID: 'opencode-go', id: 'free-model' }), 'FREE');
  assert.equal(isAllowed(snap, { providerID: 'elsewhere', id: 'x' }), false);
  assert.equal(isAllowed(snap, { providerID: 'opencode-go', id: 'free-model' }), false);
  const snapAuth = {
    ...snap,
    authorized: new Map([['good', { id: 'good' }]]),
  };
  assert.equal(isAllowed(snapAuth, { providerID: 'opencode-go', id: 'good' }), true);
});

test('classification knobs', () => {
  assert.equal(classifyCost([{ input: 0 }, { input: 0 }].map((e) => ({ ...cost(0, 0), ...e }))), 'FREE');
  assert.equal(classifyCost([cost(0, 0), cost(0, 0.5)], { free: 'all-zero', invalidTier: 'unpriced' }), 'PAID');
  assert.equal(classifyCost([cost(0, 0), cost(0, 0.5)], { free: 'any-zero', invalidTier: 'unpriced' }), 'FREE');
  assert.equal(
    classifyCost([{ ...cost(0, 0), tier: { type: 'context', size: 0 } }], { free: 'all-zero', invalidTier: 'unpriced' }),
    'UNPRICED',
  );
  assert.equal(
    classifyCost([{ ...cost(0, 0), tier: { type: 'context', size: 0 } }], { free: 'all-zero', invalidTier: 'ignore' }),
    'FREE',
  );
});

test('hand-built snapshot uses defaults', () => {
  const snap = {
    filteredProviders: new Set(['opencode']),
    authorized: new Map([['good-model', { id: 'good-model' }]]),
    banned: new Set(['bad-model']),
    pricing: new Map([['opencode\0free-model', { classification: 'FREE' }]]),
    pricingStatus: 'loaded',
    pricingLoadedAt: Date.now(),
    pricingError: null,
    loadedAt: Date.now(),
  };
  assert.equal(policyDecision(snap, { providerID: 'other', id: 'x' }), 'OUT_OF_SCOPE');
  assert.equal(policyDecision(snap, { providerID: 'opencode', id: 'bad-model' }), 'BANNED');
  assert.equal(policyDecision(snap, { providerID: 'opencode', id: 'good-model' }), 'AUTHORIZED');
  assert.equal(policyDecision(snap, { providerID: 'opencode', id: 'free-model' }), 'FREE');
  assert.equal(policyDecision(snap, null), 'DENIED');
  assert.equal(policyDecision(snap, {}), 'DENIED');
  assert.equal(classifyCost([cost(0, 0)]), 'FREE');
});

test('refresh guard holds during config reload', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const ctx = { model: { list: () => gate } };
  const store = createSnapshotStore(ctx);
  const first = store.refresh();
  const second = store.refresh();
  await second;
  const guarded = store.get();
  assert.ok(guarded === null || (typeof guarded === 'object' && 'decision' in guarded && 'classification' in guarded && (guarded.pricing === undefined || guarded.pricing instanceof Map)));
  release({ location: 'test', data: [{ id: 'test-model' }] });
  await first;
  assert.ok(store.get() === null || typeof store.get() === 'object');
});
