import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachPricing, baseId, isAllowed, loadSnapshot } from '../src/policy/index.js';
import { mergeRegistry } from '../src/policy/snapshot-store.js';
import { registerAllowedModelsTool } from '../src/tools/allowed-models/index.js';

const cost = (input, output, read = 0, write = 0) => ({ input, output, cache: { read, write } });

const ALLOWLIST = {
  filteredProviders: ['opencode-go', 'opencode'],
  authorized: [
    { id: 'deepseek-v4.1-flash', cost: 2, trigger: ['complex-bug-fix'] },
    { id: 'muse-spark-1.3-contributor', cost: 1, trigger: ['bulk-edit'] },
    { id: 'phantom-model', cost: 7, trigger: ['qa'] },
  ],
  banned: ['mimo-v2.5'],
};

const MODELS = [
  { providerID: 'opencode-go', id: 'deepseek-v4.1-flash', cost: [cost(1, 1)], variants: ['low', 'high'] },
  { providerID: 'opencode-go', id: 'muse-spark-1.3-contributor', cost: [cost(0, 0)] },
  { providerID: 'opencode', id: 'mimo-v2.6-flash-free', cost: [cost(0, 0)] },
  { providerID: 'opencode-go', id: 'paid-outsider', cost: [cost(2, 0)] },
  { providerID: 'opencode-go', id: 'mimo-v2.5', cost: [cost(0, 0)] },
  { providerID: 'opencode', id: 'unpriced-registry', cost: [] },
  { providerID: 'anthropic', id: 'claude-sonnet-4', cost: [cost(0, 0)] },
];

async function snapshotWith({ models = MODELS, error = null } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-tool-'));
  const file = join(dir, 'allowlist.json');
  await writeFile(file, JSON.stringify(ALLOWLIST));
  const base = await loadSnapshot({ file });
  return attachPricing(base, error === null ? { models } : { models: null, error });
}

/** Capture the registered tool definition and return a callable. */
function harness(snapshot, { failClosed = true } = {}) {
  let definition;
  const ctx = {
    tool: {
      transform(register) {
        register({ namespace() {}, add(def) { definition = def; } });
        return { dispose() {} };
      },
    },
  };
  registerAllowedModelsTool({
    ctx,
    snapshot: () => snapshot,
    policy: { onSnapshotFailure: failClosed ? 'fail-closed' : 'fail-open' },
  });
  return async (input) => (await definition.execute(input)).content;
}

