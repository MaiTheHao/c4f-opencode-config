import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin from '../index.js';
import { BOOTSTRAP_RUNTIME } from '../src/policy/bootstrap.js';
import { setup } from '../src/setup.js';

async function tmpJson(value) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-setup-'));
  const file = join(dir, 'config.json');
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}

function fakeCtx(calls, { listError = false } = {}) {
  return {
    model: {
      list: async () => {
        calls.modelList += 1;
        if (listError || calls.failModelList) throw new Error('registry list failed');
        return {
          location: 'test',
          data: [
            { providerID: 'opencode', id: 'good-model', variants: [] },
            { providerID: 'opencode', id: 'good-model', variants: ['high'] },
          ],
        };
      },
      transform(register) { calls.modelTransform += 1; register(() => {}); return { dispose() {} }; },
    },
    session: {
      hook(eventName, handler) { calls.sessionHook += 1; calls.sessionHookEvent = eventName; calls.sessionHookHandler = handler; return { dispose() {} }; },
      async interrupt() { calls.sessionInterrupt += 1; },
    },
    tool: {
      transform(register) {
        calls.toolTransform += 1;
        register({ namespace() {}, add() {} });
        return { dispose() {} };
      },
    },
  };
}

const callsOf = () => ({ modelList: 0, modelTransform: 0, sessionHook: 0, sessionInterrupt: 0, toolTransform: 0 });

const MINIMAL = {
  filteredProviders: ['opencode'],
  authorized: ['good-model'],
};

test('setup: disabled', async () => {
  const calls = callsOf();
  const file = await tmpJson({ ...MINIMAL, runtime: { enabled: false } });
  const out = await setup(fakeCtx(calls), { configFile: file });
  assert.equal(out, undefined);
  assert.deepEqual(calls, callsOf());
});

test('setup: valid config registers', async () => {
  const calls = callsOf();
  const file = await tmpJson({ ...MINIMAL, runtime: { enabled: true, gate: 'interrupt', refreshMs: 60000 } });
  const dispose = await setup(fakeCtx(calls), { configFile: file });
  assert.equal(typeof dispose, 'function');
  assert.equal(calls.modelTransform, 1);
  assert.equal(calls.sessionHook, 1);
  assert.equal(calls.toolTransform, 1);
  await dispose();
});

test('setup: broken config is fail-safe', async () => {
  const calls = callsOf();
  const file = await tmpJson('{');
  const { loadRuntime } = await import('../src/policy/index.js');
  const runtime = await loadRuntime({ file });
  assert.equal(runtime, BOOTSTRAP_RUNTIME);
  const dispose = await setup(fakeCtx(calls), { configFile: file });
  assert.equal(typeof dispose, 'function');
  // Fail-safe asserted via L2 gate (bootstrap gate is interrupt, so session hook is registered).
  assert.equal(calls.sessionHook, 1);
  assert.equal(calls.sessionHookEvent, 'model.request');
  await calls.sessionHookHandler({ model: { providerID: 'opencode', id: 'muse-spark-1.3-contributor' }, sessionID: 's1' });
  assert.equal(calls.sessionInterrupt, 1);
  await dispose();
});

test('setup: refreshMs 0 disables reload', async (t) => {
  for (const refreshMs of [0, -5]) {
    const calls = callsOf();
    const file = await tmpJson({ ...MINIMAL, runtime: { enabled: true, gate: 'interrupt', refreshMs } });
    const dispose = await setup(fakeCtx(calls), { configFile: file });
    assert.equal(typeof dispose, 'function');
    assert.equal(calls.modelList, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls.modelList, 1);
    await dispose();
  }
});

test('index: export shape', () => {
  assert.equal(plugin.id, 'c4f-model-policy');
  assert.equal(typeof plugin.setup, 'function');
});
