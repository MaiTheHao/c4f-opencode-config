// Plugin lifecycle: build the snapshot store, register hooks, return a disposer.

import { REGISTRARS } from './hooks/index.js';
import { createSnapshotStore } from './policy/snapshot-store.js';
import { registerAllowedModelsTool } from './tools/allowed-models/index.js';

// Order matters: registry filtering first, the query tool last so it always
// reads the live snapshot.
const ALL_REGISTRARS = [...REGISTRARS, registerAllowedModelsTool];

export async function setup(ctx, { env }) {
  if (!env.enabled) return;

  const { policy } = env;
  const store = createSnapshotStore(ctx);
  const registrations = [];

  try {
    await store.refresh();

    const deps = { ctx, snapshot: store.get, policy };
    for (const register of ALL_REGISTRARS) {
      const registration = await register(deps);
      if (registration) registrations.push(registration);
    }

    store.start(policy.refreshMs);
  } catch {
    return;
  }

  return async () => {
    store.stop();

    for (const registration of registrations) {
      try {
        await registration.dispose();
      } catch {
        // One failing disposer must not block the remaining registrations.
      }
    }
  };
}
