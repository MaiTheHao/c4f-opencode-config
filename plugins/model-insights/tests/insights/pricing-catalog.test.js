import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCost } from '../../src/insights/pricing.js';
import { buildCatalog, filterCatalog, resolveModel } from '../../src/insights/catalog.js';

const freeCost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }];
const paidCost = [{ input: 1, output: 2, cache: { read: 0.1, write: 0.2 } }];

test('classifies pricing without string coercion', () => {
  assert.equal(classifyCost(freeCost), 'FREE');
  assert.equal(classifyCost(paidCost), 'PAID');
  assert.equal(classifyCost([{ input: '0', output: 0, cache: { read: 0, write: 0 } }]), 'UNPRICED');
  assert.equal(classifyCost([]), 'UNPRICED');
});

test('joins trigger metadata; provider-specific metadata overrides generic metadata', () => {
  const runtime = [
    { id: 'model-a', providerID: 'provider-a', provider: 'Provider A', classification: 'PAID', variants: [] },
    { id: 'model-a', providerID: 'provider-b', provider: 'Provider B', classification: 'PAID', variants: [] },
  ];
  const config = { models: [
    { id: 'model-a', providerID: null, costTier: 3, triggers: ['analysis'] },
    { id: 'model-a', providerID: 'provider-b', costTier: 1, triggers: ['architecture', 'security'] },
  ] };
  const catalog = buildCatalog(runtime, config);
  assert.deepEqual(
    Object.fromEntries(catalog.map((item) => [item.providerID, item.costTier])),
    { 'provider-a': 3, 'provider-b': 1 },
  );
  assert.deepEqual(catalog.find((item) => item.providerID === 'provider-a').triggers, ['analysis']);
  assert.deepEqual(catalog.find((item) => item.providerID === 'provider-b').triggers, ['architecture', 'security']);
  assert.equal(catalog[0].providerID, 'provider-b');
});

test('supports exact trigger filtering without turning metadata into availability policy', () => {
  const models = [
    { id: 'model-a', providerID: 'provider-a', classification: 'FREE', triggers: ['analysis', 'tests'], configured: true },
    { id: 'model-b', providerID: 'provider-b', classification: 'PAID', triggers: ['architecture'], configured: true },
  ];
  assert.equal(filterCatalog(models, { paidType: 'FREE' }).length, 1);
  assert.equal(filterCatalog(models, { provider: 'provider-b' }).length, 1);
  assert.deepEqual(filterCatalog(models, { trigger: ' ARCHITECTURE ' }).map((item) => item.id), ['model-b']);
  assert.equal(resolveModel(models, 'model-a').ambiguous, false);
  assert.equal(resolveModel(models, 'provider-b/model-b').matches[0].providerID, 'provider-b');
});

test('defaultScopeIsConfigured: default scope returns only configured models', () => {
  const models = [
    { id: 'model-a', providerID: 'provider-a', classification: 'PAID', triggers: [], configured: true },
    { id: 'model-b', providerID: 'provider-b', classification: 'PAID', triggers: [] },
  ];
  assert.deepEqual(filterCatalog(models).map((item) => item.id), ['model-a']);
});

test('allIncludesUnconfigured: ALL returns both configured and unconfigured', () => {
  const models = [
    { id: 'model-a', providerID: 'provider-a', classification: 'PAID', triggers: [], configured: true },
    { id: 'model-b', providerID: 'provider-b', classification: 'PAID', triggers: [], configured: false },
  ];
  assert.equal(filterCatalog(models, { paidType: 'ALL' }).length, 2);
});

test('freeIncludesUnconfiguredFree: FREE returns unconfigured FREE only', () => {
  const models = [
    { id: 'model-a', providerID: 'provider-a', classification: 'FREE', triggers: [], configured: false },
    { id: 'model-b', providerID: 'provider-b', classification: 'PAID', triggers: [], configured: false },
  ];
  assert.deepEqual(filterCatalog(models, { paidType: 'FREE' }).map((item) => item.id), ['model-a']);
});

test('paidStaysInConfiguredScope: PAID returns only configured PAID', () => {
  const models = [
    { id: 'model-a', providerID: 'provider-a', classification: 'PAID', triggers: [], configured: true },
    { id: 'model-b', providerID: 'provider-b', classification: 'PAID', triggers: [], configured: false },
  ];
  assert.deepEqual(filterCatalog(models, { paidType: 'PAID' }).map((item) => item.id), ['model-a']);
});

test('unknownPaidTypeThrows: BOGUS throws listing all five values', () => {
  assert.throws(
    () => filterCatalog([], { paidType: 'BOGUS' }),
    (error) => {
      assert.match(error.message, /CONFIGURED/);
      assert.match(error.message, /ALL/);
      assert.match(error.message, /PAID/);
      assert.match(error.message, /FREE/);
      assert.match(error.message, /UNPRICED/);
      return true;
    },
  );
});
