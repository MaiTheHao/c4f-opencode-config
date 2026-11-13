export const MARKER = '<c4f-update-check>';

function describe(repo) {
  if (repo.state === 'not-installed') return `${repo.label}: not installed — \`install\` clones it`;
  if (repo.state === 'behind') {
    const offline = repo.offline ? ' (offline, last known)' : '';
    return `${repo.label}: ${repo.behind} commit(s) behind origin/${repo.branch ?? 'master'}${offline}`;
  }
  return `${repo.label}: ${repo.state}`;
}

function stamp(checkedAt) {
  if (!Number.isFinite(checkedAt)) return 'unknown';
  return new Date(checkedAt).toISOString().replace('.000Z', 'Z');
}

export function buildInstruction(state, { skillId = 'c4f-update' } = {}) {
  const repos = (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
  if (repos.length === 0) return undefined;

  return [
    MARKER,
    `C4F configuration is out of date (checked ${stamp(state.checkedAt)}):`,
    ...repos.map((repo) => `- ${describe(repo)}`),
    'Tell the user once per session, in their language, and offer to update. Do not run git or edit files yourself.',
    `If the user approves, follow the \`${skillId}\` skill and run \`install\` (both repos unless they choose one).`,
    'If the user declines, do not mention it again for the rest of the session.',
    '</c4f-update-check>',
  ].join('\n');
}

export function buildBanner(state, { skillId = 'c4f-update' } = {}) {
  const repos = (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
  if (repos.length === 0) return undefined;

  const parts = repos.map((repo) => {
    if (repo.state === 'not-installed') return `${repo.name} not installed`;
    return `${repo.name} +${repo.behind}`;
  });
  return `C4F config update available: ${parts.join(', ')}. Ask me to update and I will follow the ${skillId} skill.`;
}
