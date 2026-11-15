import { needsAction } from './probe.js';
import { buildBanner } from './warn.js';

export const TOAST_DURATION_MS = 10_000;
export const UPDATE_PROMPT =
  'Update my C4F configuration: load the `c4f-update` skill with the skill tool, then run `install`.';

/**
 * Identity of the current advisory state. It only changes when a repo starts or
 * stops needing action or its behind count changes, so the periodic re-read of
 * the cache never re-toasts for a plain refresh.
 */
export function bannerSignature(state) {
  return (state?.repos ?? [])
    .filter((repo) => repo.state === 'behind' || repo.state === 'not-installed')
    .map((repo) => `${repo.name}:${repo.state}:${repo.behind ?? 0}`)
    .join('|');
}

export function toastOptions(state, sessionID) {
  if (!needsAction(state)) return undefined;
  const message = buildBanner(state);
  if (!message) return undefined;
  return {
    title: 'C4F config',
    message,
    variant: 'warning',
    duration: TOAST_DURATION_MS,
    ...(sessionID ? { sessionID } : {}),
  };
}

export function activeSession(router) {
  const route = router?.current?.();
  return route?.type === 'session' ? route.sessionID : undefined;
}
