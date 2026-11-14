import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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

function gitEnv() {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes',
  };
}

async function git(repoPath, args, timeout) {
  try {
    const { stdout } = await run('git', ['-C', repoPath, ...args], {
      timeout,
      windowsHide: true,
      maxBuffer: 1 << 20,
      env: gitEnv(),
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return { ok: false, error: firstLine(error) };
  }
}

function baseFor(target) {
  const path = expandHome(target.path);
  return {
    name: target.name,
    role: target.role,
    path,
    label: labelFor(path),
    branch: target.branch || 'master',
  };
}

function hasReusableState(previous, upstream) {
  if (previous?.state !== 'behind' && previous?.state !== 'up-to-date') return false;
  // Counts from a different upstream are not comparable after a remote change.
  return !previous.upstream || !upstream || previous.upstream === upstream;
}

function reuseState(previous, base, upstream, error) {
  return {
    ...base,
    upstream,
    state: previous.state,
    ahead: previous.ahead,
    behind: previous.behind,
    head: previous.head,
    offline: true,
    error,
  };
}

async function readCounts(repoPath, ref, timeout) {
  const counts = await git(repoPath, ['rev-list', '--left-right', '--count', `HEAD...${ref}`], timeout);
  if (!counts.ok) return undefined;

  const [ahead, behind] = counts.stdout.split(/\s+/).map((value) => Number.parseInt(value, 10) || 0);
  return { ahead, behind };
}

export async function probeRepo(target, { fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS, previous } = {}) {
  const base = baseFor(target);

  // A worktree/submodule stores .git as a file; a normal clone stores a directory.
  const dotGit = await stat(join(base.path, '.git')).catch(() => undefined);
  if (!dotGit || (!dotGit.isDirectory() && !dotGit.isFile())) {
    return { ...base, state: 'not-installed' };
  }

  // Prefer the tracked upstream; fall back to origin/<branch> for repos that
  // were bootstrapped with init + pull (which leaves no @{u}).
  const upstreamResult = await git(base.path, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], fetchTimeoutMs);
  let upstream;
  if (upstreamResult.ok) {
    upstream = upstreamResult.stdout;
  } else {
    const fallback = `origin/${base.branch}`;
    const verified = await git(base.path, ['rev-parse', '--verify', '--quiet', fallback], fetchTimeoutMs);
    if (!verified.ok) {
      return { ...base, state: 'unknown', error: 'no upstream tracking' };
    }
    upstream = fallback;
    base.inferredUpstream = true;
  }
  const slash = upstream.indexOf('/');
  if (slash <= 0 || slash === upstream.length - 1) {
    return { ...base, state: 'unknown', upstream, error: 'invalid upstream' };
  }

  const remote = upstream.slice(0, slash);
  base.upstream = upstream;

  const fetched = await git(base.path, ['fetch', '--quiet', '--no-tags', remote], fetchTimeoutMs);
  if (!fetched.ok && hasReusableState(previous, upstream)) {
    return reuseState(previous, base, upstream, fetched.error);
  }

  // Offline with no previous state: still try local refs for a best-effort answer.
  const offline = fetched.ok ? undefined : true;
  const counts = await readCounts(base.path, upstream, fetchTimeoutMs);
  if (!counts) {
    return { ...base, state: 'unknown', offline, error: fetched.error ?? 'cannot compare with upstream' };
  }

  const head = await git(base.path, ['rev-parse', '--short', 'HEAD'], fetchTimeoutMs);
  return {
    ...base,
    state: counts.behind > 0 ? 'behind' : 'up-to-date',
    ahead: counts.ahead,
    behind: counts.behind,
    head: head.ok ? head.stdout : undefined,
    offline,
    error: fetched.error,
  };
}

function failedRepo(target, previous, reason) {
  const base = baseFor(target);
  if (hasReusableState(previous, previous?.upstream)) {
    return reuseState(previous, base, previous.upstream, firstLine(reason));
  }
  return { ...base, state: 'unknown', offline: true, error: firstLine(reason) };
}

export async function probeAll(targets, { fetchTimeoutMs, previous = [] } = {}) {
  const previousByName = new Map(previous.map((repo) => [repo.name, repo]));
  const settled = await Promise.allSettled(
    targets.map((target) => probeRepo(target, { fetchTimeoutMs, previous: previousByName.get(target.name) })),
  );

  const repos = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const target = targets[index];
    return failedRepo(target, previousByName.get(target.name), result.reason);
  });

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
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temp, JSON.stringify(state, null, 2));
    await rename(temp, file);
  } catch {
    await rm(temp, { force: true }).catch(() => {});
  }
}

export function createProbe({ targets = defaultTargets(), stateFile = defaultStateFile(), fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
  let current;
  let refreshing;

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        current = await probeAll(targets, { fetchTimeoutMs, previous: current?.repos });
        await writeState(stateFile, current);
      } finally {
        refreshing = undefined;
      }
      return current;
    })();
    return refreshing;
  }

  async function load() {
    current = await readState(stateFile);
    return current;
  }

  return { get: () => current, load, refresh };
}
