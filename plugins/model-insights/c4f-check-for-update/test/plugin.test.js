import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startUpdateCheck } from '../index.js';
import { isDiscoverable, parseSkillSource } from '../src/skill.js';

function stateFileFor(repos, checkedAt = Date.now()) {
  return { version: 1, checkedAt, repos };
}

const behind = stateFileFor([
  { name: 'c4f-opencode-config', label: '~/.config/opencode', branch: 'master', state: 'behind', ahead: 0, behind: 3 },
  { name: 'c4f-agent-skills', label: '~/.agents/skills', branch: 'master', state: 'up-to-date', ahead: 0, behind: 0 },
]);

function mockCtx(initialSkills = [], { discovered = [] } = {}) {
  const hooks = {};
  const skills = [...initialSkills];
  const added = [];
  const synthetic = [];
  const ctx = {
    env: {},
    session: {
      hook: async (name, callback) => {
        hooks[name] = callback;
        return { dispose() {} };
      },
      synthetic: async (input) => {
        synthetic.push(input);
      },
    },
    skill: {
      list: async () => ({ data: discovered }),
      transform: async (callback) => {
        callback({
          list: () => skills,
          get: (id) => skills.find((skill) => skill.id === id),
          add: (skill) => {
            added.push(skill);
            skills.push(skill);
          },
        });
        return { dispose() {} };
      },
    },
  };
  return { ctx, hooks, added, synthetic };
}

const SKILL = `---
name: c4f-update
description: "Update the C4F repos."
---

# c4f-update

Run install.
`;

async function setup(t, { repos = behind.repos, skills = [], discovered = [], options = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const stateFile = join(dir, 'state.json');
  const skillPath = join(dir, 'SKILL.md');
  await writeFile(stateFile, JSON.stringify(stateFileFor(repos)));
  await writeFile(skillPath, SKILL);
  const { ctx, hooks, added, synthetic } = mockCtx(skills, { discovered });
  const check = await startUpdateCheck(ctx, { stateFile, skillPath, ttlMs: 60_000, ...options });
  t.after(() => check.dispose());
  return { hooks, added, synthetic, check, dir };
}

test('injects one WARN part per request while behind', async (t) => {
  const { hooks } = await setup(t);
  const request = { system: [] };
  hooks.context(request);
  assert.equal(request.system.length, 1);
  assert.match(request.system[0].text, /<c4f-update-check>/);
  assert.match(request.system[0].text, /3 commit\(s\) behind/);

  hooks.context(request);
  assert.equal(request.system.length, 1, 'the marker prevents duplicate injection');
});

test('stays silent when the cached state is current', async (t) => {
  const { hooks } = await setup(t, {
    repos: [{ name: 'a', label: '~/a', branch: 'master', state: 'up-to-date', ahead: 0, behind: 0 }],
  });
  const request = { system: [] };
  hooks.context(request);
  assert.equal(request.system.length, 0);
});

test('banner is posted once per session', async (t) => {
  const { hooks, synthetic } = await setup(t);
  await hooks.prompt({ sessionID: 's1' });
  await hooks.prompt({ sessionID: 's1' });
  assert.equal(synthetic.length, 1);
  assert.match(synthetic[0].text, /c4f-opencode-config \+3/);

  await hooks.prompt({ sessionID: 's2' });
  assert.equal(synthetic.length, 2);
});

test('leaves a discovered skill alone and maps it only as a fallback', async (t) => {
  const discovered = await setup(t, { discovered: [{ id: 'c4f-update', name: 'c4f-update' }] });
  assert.equal(discovered.added.length, 0);

  const { added } = await setup(t);
  assert.equal(added.length, 1);
  assert.equal(added[0].id, 'c4f-update');
  assert.equal(added[0].name, 'c4f-update');
  assert.equal(added[0].autoinvoke, true);
  assert.doesNotMatch(added[0].content, /^---/);

  const existing = await setup(t, {
    skills: [{ id: 'c4f-update', name: 'c4f-update', path: '/x/c4f-update/SKILL.md' }],
  });
  assert.equal(existing.added.length, 0);
});

test('disabled by env or option registers nothing', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'c4f-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { ctx, hooks, added } = mockCtx();
  const check = await startUpdateCheck(ctx, {
    enabled: false,
    stateFile: join(dir, 'state.json'),
    skillPath: join(dir, 'SKILL.md'),
  });
  t.after(() => check.dispose());
  assert.deepEqual(Object.keys(hooks), []);
  assert.equal(added.length, 0);

  const second = mockCtx();
  second.ctx.env = { C4F_UPDATE_CHECK: '0' };
  const fromEnv = await startUpdateCheck(second.ctx, {
    stateFile: join(dir, 'state.json'),
    skillPath: join(dir, 'SKILL.md'),
  });
  t.after(() => fromEnv.dispose());
  assert.deepEqual(Object.keys(second.hooks), []);
});

test('skills in a discovery directory are not mapped twice', () => {
  const home = '/home/tester';
  const roots = [`${home}/.agents/skills`, `${home}/.config/opencode/skills`];
  assert.equal(isDiscoverable(`${home}/.config/opencode/skills/c4f-update/SKILL.md`, roots), true);
  assert.equal(isDiscoverable(`${home}/.agents/skills/c4f-update/SKILL.md`, roots), true);
  assert.equal(isDiscoverable(`${home}/custom/skills/c4f-update/SKILL.md`, roots), false);
  assert.equal(isDiscoverable(`${home}/.config/opencode/skills-extra/c4f-update/SKILL.md`, roots), false);
});

test('parseSkillSource strips frontmatter and reads the description', () => {
  const parsed = parseSkillSource(SKILL);
  assert.equal(parsed.name, 'c4f-update');
  assert.equal(parsed.description, 'Update the C4F repos.');
  assert.match(parsed.content, /^# c4f-update/);
  assert.equal(parseSkillSource('no frontmatter'), undefined);
  assert.equal(parseSkillSource('---\nname: x\n---\n'), undefined);
});
