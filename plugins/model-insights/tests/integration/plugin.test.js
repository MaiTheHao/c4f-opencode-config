import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup } from '../../src/setup.js';

const freeCost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }];
const paidCost = [{ input: 1, output: 2, cache: { read: 0.1, write: 0.2 } }];
const config = {
  schemaVersion: 1,
  models: [
    { id: 'model-a', costTier: 1, triggers: ['analysis', 'bulk-edit', 'tests'] },
    { id: 'model-b', costTier: 2, triggers: ['architecture', 'security'] },
  ],
};

function mockToolContext(modelList, options = {}) {
  const added = [];
  const ctx = {
    options,
    model: { list: modelList },
    tool: { transform: (callback) => {
      callback({ add: (tool) => added.push(tool) });
      return { dispose() {} };
    } },
  };
  return { ctx, added };
}

test('registers model_insights with trigger metadata and live variants', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-plugin-'));
  const configFile = join(dir, 'model_insights.json');
  await writeFile(configFile, JSON.stringify(config));

  let registration;
  const { ctx, added } = mockToolContext(async () => ({ data: [
    { id: 'model-a', providerID: 'provider-a', enabled: true, cost: freeCost, variants: ['high', { id: 'medium' }] },
    { id: 'model-b', providerID: 'provider-b', enabled: true, cost: paidCost, variants: ['low'] },
    { id: 'disabled-model', providerID: 'provider-c', enabled: false, cost: freeCost, variants: [] },
  ] }), { configFile });

  try {
    registration = await setup(ctx);
    assert.equal(added.length, 1);
    assert.equal(added[0].name, 'model_insights');

    const list = await added[0].execute({ action: 'list' });
    assert.match(list.content, /model-a/);
    assert.match(list.content, /model-b/);
    assert.match(list.content, /Cost tier/);
    assert.match(list.content, /Triggers/);
    assert.match(list.content, /bulk-edit/);
    assert.doesNotMatch(list.content, /disabled-model/);
    assert.match(list.content, /excluded 1 model/);

    const filtered = await added[0].execute({ action: 'list', trigger: 'architecture' });
    assert.match(filtered.content, /model-b/);
    assert.doesNotMatch(filtered.content, /model-a/);

    const pricing = await added[0].execute({ action: 'pricing', paid_type: 'PAID' });
    assert.match(pricing.content, /model-b/);
    assert.doesNotMatch(pricing.content, /model-a/);

    const inspect = await added[0].execute({ action: 'inspect', model: 'provider-a/model-a' });
    assert.match(inspect.content, /FREE/);
    assert.match(inspect.content, /bulk-edit/);

    const variants = await added[0].execute({ action: 'variants', model: 'provider-a/model-a' });
    assert.match(variants.content, /high/);
    assert.match(variants.content, /medium/);

    const legacy = await added[0].execute({ action: 'allowed' });
    assert.match(legacy.content, /unknown action/);
  } finally {
    await registration?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('refreshes Runtime availability before each tool invocation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-live-'));
  const configFile = join(dir, 'model_insights.json');
  await writeFile(configFile, JSON.stringify(config));

  let calls = 0;
  const { ctx, added } = mockToolContext(async () => {
    calls += 1;
    if (calls === 1) return { data: [
      { id: 'model-a', providerID: 'provider-a', enabled: true, cost: freeCost, variants: [] },
      { id: 'model-b', providerID: 'provider-b', enabled: true, cost: paidCost, variants: [] },
    ] };
    return { data: [
      { id: 'model-a', providerID: 'provider-a', enabled: true, cost: freeCost, variants: [] },
      { id: 'model-b', providerID: 'provider-b', enabled: false, cost: paidCost, variants: [] },
    ] };
  }, { configFile });
  let cleanup;
  try {
    cleanup = await setup(ctx);
    const result = await added[0].execute({ action: 'list' });
    assert.equal(calls, 2);
    assert.match(result.content, /model-a/);
    assert.doesNotMatch(result.content, /model-b/);
    assert.match(result.content, /excluded 1 model/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('withholds last-known models when current Runtime availability cannot be verified', async () => {
  let calls = 0;
  const { ctx, added } = mockToolContext(async () => {
    calls += 1;
    if (calls === 1) return { data: [
      { id: 'model-a', providerID: 'provider-a', enabled: true, cost: freeCost, variants: [] },
    ] };
    throw new Error('runtime offline');
  });
  const cleanup = await setup(ctx);
  try {
    const result = await added[0].execute({ action: 'list' });
    assert.match(result.content, /STALE/);
    assert.match(result.content, /withheld/);
    assert.doesNotMatch(result.content, /model-a/);
  } finally {
    await cleanup?.();
  }
});

test('registers tool even when runtime is initially unavailable', async () => {
  let tool;
  const ctx = {
    options: { configFile: '/does/not/exist.json' },
    model: { list: async () => { throw new Error('not ready'); } },
    tool: { transform: (callback) => {
      callback({ add: (value) => { tool = value; } });
      return {};
    } },
  };
  const cleanup = await setup(ctx);
  try {
    const result = await tool.execute({ action: 'list' });
    assert.match(result.content, /UNAVAILABLE/);
  } finally {
    await cleanup?.();
  }
});

const partialConfig = {
  schemaVersion: 1,
  models: [
    { id: 'model-a', costTier: 1, triggers: ['analysis'] },
  ],
};

function mockRuntimeWithUnconfigured() {
  return async () => ({ data: [
    { id: 'model-a', providerID: 'provider-a', enabled: true, cost: freeCost, variants: [] },
    { id: 'model-b', providerID: 'provider-b', enabled: true, cost: paidCost, variants: [] },
  ] });
}

async function setupPartial() {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-configured-'));
  const configFile = join(dir, 'model_insights.json');
  await writeFile(configFile, JSON.stringify(partialConfig));
  const { ctx, added } = mockToolContext(mockRuntimeWithUnconfigured(), { configFile });
  const cleanup = await setup(ctx);
  return { dir, added, cleanup };
}

test('listDefaultsToConfigured: default list shows only configured models', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const list = await added[0].execute({ action: 'list' });
    assert.match(list.content, /model-a/);
    assert.doesNotMatch(list.content, /model-b/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('listAllShowsUnconfigured: paid_type=ALL shows unconfigured models', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const list = await added[0].execute({ action: 'list', paid_type: 'ALL' });
    assert.match(list.content, /model-a/);
    assert.match(list.content, /model-b/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('hiddenNote: default list points at paid_type=ALL when models are hidden', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const list = await added[0].execute({ action: 'list' });
    assert.match(list.content, /paid_type=ALL/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('noNoteForAll: paid_type=ALL carries no hidden-model note', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const list = await added[0].execute({ action: 'list', paid_type: 'ALL' });
    assert.doesNotMatch(list.content, /hidden outside configured metadata/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('inspectUnaffected: inspect still resolves unconfigured models', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const inspect = await added[0].execute({ action: 'inspect', model: 'provider-b/model-b' });
    assert.match(inspect.content, /model-b/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('emptyConfigYieldsNoRowsWithGuide: models [] yields no data rows plus paid_type=ALL note', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-empty-config-'));
  const configFile = join(dir, 'model_insights.json');
  await writeFile(configFile, JSON.stringify({ schemaVersion: 1, models: [] }));
  const { ctx, added } = mockToolContext(mockRuntimeWithUnconfigured(), { configFile });
  const cleanup = await setup(ctx);
  try {
    const list = await added[0].execute({ action: 'list' });
    assert.doesNotMatch(list.content, /model-a/);
    assert.doesNotMatch(list.content, /model-b/);
    assert.match(list.content, /paid_type=ALL/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('pricingDefaultsToConfigured: default pricing shows only configured models with guide note', async () => {
  const { dir, added, cleanup } = await setupPartial();
  try {
    const pricing = await added[0].execute({ action: 'pricing' });
    assert.match(pricing.content, /model-a/);
    assert.doesNotMatch(pricing.content, /model-b/);
    assert.match(pricing.content, /paid_type=ALL/);
  } finally {
    await cleanup?.();
    await rm(dir, { recursive: true, force: true });
  }
});
