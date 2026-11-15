import { Plugin } from '@opencode/plugin/tui';
import { defaultStateFile, readState } from './src/modules/check-for-update/probe.js';
import { activeSession, bannerSignature, toastOptions, UPDATE_PROMPT } from './src/modules/check-for-update/notify.js';

const DEFAULT_POLL_MS = 60_000;

/**
 * TUI part of c4f-plugin. It renders the update advisory as a toast, re-reading
 * the cache written by the server module, and owns the `/c4f-update` command so
 * the model only hears about the update when the user asks for it.
 */
export default Plugin.define({
  id: 'c4f-plugin.tui',
  async setup(context) {
    const options = context.options ?? {};
    if (options.enabled === false) return;

    const stateFile = typeof options.stateFile === 'string' ? options.stateFile : defaultStateFile();
    const pollMs = Number.isFinite(options.pollMs) && options.pollMs > 0 ? options.pollMs : DEFAULT_POLL_MS;

    let disposed = false;
    let shown;
    let timer;

    const notify = async () => {
      if (disposed) return;
      try {
        const state = await readState(stateFile);
        const signature = bannerSignature(state);
        if (!signature) {
          // Nothing pending: a later update with the same counts must toast again.
          shown = undefined;
          return;
        }
        if (signature === shown) return;
        const toast = toastOptions(state, activeSession(context.ui.router));
        if (!toast) return;
        shown = signature;
        context.ui.toast.show(toast);
      } catch {
        // The advisory must never break the TUI; the next poll retries.
      }
    };

    const poll = () => {
      void notify().finally(() => {
        if (!disposed) {
          timer = setTimeout(poll, pollMs);
          timer.unref?.();
        }
      });
    };
    poll();

    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'c4f.update',
          title: 'Update C4F configuration',
          group: 'C4F',
          slash: { name: 'c4f-update' },
          run: async () => {
            const sessionID = activeSession(context.ui.router);
            if (!sessionID) {
              context.ui.toast.show({
                title: 'C4F config',
                message: 'Open a session first, then run /c4f-update.',
                variant: 'warning',
              });
              return;
            }
            try {
              await context.client.session.prompt({ sessionID, text: UPDATE_PROMPT });
            } catch (error) {
              context.ui.toast.show({
                title: 'C4F config',
                message: `Cannot start the update: ${error?.message ?? error}`,
                variant: 'error',
              });
            }
          },
        },
      ],
      bindings: [],
    }));

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  },
});
