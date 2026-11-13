import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DEFAULT_FETCH_TIMEOUT_MS = 4_000;
export const DEFAULT_TTL_MS = 30 * 60 * 1000;
export const STATE_VERSION = 1;

function expandHome(path) {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
}

export function defaultTargets() {
  return [
    {
      name: 'c4f-opencode-config',
      role: 'main',
      path: join(homedir(), '.config', 'opencode'),
      branch: 'master',
    },
    {
      name: 'c4f-agent-skills',
      role: 'skills',
      path: join(homedir(), '.agents', 'skills'),
      branch: 'master',
    },
  ];
}

export function defaultStateFile() {
  const base = process.env.XDG_CACHE_HOME || (process.platform === 'win32' ? process.env.LOCALAPPDATA : undefined) || join(homedir(), '.cache');
  return join(base, 'opencode', 'c4f-update-state.json');
}

export function labelFor(path) {
  const home = homedir();
  return path === home ? '~' : path.startsWith(home + '/') ? `~/${path.slice(home.length + 1)}` : path;
}

function firstLine(error) {
  const text = String(error?.stderr || error?.message || error || '').trim();
  return text.split('\n')[0];
}

async function git(repoPath, args, timeout) {
  try {
    const { stdout } = await run('git', ['-C', repoPath, ...args], {
      timeout,
      windowsHide: true,
      maxBuffer: 1 << 20,
      env: process.env,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return { ok: false, error: firstLine(error) };
  }
}

export async function probeRepo(target, { fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  const path = expandHome(target.path);
  const base = { name: target.name, role: target.role, path, label: labelFor(path), branch: target.branch || 'master' };

  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) return { ...base, state: 'not-installed' };

  const inside = await git(path, ['rev-parse', '--is-inside-work-tree'], fetchTimeoutMs);
  if (!inside.ok || inside.stdout !== 'true') {
    return { ...base, state: 'not-installed', detail: 'not a git work tree' };
  }

  const branch = base.branch;
  const origin = await git(path, ['remote', 'get-url', 'origin'], fetchTimeoutMs);
  if (!origin.ok) return { ...base, state: 'unknown', error: 'no origin remote' };

  const fetched = await git(path, ['fetch', '--quiet', 'origin'], fetchTimeoutMs);
  const counts = await git(path, ['rev-list', '--left-right', '--count', `${branch}...origin/${branch}`], fetchTimeoutMs);
  if (!counts.ok) {
    return { ...base, state: 'unknown', offline: !fetched.ok, error: counts.error };
  }

  const [ahead, behind] = counts.stdout.split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
  const head = await git(path, ['rev-parse', '--short', 'HEAD'], fetchTimeoutMs);
  return {
    ...base,
    state: behind > 0 ? 'behind' : 'up-to-date',
    ahead,
    behind,
    head: head.ok ? head.stdout : undefined,
    offline: fetched.ok ? undefined : true,
    error: fetched.ok ? undefined : fetched.error,
  };
}

export async function probeAll(targets, options = {}) {
  const repos = await Promise.all(targets.map((target) => probeRepo(target, options)));
  return { version: STATE_VERSION, checkedAt: Date.now(), repos };
}

export function isFresh(state, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  return Boolean(state && Number.isFinite(state.checkedAt) && now - state.checkedAt < ttlMs);
}

export function needsAction(state) {
  const repos = state?.repos ?? [];
  return repos.some((repo) => repo.state === 'behind' || repo.state === 'not-installed');
}

export async function readState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return parsed?.version === STATE_VERSION && Array.isArray(parsed.repos) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function writeState(file, state) {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(state, null, 2));
  } catch {
    // A cache miss only costs one git probe; never surface it.
  }
}

export function createProbe({ targets = defaultTargets(), stateFile = defaultStateFile(), ttlMs = DEFAULT_TTL_MS, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS, now = () => Date.now() } = {}) {
  let current;
  let refreshing;

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        current = await probeAll(targets, { fetchTimeoutMs });
        await writeState(stateFile, current);
      } finally {
        refreshing = undefined;
      }
      return current;
    })();
    return refreshing;
  }

  async function load() {
    const cached = await readState(stateFile);
    if (isFresh(cached, ttlMs, now())) {
      current = cached;
      return current;
    }
    current = cached;
    void refresh();
    return current;
  }

  return { get: () => current, load, refresh };
}
