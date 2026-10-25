// Native runtime configuration for the C4F plugin (replaces config.json).
// Edit the values below; the plugin has no other configuration source and
// performs no logging.

import { fileURLToPath } from 'node:url';

/** Placeholders expanded in script arguments: `{ROOT}` and `{HOME}`. */
export const tokens = Object.freeze({
  // OpenCode config root: two directories above plugins/c4f-model-policy/.
  ROOT: fileURLToPath(new URL('../../', import.meta.url)),
  HOME: process.env.HOME ?? '',
});

export const env = Object.freeze({
  /** `false` disables every hook and the allowed_models tool. */
  enabled: true,

  policy: Object.freeze({
    /** `interrupt` denies disallowed model requests (L2); `off` disables that hook. */
    gate: 'interrupt',
    /** When the allowlist cannot be loaded: `fail-closed` denies all, `fail-open` allows all. */
    onSnapshotFailure: 'fail-closed',
    /** Allowlist reload interval in milliseconds; `0` disables reloading. */
    refreshMs: 60_000,
  }),

  /**
   * Prompt-hook scripts, spawned without a shell:
   * { id, hook: 'prompt', command: [exe, ...args], timeoutMs = 2000, onFailure: 'inject' | 'ignore' }
   * `inject` prepends a failure notice to the prompt; anything else ignores failures.
   */
  scripts: Object.freeze([]),
});
