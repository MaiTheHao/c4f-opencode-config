import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../../src/config/schema.js';
import { loadConfig } from '../../src/config/loader.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const baseModel = (id, extra = {}) => ({ id, triggers: [], ...extra });

test('validates model metadata, normalized trigger tags and optional provider/tier', () => {
  const config = validateConfig({
    schemaVersion: 1,
    models: [
      baseModel('DeepSeek-V4.1-Flash#high', {
        costTier: 2,
        triggers: [' Root Cause Analysis ', 'ARCHITECTURE'],
      }),
      baseModel('model-x', { providerID: ' Provider-X ', costTier: 1 }),
    ],
  });
  assert.deepEqual(config.models, [
    { id: 'DeepSeek-V4.1-Flash', providerID: null, costTier: 2, triggers: ['root-cause-analysis', 'architecture'] },
    { id: 'model-x', providerID: 'Provider-X', costTier: 1, triggers: [] },
  ]);
});

test('rejects legacy policy/filter fields and requires triggers to be string arrays', () => {
  for (const key of ['authorized', 'banned', 'filteredProviders', 'decision', 'classification']) {
    assert.throws(() => validateConfig({ schemaVersion: 1, models: [], [key]: [] }), /unknown property/);
  }
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [{ id: 'x' }] }), /triggers must be an array/);
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [baseModel('x', { triggers: ['valid', 2] })] }), /non-empty string/);
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [baseModel('x', { triggers: ['tests', ' TESTS '] })] }), /duplicate value/);
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [baseModel('x', { trigger: ['task'] })] }), /unknown property/);
});

test('rejects duplicate metadata and invalid cost tiers', () => {
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [
    baseModel('model', { costTier: 1 }),
    baseModel('model', { costTier: 2 }),
  ] }), /duplicates/);
  assert.throws(() => validateConfig({ schemaVersion: 1, models: [baseModel('x', { costTier: 0 })] }), /positive integer/);
});

test('uses shipped default metadata when no override file exists', async () => {
  const result = await loadConfig();
  assert.equal(result.source, 'default');
  assert.equal(result.error, null);
  assert.equal(result.overrideError, null);
  assert.equal(result.config.models.length, 3);
  assert.ok(result.config.models.every((model) => Array.isArray(model.triggers)));
});

test('a valid override replaces the complete default metadata catalog', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-config-'));
  const overrideFile = join(dir, 'model_insights.override.json');
  await writeFile(overrideFile, JSON.stringify({ schemaVersion: 1, models: [baseModel('override-model', { costTier: 4, triggers: ['planning'] })] }));
  try {
    const result = await loadConfig({ overrideFile });
    assert.equal(result.source, 'override');
    assert.equal(result.config.models.length, 1);
    assert.equal(result.config.models[0].id, 'override-model');
    assert.deepEqual(result.config.models[0].triggers, ['planning']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('explicit custom base file can be overlaid by an explicit override file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-config-'));
  const configFile = join(dir, 'base.json');
  const overrideFile = join(dir, 'override.json');
  await writeFile(configFile, JSON.stringify({ schemaVersion: 1, models: [baseModel('base')] }));
  await writeFile(overrideFile, JSON.stringify({ schemaVersion: 1, models: [baseModel('replacement')] }));
  try {
    const result = await loadConfig({ file: configFile, overrideFile });
    assert.equal(result.source, 'override');
    assert.deepEqual(result.config.models.map((model) => model.id), ['replacement']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid override falls back to base metadata with a diagnostic', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-config-'));
  const configFile = join(dir, 'base.json');
  const overrideFile = join(dir, 'override.json');
  await writeFile(configFile, JSON.stringify({ schemaVersion: 1, models: [baseModel('base')] }));
  await writeFile(overrideFile, '{ invalid json');
  try {
    const result = await loadConfig({ file: configFile, overrideFile });
    assert.equal(result.source, 'custom');
    assert.deepEqual(result.config.models.map((model) => model.id), ['base']);
    assert.match(result.overrideError, /invalid JSON/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
