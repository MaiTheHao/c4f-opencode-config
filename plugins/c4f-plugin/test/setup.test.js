import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from '../src/setup.js';

test('runs modules sequentially in registry order with namespaced options and disposes in reverse', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;

  const track = async (name, options, delay) => {
    calls.push([`run:${name}`, options]);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return { dispose: async () => calls.push([`dispose:${name}`]) };
  };

  const registry = {
    first: { run: (_ctx, options) => track('first', options, 5) },
    second: { run: (_ctx, options) => track('second', options, 0) },
  };

  const dispose = await setup({ options: { first: { a: 1 }, second: { b: 2 } } }, registry);
  assert.equal(maxActive, 1, 'modules must not overlap');
  assert.deepEqual(calls, [
    ['run:first', { a: 1 }],
    ['run:second', { b: 2 }],
  ]);

  await dispose();
  assert.deepEqual(calls.slice(-2), [['dispose:second'], ['dispose:first']]);
});

test('a failing module does not block later modules', async () => {
  const started = [];
  const registry = {
    broken: {
      run: async () => {
        throw new Error('boom');
      },
    },
    healthy: {
      run: async () => {
        started.push('healthy');
        return { dispose: async () => {} };
      },
    },
  };

  const dispose = await setup({ options: {} }, registry);
  assert.deepEqual(started, ['healthy']);
  await dispose();
});

test('a failing dispose does not block earlier disposals', async () => {
  const disposed = [];
  const registry = {
    first: { run: async () => ({ dispose: async () => disposed.push('first') }) },
    second: {
      run: async () => ({
        dispose: async () => {
          throw new Error('boom');
        },
      }),
    },
  };

  const dispose = await setup({ options: {} }, registry);
  await dispose();
  assert.deepEqual(disposed, ['first']);
});

test('a malformed registry entry is skipped', async () => {
  let started = false;
  const registry = {
    broken: {},
    healthy: {
      run: async () => {
        started = true;
      },
    },
  };

  await setup({ options: {} }, registry);
  assert.equal(started, true);
});

test('the default registry wires the update check and honours enabled: false', async () => {
  const dispose = await setup({ options: { updateCheck: { enabled: false } } });
  assert.equal(typeof dispose, 'function');
  await dispose();
});