/** Parse a markdown table into `{ header, rows }` keyed by header. */
function parseTable(text) {
  const lines = text.split('\n');
  assert.ok(lines.length >= 2, `expected a table, got:\n${text}`);
  assert.ok(lines[0].startsWith('|') && lines[0].endsWith('|'), `missing header row:\n${text}`);
  for (const line of lines) assert.ok(line.startsWith('|'), `prose line in table output: ${line}`);

  const header = lines[0].split('|').slice(1, -1).map((cell) => cell.trim());
  const rows = lines.slice(2).map((line) => {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
  return { header, rows };
}

const modelsOf = (text) => parseTable(text).rows.map((row) => row.Model);

test('allowed NONE: authorized + FREE-by-price, no denied/banned/out-of-scope', async () => {
  const run = harness(await snapshotWith());
  const { header, rows } = parseTable(await run({}));

  assert.deepEqual(header, ['Model', 'Provider', 'Class', 'Input', 'Output', 'Tier', 'Variants', 'Trigger']);
  assert.deepEqual(rows.map((row) => row.Model), [
    'muse-spark-1.3-contributor',
    'deepseek-v4.1-flash',
    'phantom-model',
    'mimo-v2.6-flash-free',
  ]);
  assert.deepEqual(rows.map((row) => row.Class), ['FREE', 'PAID', 'UNPRICED', 'FREE']);
  assert.deepEqual(rows.map((row) => row.Provider), ['opencode-go', 'opencode-go', '-', 'opencode']);
  assert.deepEqual(rows.map((row) => row.Tier), ['1', '2', '7', '-']);

  const deepseek = rows.find((row) => row.Model === 'deepseek-v4.1-flash');
  assert.equal(deepseek.Input, '1');
  assert.equal(deepseek.Output, '1');
  assert.equal(deepseek.Variants, 'low, high');
  assert.equal(deepseek.Trigger, 'complex-bug-fix');
});

test('allowed FREE keeps only Class=FREE, including FREE-by-price', async () => {
  const run = harness(await snapshotWith());
  assert.deepEqual(modelsOf(await run({ model_paid_type: 'FREE' })), [
    'muse-spark-1.3-contributor',
    'mimo-v2.6-flash-free',
  ]);
});

test('allowed PAID keeps only Class=PAID', async () => {
  const run = harness(await snapshotWith());
  assert.deepEqual(modelsOf(await run({ model_paid_type: 'PAID' })), ['deepseek-v4.1-flash']);
});

test('model_paid_type is case-insensitive', async () => {
  const run = harness(await snapshotWith());
  const lower = await run({ model_paid_type: 'free' });
  assert.equal(lower, await run({ model_paid_type: 'FREE' }));
  assert.equal(await run({ model_paid_type: 'PaId' }), await run({ model_paid_type: 'PAID' }));
});

test('unknown model_paid_type is a one-row error table', async () => {
  const run = harness(await snapshotWith());
  const { header, rows } = parseTable(await run({ model_paid_type: 'foo' }));
  assert.deepEqual(header, ['status', 'message']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'ERROR');
  assert.match(rows[0].message, /NONE \/ PAID \/ FREE/);
});

test('registry failure + FREE => PRICING_UNAVAILABLE table, not an empty table', async () => {
  const run = harness(await snapshotWith({ error: 'boom' }));
  const { header, rows } = parseTable(await run({ model_paid_type: 'FREE' }));
  assert.deepEqual(header, ['status', 'message']);
  assert.equal(rows[0].status, 'PRICING_UNAVAILABLE');
  assert.match(rows[0].message, /boom/);

  const paid = parseTable(await run({ model_paid_type: 'PAID' }));
  assert.equal(paid.rows[0].status, 'PRICING_UNAVAILABLE');
});

test('registry failure + NONE => every authorized row is UNPRICED and keeps Tier', async () => {
  const run = harness(await snapshotWith({ error: 'boom' }));
  const { rows } = parseTable(await run({}));

  assert.deepEqual(rows.map((row) => row.Model), [
    'muse-spark-1.3-contributor',
    'deepseek-v4.1-flash',
    'phantom-model',
  ]);
  assert.deepEqual(rows.map((row) => row.Class), ['UNPRICED', 'UNPRICED', 'UNPRICED']);
  assert.deepEqual(rows.map((row) => row.Tier), ['1', '2', '7']);
  assert.ok(rows.every((row) => row.Input === '-' && row.Output === '-'));
});

test('snapshot failure is a one-row status table phrased by the failure policy', async () => {
  const closed = parseTable(await harness(null, { failClosed: true })({}));
  assert.equal(closed.rows[0].status, 'DENIED');
  assert.match(closed.rows[0].message, /fail-closed/);

  const open = parseTable(await harness(null, { failClosed: false })({}));
  assert.equal(open.rows[0].status, 'FAIL-OPEN');
  assert.match(open.rows[0].message, /fail-open/);
});

test('every action returns table lines only', async () => {
  const run = harness(await snapshotWith());
  for (const input of [
    {},
    { action: 'allowed', model_paid_type: 'FREE' },
    { action: 'pricing' },
    { action: 'banned' },
    { action: 'check', model: 'opencode-go/deepseek-v4.1-flash' },
    { action: 'check' },
    { action: 'bogus' },
  ]) {
    const text = await run(input);
    for (const line of text.split('\n')) assert.ok(line.startsWith('|'), `${JSON.stringify(input)} => ${line}`);
  }
});

test('empty result is a header-only table', async () => {
  const snapshot = { ...(await snapshotWith()), banned: new Set() };
  const run = harness(snapshot);
  const text = await run({ action: 'banned' });
  assert.equal(text.split('\n').length, 2);
  assert.equal(text.split('\n')[0], '| Model |');
});

test('pricing view includes DENIED and BANNED registry rows, not authorized placeholders', async () => {
  const run = harness(await snapshotWith());
  const { header, rows } = parseTable(await run({ action: 'pricing' }));

  assert.deepEqual(header, ['Model', 'Provider', 'Class', 'Input', 'Output']);
  assert.deepEqual(rows.map((row) => row.Model), [
    'muse-spark-1.3-contributor',
    'deepseek-v4.1-flash',
    'mimo-v2.6-flash-free',
    'unpriced-registry',
    'mimo-v2.5',
    'paid-outsider',
  ]);
  assert.deepEqual(rows.map((row) => row.Class), ['FREE', 'PAID', 'FREE', 'UNPRICED', 'FREE', 'PAID']);
  assert.ok(!rows.some((row) => row.Model === 'phantom-model'));
  assert.ok(!rows.some((row) => row.Model === 'claude-sonnet-4'));

  const free = modelsOf(await run({ action: 'pricing', model_paid_type: 'FREE' }));
  assert.deepEqual(free, ['muse-spark-1.3-contributor', 'mimo-v2.6-flash-free', 'mimo-v2.5']);
});

test('check: one row for every status', async () => {
  const run = harness(await snapshotWith());
  const check = async (model) => parseTable(await run({ action: 'check', model }));

  const authorized = await check('opencode-go/deepseek-v4.1-flash');
  assert.deepEqual(authorized.header, ['Model', 'Provider', 'Status', 'Class', 'Tier', 'Variants', 'Reason']);
  assert.equal(authorized.rows.length, 1);
  assert.equal(authorized.rows[0].Status, 'AUTHORIZED');
  assert.equal(authorized.rows[0].Class, 'PAID');
  assert.equal(authorized.rows[0].Tier, '2');
  assert.equal(authorized.rows[0].Variants, 'low, high');

  const free = await check('opencode/mimo-v2.6-flash-free');
  assert.equal(free.rows[0].Status, 'FREE');
  assert.equal(free.rows[0].Class, 'FREE');

  const banned = await check('opencode-go/mimo-v2.5#high');
  assert.equal(banned.rows[0].Status, 'BANNED');
  assert.equal(banned.rows[0].Model, 'mimo-v2.5');

  const denied = await check('opencode-go/paid-outsider');
  assert.equal(denied.rows[0].Status, 'DENIED');
  assert.match(denied.rows[0].Reason, /PAID/);

  const outOfScope = await check('anthropic/claude-sonnet-4');
  assert.equal(outOfScope.rows[0].Status, 'OUT OF SCOPE');

  const providerRequired = await check('deepseek-v4.1-flash');
  assert.equal(providerRequired.rows[0].Status, 'PROVIDER REQUIRED');
  assert.match(providerRequired.rows[0].Reason, /authorized: yes; banned: no/);

  const missing = parseTable(await run({ action: 'check' }));
  assert.deepEqual(missing.header, ['status', 'message']);
  assert.equal(missing.rows[0].status, 'ERROR');
});

test('unknown action is a one-row error table and constructor stays inert', async () => {
  const run = harness(await snapshotWith());
  for (const action of ['bogus', 'constructor', '  BANNED  ']) {
    const { header, rows } = parseTable(await run({ action }));
    if (action.trim().toLowerCase() === 'banned') {
      assert.equal(rows.length, 1);
      assert.equal(rows[0].Model, 'mimo-v2.5');
      continue;
    }
    assert.deepEqual(header, ['status', 'message']);
    assert.equal(rows[0].status, 'ERROR');
    assert.match(rows[0].message, /unknown action/);
  }
});

test('allowed NONE matches isAllowed for every in-scope registry model', async () => {
  const snapshot = await snapshotWith();
  const run = harness(snapshot);
  const permitted = new Set(modelsOf(await run({})));

  // FREE-by-price is keyed per provider, so compare each registry row on its own provider.
  for (const entry of MODELS.filter((model) => ['opencode', 'opencode-go'].includes(model.providerID))) {
    assert.equal(
      isAllowed(snapshot, { providerID: entry.providerID, id: entry.id }),
      permitted.has(baseId(entry.id)),
      `${entry.providerID}/${entry.id}`,
    );
  }

  // Authorized entries stay allowed on every in-scope provider, registry or not.
  for (const providerID of ['opencode', 'opencode-go']) {
    for (const model of [...ALLOWLIST.authorized.map((entry) => entry.id), 'mimo-v2.5']) {
      const id = baseId(model);
      assert.equal(
        isAllowed(snapshot, { providerID, id }),
        permitted.has(id),
        `${providerID}/${id}`,
      );
    }
  }
});

test('mergeRegistry keeps raw rows across refreshes and lets later records win', () => {
  const first = [
    { providerID: 'opencode-go', id: 'banned-x', cost: [cost(1, 1)] },
    { providerID: 'opencode-go', id: 'kept', cost: [cost(0, 0)] },
  ];
  const second = [
    { providerID: 'opencode-go', id: 'kept', cost: [cost(2, 2)] },
    { providerID: 'opencode', id: 'new-free', cost: [cost(0, 0)] },
  ];

  const merged = mergeRegistry(first, second);
  assert.deepEqual(merged.map((model) => `${model.providerID}/${model.id}`), [
    'opencode-go/banned-x',
    'opencode-go/kept',
    'opencode/new-free',
  ]);
  assert.equal(merged.find((model) => model.id === 'kept').cost[0].input, 2);

  assert.deepEqual(mergeRegistry(null, null), []);
  assert.deepEqual(mergeRegistry(undefined, [{ providerID: '', id: 'x' }]), []);
  assert.equal(
    mergeRegistry([{ providerID: 'OpenCode-Go', id: 'A#high' }], [{ providerID: 'opencode-go', id: 'a' }]).length,
    1,
  );
});

test('class partition: FREE and PAID are disjoint and cover NONE exactly', async () => {
  const run = harness(await snapshotWith());
  const all = parseTable(await run({})).rows;
  const free = parseTable(await run({ model_paid_type: 'FREE' })).rows;
  const paid = parseTable(await run({ model_paid_type: 'PAID' })).rows;
  const unpriced = all.filter((row) => row.Class === 'UNPRICED');

  assert.equal(free.length + paid.length + unpriced.length, all.length);
  assert.ok(free.every((row) => row.Class === 'FREE'));
  assert.ok(paid.every((row) => row.Class === 'PAID'));
  const overlap = free.filter((row) => paid.some((other) => other.Model === row.Model));
  assert.deepEqual(overlap, []);
});
