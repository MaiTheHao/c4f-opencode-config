import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPricing, loadSnapshot } from '../src/policy/index.js';
import { ALLOWED_COLUMNS, BANNED_COLUMNS, CHECK_COLUMNS, PRICING_COLUMNS } from '../src/tools/allowed-models/columns.js';
import { buildCatalog } from '../src/tools/allowed-models/catalog.js';
import { mergeRegistry, createSnapshotStore } from '../src/policy/snapshot-store.js';
import { renderCheck, variantsForProvider } from '../src/tools/allowed-models/render-check.js';

const cost = (input, output, read = 0, write = 0) => ({ input, output, cache: { read, write } });

const ALLOWLIST = {
  filteredProviders: ['opencode-go', 'opencode'],
  authorized: [
    { id: 'x', cost: 1, trigger: ['t'] },
    { id: 'y', cost: 1, trigger: ['t'] },
  ],
  banned: [],
};

async function baseSnapshot() {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-variants-'));
  const file = join(dir, 'allowlist.json');
  await writeFile(file, JSON.stringify(ALLOWLIST));
  return loadSnapshot({ file });
}

function cellFor(snapshot, model, provider) {
  const rows = buildCatalog(snapshot);
  const row = rows.find((r) => r.model === model && (provider === undefined || r.provider === provider));
  assert.ok(row, `missing catalog row ${provider ?? ''}/${model}`);
  const variants = row.variants;
  return Array.isArray(variants) && variants.length > 0 ? variants.join(', ') : '-';
}

function checkCell(snapshot, modelID) {
  const text = renderCheck(snapshot, modelID, true);
  const lines = text.split('\n');
  const header = lines[0].split('|').slice(1, -1).map((c) => c.trim());
  const cells = lines[2].split('|').slice(1, -1).map((c) => c.trim());
  const row = Object.fromEntries(header.map((k, i) => [k, cells[i]]));
  return row.Variants;
}

test('variants: host objects render as ids', async () => {
  const base = await baseSnapshot();
  const snap = attachPricing(base, {
    models: [
      {
        providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)],
        variants: [{ id: 'low', headers: {}, body: {} }, { id: 'high', headers: {}, body: {} }],
      },
    ],
  });
  assert.equal(cellFor(snap, 'x', 'opencode-go'), 'low, high');
  const mixed = attachPricing(base, {
    models: [
      {
        providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)],
        variants: [{ headers: {} }, { id: 7 }, { id: '  ' }, { id: 'ok', headers: {}, body: {} }],
      },
    ],
  });
  assert.equal(cellFor(mixed, 'x', 'opencode-go'), 'ok');
});

test('variants: unlisted model loses inventory', () => {
  const first = [
    { providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['a', 'b'], input: 1, class: 'PAID' },
    { providerID: 'opencode-go', id: 'y', cost: [cost(1, 1)], variants: ['z'] },
  ];
  const pass1 = mergeRegistry([], first);
  const x1 = pass1.find((m) => m.id === 'x');
  assert.deepEqual(x1.variants, ['a', 'b']);
  const second = [{ providerID: 'opencode-go', id: 'y', cost: [cost(1, 1)], variants: ['z'] }];
  const pass2 = mergeRegistry(pass1, second);
  const x2 = pass2.find((m) => m.id === 'x');
  assert.ok(x2, 'x is still present');
  assert.deepEqual(x2.variants, []);
  assert.equal(x2.input, 1);
  assert.equal(x2.class, 'PAID');
});

test('variants: failed listing clears nothing', async () => {
  const failing = createSnapshotStore({ model: { list: async () => { throw new Error('boom'); } } });
  assert.equal(failing.get(), null);
  const seed = [
    { providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['a', 'b'] },
  ];
  const merged = mergeRegistry(seed, null);
  assert.deepEqual(merged.find((m) => m.id === 'x').variants, ['a', 'b']);
  const merged2 = mergeRegistry(seed, { models: null });
  assert.deepEqual(merged2.find((m) => m.id === 'x').variants, ['a', 'b']);
  let calls = 0;
  const listed = [
    { providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['a', 'b'] },
  ];
  const ctx = {
    model: {
      list: async () => {
        calls += 1;
        if (calls === 1) return { data: listed };
        return { models: null };
      },
    },
  };
  const store = createSnapshotStore(ctx);
  await store.refresh();
  const before = store.get();
  const beforeVariants = before.pricing.get('opencode-go\0x').variants;
  assert.deepEqual(beforeVariants, ['a', 'b']);
  await store.refresh();
  const after = store.get();
  assert.deepEqual(after.pricing.get('opencode-go\0x').variants, ['a', 'b']);
});

test('variants: newest set replaces the old', async () => {
  const base = await baseSnapshot();
  const snap1 = attachPricing(base, {
    models: [{ providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['low', 'high'] }],
  });
  assert.equal(cellFor(snap1, 'x', 'opencode-go'), 'low, high');
  const reg1 = mergeRegistry([], [{ providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['low', 'high'] }]);
  const reg2 = mergeRegistry(reg1, [{ providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['low', 'medium'] }]);
  const snap2 = attachPricing(base, { models: reg2 });
  assert.equal(cellFor(snap2, 'x', 'opencode-go'), 'low, medium');
  const text = JSON.stringify([...snap2.pricing.values()]);
  assert.ok(!text.includes('high'), `stale variant leaked: ${text}`);
});

test('variants: empty inventory stays empty', async () => {
  const base = await baseSnapshot();
  const snap = attachPricing(base, {
    models: [{ providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: [] }],
  });
  assert.equal(cellFor(snap, 'x', 'opencode-go'), '-');
  const withExtra = {
    ...snap,
    authorized: new Map([...snap.authorized, ['x', { id: 'x', cost: 1, trigger: ['t'], extra: 'unrelated' }]]),
  };
  assert.equal(cellFor(withExtra, 'x', 'opencode-go'), '-');
});

test('variants: check resolution', async () => {
  const base = await baseSnapshot();
  const both = attachPricing(base, {
    models: [
      { providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['go-low'] },
      { providerID: 'opencode', id: 'x', cost: [cost(1, 1)], variants: ['open-low'] },
    ],
  });
  assert.equal(checkCell(both, 'opencode-go/x'), 'go-low');
  assert.equal(checkCell(both, 'x'), '-');
  assert.equal(checkCell(both, 'nobody'), '-');
  const single = attachPricing(base, {
    models: [{ providerID: 'opencode-go', id: 'x', cost: [cost(1, 1)], variants: ['go-low', 'go-high'] }],
  });
  assert.equal(checkCell(single, 'opencode-go/x'), 'go-low, go-high');
  assert.equal(checkCell(single, 'x'), 'go-low, go-high');
  assert.equal(variantsForProvider(single, 'opencode-go', 'x'), single.pricing.get('opencode-go\0x').variants);
});

test('variants: column contracts unchanged', () => {
  assert.deepEqual(ALLOWED_COLUMNS.map((c) => c.header), ['Model', 'Provider', 'Class', 'Input', 'Output', 'Tier', 'Variants', 'Trigger']);
  assert.deepEqual(PRICING_COLUMNS.map((c) => c.header), ['Model', 'Provider', 'Class', 'Input', 'Output']);
  assert.deepEqual(BANNED_COLUMNS.map((c) => c.header), ['Model']);
  assert.deepEqual(CHECK_COLUMNS.map((c) => c.header), ['Model', 'Provider', 'Status', 'Class', 'Tier', 'Variants', 'Reason']);
});
