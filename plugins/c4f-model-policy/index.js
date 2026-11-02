// C4F model allowlist plugin for OpenCode v2 — entry point.
//   L1  registry filter   — hides models the allowlist does not permit
//   L2  request gate      — interrupts requests pinned to a denied model
//   allowed_models tool   — read-only view of the enforced policy
// Configuration lives in ./allowed_models.json; implementation lives in ./src.

import { setup } from './src/setup.js';

export default {
  id: 'c4f-model-policy',
  setup: (ctx) => setup(ctx),
};
