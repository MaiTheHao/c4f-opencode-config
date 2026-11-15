import { registry as defaultRegistry } from './modules/registry.js';

export async function setup(ctx, registry = defaultRegistry) {
  const options = ctx?.options ?? {};
  const handles = [];

  // Registry order is execution order: modules run one at a time, never in parallel.
  for (const [name, module] of Object.entries(registry)) {
    if (typeof module?.run !== 'function') continue;
    try {
      const handle = await module.run(ctx, options[name] ?? {});
      if (handle) handles.push(handle);
    } catch {
      // One failing module must not disable the rest of the plugin.
    }
  }

  return async () => {
    for (const handle of handles.reverse()) {
      try {
        await handle?.dispose?.();
      } catch {
        // Cleanup errors must not affect OpenCode shutdown.
      }
    }
  };
}
