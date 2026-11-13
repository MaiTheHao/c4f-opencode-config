export const MARKER = '<c4f-update-check>';

function describe(repo) {
  if (repo.state === 'not-installed') return `${repo.label}: not installed — \`install\` clones it`;
  if (repo.state === 'behind') {
    const offline = repo.offline ? ' (offline, last known)' : '';
    const ref = repo.upstream ?? `origin/${repo.branch ?? 'master'}`;
    return `${repo.label}: ${repo.behind} commit(s) behind ${ref}${offline}`;
  }
  return `${repo.label}: ${repo.state}`;
}

function stamp(checkedAt) {
  if (!Number.isFinite(checkedAt)) return 'unknown';
  return new Date(checkedAt).toISOString().replace('.000Z', 'Z');
}

export function buildInstruction(state) {
  const repos = (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
  if (repos.length === 0) return undefined;

  return [
    MARKER,
    `C4F configuration is out of date (checked ${stamp(state.checkedAt)}):`,
    ...repos.map((repo) => `- ${describe(repo)}`),
    'Tell the user once per session, in their language, and offer to update. Do not run git or edit files yourself.',
    'If the user approves, use the skill tool to load the `c4f-update` skill, then run `install` (both repos unless they choose one).',
    'If the user declines, do not mention it again for the rest of the session.',
    '</c4f-update-check>',
  ].join('\n');
}

export function buildBanner(state) {
  const repos = (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
  if (repos.length === 0) return undefined;

  const parts = repos.map((repo) => {
    if (repo.state === 'not-installed') return `${repo.name} not installed`;
    return `${repo.name} +${repo.behind}`;
  });
  return `C4F config update available: ${parts.join(', ')}. Ask me to update; I will load the c4f-update skill.`;
}
