// Repository scope helpers: root resolution, path containment, ranged reads,
// and Git HEAD — all without spawning a process. The plugin runs inside the
// OpenCode server, so it must never shell out (same rule as plugins/c4f-model-policy).

import { existsSync, realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_SOURCE_BYTES = 2_000_000;
/** How many parent directories to inspect while looking for the git dir. */
const MAX_PARENT_WALK = 64;

/**
 * Location root. The plugin never guesses from process.cwd(): that is what
 * split the MCP deployment into two divergent context stores.
 *
 * A `repo_root` override is accepted when it is the session location, a
 * directory inside it, or the repository root that contains it (the case that
 * matters: a session opened in `repo/pkg/` while the work is at `repo/`).
 * A relative override is resolved against the workspace, never the process CWD.
 * An ancestor is only accepted when it actually looks like a repository root,
 * so `--repo_root /` cannot turn the plugin into a whole-filesystem reader.
 *
 * Every returned path is canonical: symlinks are resolved *before* containment
 * is decided, so a link inside the workspace cannot re-anchor the root outside
 * it. A path that cannot be canonicalized is refused rather than accepted
 * lexically — a root is claimed to exist, so a `realpath` failure is an error.
 */
export function resolveRoot(ctx, override) {
  const location = ctx?.location;
  const sessionRoot = location?.project?.canonical ?? location?.directory;

  if (typeof sessionRoot !== 'string' || sessionRoot.trim() === '') {
    throw new Error('session location is unavailable: ctx.location.project.canonical and ctx.location.directory are both missing');
  }

  const base = canonicalRoot(sessionRoot, 'session location');
  if (dirname(base) === base) {
    // The filesystem root contains everything, so every containment check would
    // pass and the plugin would read the whole machine.
    throw new Error(`session location must not be the filesystem root (${base})`);
  }

  if (typeof override !== 'string' || override.trim() === '') return base;

  const candidate = canonicalRoot(resolve(base, override), `repo_root ${JSON.stringify(override)}`);
  if (candidate === base || isInside(base, candidate)) return candidate;

  if (!isInside(candidate, base)) {
    throw new Error(`repo_root must be the session location, a directory inside it, or the repository root containing it; got ${candidate}`);
  }

  if (!existsSync(join(candidate, '.git'))) {
    throw new Error(`repo_root may only be an ancestor of the session location when it is a repository root (no .git in ${candidate})`);
  }
  return candidate;
}

/** Absolute canonical path; refuses anything that does not resolve. */
function canonicalRoot(path, describe) {
  try {
    return realpathSync(resolve(path));
  } catch {
    throw new Error(`${describe} does not exist or cannot be resolved: ${resolve(path)}`);
  }
}

/** True when `candidate` is the root itself or sits below it. */
export function isInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Repository-relative POSIX path, or null when the candidate escapes the root. */
export function relativeTo(root, candidate) {
  if (!isInside(root, candidate)) return null;
  return relative(resolve(root), resolve(candidate)).split(sep).join('/');
}

/**
 * Read a repository file after resolving symlinks and enforcing containment.
 * Returns `{ path, content }` with a POSIX relative path; throws on anything
 * that is not a regular file inside the root.
 */
export async function readTextFile(root, givenPath, maxBytes = MAX_SOURCE_BYTES) {
  if (typeof givenPath !== 'string' || givenPath.trim() === '') {
    throw new Error('path must be a non-empty string');
  }

  const rootReal = await realpath(resolve(root)).catch(() => resolve(root));
  let candidate;
  try {
    candidate = await realpath(resolve(root, givenPath));
  } catch {
    throw new Error(`file not found: ${givenPath}`);
  }

  if (!isInside(rootReal, candidate)) throw new Error('path must resolve inside the repository root');

  const info = await stat(candidate);
  if (!info.isFile()) throw new Error('path must identify a regular file');

  const content = await readCappedFile(candidate, maxBytes);

  return { path: relativeTo(rootReal, candidate), content: content.toString('utf8') };
}

/**
 * Read a file without ever buffering more than `maxBytes`. The size is checked
 * on `stat` first, so an oversized file is refused before it is opened.
 */
export async function readCappedFile(absolutePath, maxBytes = MAX_SOURCE_BYTES) {
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new Error('not a regular file');
  if (info.size > maxBytes) throw new Error(`file exceeds ${maxBytes} bytes`);

  const content = await readFile(absolutePath);
  if (content.byteLength > maxBytes) throw new Error(`file exceeds ${maxBytes} bytes`);

  return content;
}

/**
 * Commit SHA of HEAD, read straight from `.git`. Handles plain checkouts,
 * worktrees and submodules (`.git` is a file), `commondir`, and packed refs.
 *
 * Walks up from `root` like git does, so a session opened in a subdirectory
 * still gets a real SHA instead of `null`. Returns null outside a repository.
 */
export async function resolveHead(root) {
  const gitDir = await findGitDir(resolve(root));
  if (gitDir === null) return null;

  const commonDir = await readCommonDir(gitDir);
  let head;
  try {
    head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
  } catch {
    return null;
  }

  if (/^[0-9a-f]{40,64}$/i.test(head)) return head;

  const match = /^ref:\s*(\S+)$/.exec(head);
  if (!match) return null;

  const ref = match[1];
  for (const base of [gitDir, commonDir]) {
    if (base === null) continue;
    try {
      const value = (await readFile(join(base, ref), 'utf8')).trim();
      if (value !== '') return value;
    } catch {
      // Loose ref missing: fall through to packed-refs.
    }
  }

  return (await packedRef(gitDir, ref)) ?? (commonDir === null ? null : await packedRef(commonDir, ref));
}

async function findGitDir(root) {
  // Git resolves a repository by walking up, so a subdirectory root must find
  // the same .git as the top level. Bounded to keep a stray root from walking
  // to "/".
  let directory = root;
  for (let depth = 0; depth < MAX_PARENT_WALK; depth += 1) {
    const found = await gitDirAt(directory);
    if (found !== null) return found;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
  return null;
}

async function gitDirAt(directory) {
  const dotGit = join(directory, '.git');

  let info;
  try {
    info = await stat(dotGit);
  } catch {
    return null;
  }

  if (info.isDirectory()) return dotGit;

  try {
    const text = (await readFile(dotGit, 'utf8')).trim();
    const match = /^gitdir:\s*(.+)$/.exec(text);
    return match ? resolve(directory, match[1]) : null;
  } catch {
    return null;
  }
}

async function readCommonDir(gitDir) {
  try {
    const text = (await readFile(join(gitDir, 'commondir'), 'utf8')).trim();
    return text === '' ? null : resolve(gitDir, text);
  } catch {
    return null;
  }
}

async function packedRef(dir, ref) {
  try {
    const text = await readFile(join(dir, 'packed-refs'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('^')) continue;
      const [sha, name] = trimmed.split(' ');
      if (name === ref && sha !== undefined) return sha;
    }
  } catch {
    // No packed refs file.
  }
  return null;
}
