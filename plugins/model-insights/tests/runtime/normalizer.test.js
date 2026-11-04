import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countUnavailableRegistryModels,
  normalizeRegistryModels,
  unwrapRegistryResponse,
} from '../../src/runtime/normalizer.js';
import { extractVariantIDs } from '../../src/runtime/variants.js';

const freeCost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }];
const paidCost = [{ input: 1, output: 2, cache: { read: 0.1, write: 0.2 } }];

test('unwraps OpenCode data response and accepts direct array adapters', () => {
  const data = [{ id: 'model', providerID: 'provider' }];
  assert.equal(unwrapRegistryResponse({ data }), data);
  assert.equal(unwrapRegistryResponse(data), data);
  assert.throws(() => unwrapRegistryResponse({}), /no model data array/);
});

test('normalizes registry records, retains runtime variants and removes explicitly disabled models', () => {
  const rawModels = [
    { id: 'deepseek-v4.1-flash', providerID: 'OpenCode-Go', enabled: true, cost: paidCost, variants: ['high', { id: 'medium' }, 'high', { id: 'low' }] },
    { id: 'free-model', providerID: 'provider', enabled: true, cost: freeCost, variants: null },
    { id: 'bad-model', providerID: 'provider', enabled: true, cost: '0' },
    { id: 'missing-provider', enabled: true },
    { id: 'disabled-model', providerID: 'provider', enabled: false, cost: freeCost },
    { id: 'unknown-enabled-model', providerID: 'provider', cost: freeCost },
  ];
  const models = normalizeRegistryModels(rawModels);

  assert.equal(models.length, 4);
  assert.equal(countUnavailableRegistryModels(rawModels), 2);
  assert.equal(models.some((item) => item.id === 'disabled-model'), false);
  assert.equal(models.some((item) => item.id === 'unknown-enabled-model'), false);
  const deepseek = models.find((item) => item.id === 'deepseek-v4.1-flash');
  assert.equal(deepseek.providerID, 'OpenCode-Go');
  assert.equal(deepseek.classification, 'PAID');
  assert.deepEqual(deepseek.variants, ['high', 'medium', 'low']);
  assert.deepEqual(models.find((item) => item.id === 'free-model').variants, []);
  assert.equal(models.find((item) => item.id === 'bad-model').classification, 'UNPRICED');
  assert.equal(models.find((item) => item.id === 'missing-provider').provider, '-');
});

test('variant extractor accepts strings and { id } records only', () => {
  assert.deepEqual(extractVariantIDs(['high', ' high ', { id: 'medium' }, {}, null, 5]), ['high', 'medium']);
});
