import { isAllowed, modelRef } from '../policy/index.js';

/** L2 — backstop: interrupt a session whose request is pinned to a denied model. */
export function registerRequestGate({ ctx, snapshot, policy }) {
  if (policy.gate !== 'interrupt') return undefined;
  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  return ctx.session.hook('model.request', async (event) => {
    try {
      const current = snapshot();
      const denied = current === null ? failClosed : !isAllowed(current, modelRef(event?.model));
      if (!denied) return;

      await ctx.session.interrupt({ sessionID: event?.sessionID, resume: false });
    } catch {
      // Never break a request because of a policy error.
    }
  });
}
