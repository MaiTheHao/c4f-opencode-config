// Native runtime configuration for the C4F plugin. Edit the values below;
// the plugin has no other configuration source and performs no logging.

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
});
