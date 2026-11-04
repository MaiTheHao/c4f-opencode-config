import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotStore } from '../../src/runtime/snapshot-store.js';

const cost = [{ input: 0.2, output: 0.4, cache: { read: 0.1, write: 0.1 } }];
const metadata = { schemaVersion: 1, models: [{ id: 'model-a', costTier: 2, triggers: ['analysis', 'tests'] }] };

test('refreshes runtime variants dynamically and retains last good snapshot internally as stale', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-insights-'));
  const configFile = join(dir, 'model_insights.json');
  await writeFile(configFile, JSON.stringify(metadata));

  let call = 0;
  const ctx = { model: { list: async () => {
    call += 1;
    if (call === 1) return { data: [{ id: 'model-a', providerID: 'provider', enabled: true, cost, variants: ['high'] }] };
    if (call === 2) return { data: [{ id: 'model-a', providerID: 'provider', enabled: true, cost, variants: [{ id: 'low' }] }] };
    throw new Error('runtime offline');
  } } };
  const store = createSnapshotStore(ctx, { configFile });
  try {
    await store.refresh();
    assert.equal(store.get().runtimeStatus, 'loaded');
    assert.equal(store.get().models[0].costTier, 2);
    assert.deepEqual(store.get().models[0].triggers, ['analysis', 'tests']);
    assert.deepEqual(store.get().models[0].variants, ['high']);

    await store.refresh();
    assert.deepEqual(store.get().models[0].variants, ['low']);

    await store.refresh();
    assert.equal(store.get().runtimeStatus, 'stale');
    assert.equal(store.get().runtimeError, 'runtime offline');
    assert.deepEqual(store.get().models[0].variants, ['low']);
  } finally {
    store.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test('metadata failure does not disable runtime discovery', async () => {
  const store = createSnapshotStore({ model: { list: async () => ({ data: [
    { id: 'model-a', providerID: 'provider', enabled: true, cost, variants: ['high'] },
  ] }) } }, { configFile: '/does/not/exist/model_insights.json' });
  await store.refresh();
  assert.equal(store.get().runtimeStatus, 'loaded');
  assert.equal(store.get().metadataStatus, 'unavailable');
  assert.equal(store.get().models.length, 1);
  assert.equal(store.get().models[0].costTier, null);
  assert.deepEqual(store.get().models[0].triggers, []);
});

test('stores unavailable count and excludes explicitly disabled model records', async () => {
  const store = createSnapshotStore({ model: { list: async () => ({ data: [
    { id: 'model-a', providerID: 'provider', enabled: true, cost, variants: [] },
    { id: 'model-b', providerID: 'provider', enabled: false, cost, variants: [] },
  ] }) } });
  await store.refresh();
  assert.equal(store.get().runtimeStatus, 'loaded');
  assert.equal(store.get().models.length, 1);
  assert.equal(store.get().models[0].id, 'model-a');
  assert.equal(store.get().unavailableModelCount, 1);
});
