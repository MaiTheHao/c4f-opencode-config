// C4F model allowlist plugin for OpenCode v2.
//   L1  registry filter   — hides models the allowlist does not permit
//   L2  request gate      — interrupts requests pinned to a denied model
//   prompt scripts        — optional commands run before each prompt
//   allowed_models tool   — read-only view of the enforced policy
// Configuration lives in ./env.js. The plugin does not log.

import { env, tokens } from './env.js';
import { registerPromptScripts, registerRegistryFilter, registerRequestGate } from './lib/hooks.js';
import { loadSnapshot } from './lib/policy.js';
import { registerAllowedModelsTool } from './lib/tool.js';

// Order matters: registry filtering first, the query tool last so it always
// reads the live snapshot.
const REGISTRARS = [
  registerRegistryFilter,
  registerRequestGate,
  registerPromptScripts,
  registerAllowedModelsTool,
];

export default {
  id: 'c4f-model-policy',

  async setup(ctx) {
    if (!env.enabled) return;

    const { policy, scripts } = env;
    const registrations = [];
    let refreshTimer;

    // null means the last load failed; enforcement then follows policy.onSnapshotFailure.
    let snapshot = null;
    const refresh = async () => {
      try {
        snapshot = await loadSnapshot({ freeSuffix: policy.freeSuffix });
      } catch {
        snapshot = null;
      }
    };

    try {
      await refresh();

      const deps = { ctx, snapshot: () => snapshot, policy, scripts, tokens };
      for (const register of REGISTRARS) {
        const registration = await register(deps);
        if (registration) registrations.push(registration);
      }

      if (policy.refreshMs > 0) {
        refreshTimer = setInterval(refresh, policy.refreshMs);
        refreshTimer.unref?.();
      }
    } catch {
      return;
    }

    return async () => {
      clearInterval(refreshTimer);

      for (const registration of registrations) {
        try {
          await registration.dispose();
        } catch {
          // One failing disposer must not block the remaining registrations.
        }
      }
    };
  },
};
