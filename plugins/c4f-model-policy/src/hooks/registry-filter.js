import { isAllowed, modelRef } from '../policy/index.js';

/** L1 — remove every model the current snapshot does not allow from the registry. */
export function registerRegistryFilter({ ctx, snapshot, policy }) {
  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  return ctx.model.transform((editor) => {
    try {
      const current = snapshot();
      const models = typeof editor?.list === 'function' ? editor.list() : [];

      for (const model of models) {
        const denied = current === null ? failClosed : !isAllowed(current, modelRef(model));
        if (denied) editor.remove(model.providerID, model.id);
      }
    } catch {
      // Never break model listing because of a policy error.
    }
  });
}
