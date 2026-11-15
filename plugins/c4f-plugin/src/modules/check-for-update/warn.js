function pending(state) {
  return (state?.repos ?? []).filter((repo) => repo.state === 'behind' || repo.state === 'not-installed');
}

/**
 * One-line toast text. This is the only user-facing surface of the update
 * check: it is rendered by the TUI plugin and never reaches the model.
 */
export function buildBanner(state, { command = '/c4f-update' } = {}) {
  const repos = pending(state);
  if (repos.length === 0) return undefined;

  const parts = repos.map((repo) => {
    if (repo.state === 'not-installed') return `${repo.name} not installed`;
    return `${repo.name} +${repo.behind}`;
  });
  return `C4F config update available: ${parts.join(', ')}. Run ${command} to update.`;
}
