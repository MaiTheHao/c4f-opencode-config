export const MARKER = '<c4f-update-check>';

function pending(state) {
  return (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
}

function describe(repo) {
  const label = repo.label ?? repo.name;
  if (repo.state === 'not-installed') return `${label}: not installed — \`install\` clones it`;
  const ref = repo.upstream ?? `origin/${repo.branch ?? 'master'}`;
  const offline = repo.offline ? ' (offline, last known)' : '';
  return `${label}: ${repo.behind} commit(s) behind ${ref}${offline}`;
}

/**
 * Identity of the advisory. It changes only when a repo starts or stops needing
 * action or its behind count changes, so a session is told once per state.
 */
export function advisorySignature(state) {
  return pending(state)
    .map((repo) => `${repo.name}:${repo.state}:${repo.behind ?? 0}`)
    .join('|');
}

/**
 * Text appended to the user's prompt at admission. This is the only channel of
 * the update check: it never touches the system prompt. No timestamp is
 * included, so a refresh with the same counts produces an identical block.
 */
export function buildInstruction(state) {
  const repos = pending(state);
  if (repos.length === 0) return undefined;

  return [
    MARKER,
    'C4F configuration is out of date:',
    ...repos.map((repo) => `- ${describe(repo)}`),
    'Tell the user once, in their language, and offer to update. Do not run git or edit files yourself.',
    'If the user approves, load the `c4f-update` skill with the skill tool, then run `install` (both repos unless they choose one).',
    'If the user declines, do not mention it again for the rest of the session.',
    '</c4f-update-check>',
  ].join('\n');
}
