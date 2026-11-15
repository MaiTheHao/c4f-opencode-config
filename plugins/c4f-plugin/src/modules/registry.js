import * as checkForUpdate from './check-for-update/index.js';
import * as codeRetrieval from './code-retrieval/index.js';

/**
 * Ordered module registry. Each value is a module namespace that exposes
 * exactly one entry point, `run(ctx, options)`. Object key order is both the
 * execution order and the option namespace under `ctx.options`.
 */
export const registry = {
  codeRetrieval,
  updateCheck: checkForUpdate,
};
