import { startUpdateCheck } from '../c4f-check-for-update/index.js';
import { createSnapshotStore } from './runtime/snapshot-store.js';
import { registerModelInsightsTool } from './tools/model-insights/index.js';

const SNAPSHOT_REFRESH_MS = 60_000;

export async function setup(ctx) {
  const options = ctx?.options ?? {};
  // Start the update check first: it must not wait on the model registry.
  let updateCheck;
  try {
    updateCheck = await startUpdateCheck(ctx, options.updateCheck ?? {});
  } catch {
    updateCheck = undefined;
  }

  const store = createSnapshotStore(ctx, {
    configFile: options.configFile,
    overrideFile: options.overrideFile,
  });

  // Register even when the initial registry read fails. Each tool invocation
  // retries the live read before returning any model as available.
  await store.refresh();
  const registration = await registerModelInsightsTool({
    ctx,
    snapshot: store.get,
    refresh: store.refresh,
  });
  if (registration) store.start(SNAPSHOT_REFRESH_MS);

  return async () => {
    await updateCheck?.dispose?.();
    store.stop();
    try {
      await registration?.dispose?.();
    } catch {
      // Cleanup errors must not affect OpenCode shutdown.
    }
  };
}
