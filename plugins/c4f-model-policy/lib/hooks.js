// OpenCode v2 enforcement hooks. Each registrar takes `{ ctx, snapshot, policy }`
// and returns the host registration (or undefined when nothing was registered).
// Hooks never throw into the host: an internal error leaves the request alone.

import { isAllowed } from './policy.js';
import { expandTokens, runScript } from './runner.js';

const DEFAULT_SCRIPT_TIMEOUT_MS = 2000;

/** L1 — remove every model the current snapshot does not allow from the registry. */
export function registerRegistryFilter({ ctx, snapshot, policy }) {
  const failClosed = policy.onSnapshotFailure === 'fail-closed';

  return ctx.model.transform((editor) => {
    try {
      const current = snapshot();
      const models = typeof editor?.list === 'function' ? editor.list() : [];

      for (const model of models) {
        const denied = current === null ? failClosed : !isAllowed(current, model);
        if (denied) editor.remove(model.providerID, model.id);
      }
    } catch {
      // Never break model listing because of a policy error.
    }
  });
}

/** L2 — backstop: interrupt a session whose request is pinned to a denied model. */
export function registerRequestGate({ ctx, snapshot, policy }) {
  if (policy.gate !== 'interrupt') return undefined;

  return ctx.session.hook('model.request', async (event) => {
    try {
      const current = snapshot();
      if (current === null) return;

      const ref = modelRef(event?.model);
      if (ref.id === '' || isAllowed(current, ref)) return;

      await ctx.session.interrupt({ sessionID: event?.sessionID, resume: false });
    } catch {
      // Never break a request because of a policy error.
    }
  });
}

/** Run the configured prompt scripts before each prompt. */
export function registerPromptScripts({ ctx, scripts, tokens }) {
  const pending = scripts.filter((script) => script.hook === 'prompt');
  if (pending.length === 0) return undefined;

  return ctx.session.hook('prompt', async (event) => {
    try {
      const notices = [];

      for (const script of pending) {
        const failure = await runPromptScript(script, tokens);
        if (failure !== null && script.onFailure === 'inject') notices.push(failure);
      }

      if (notices.length > 0 && typeof event?.prompt?.text === 'string') {
        event.prompt.text = `${notices.join('\n')}\n${event.prompt.text}`;
      }
    } catch {
      // A failing script bridge must not block the prompt.
    }
  });
}

/** Run one script; return a failure notice, or null on success. */
async function runPromptScript(script, tokens) {
  try {
    const args = Array.isArray(script.command) ? script.command : [];
    const command = args.map((arg) => expandTokens(String(arg), tokens));
    const result = await runScript(command, script.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS);
    if (result.code === 0) return null;

    const firstLine = (result.stderr.trim() || result.stdout.trim()).split('\n')[0];
    return `[c4f-model-policy] script "${script.id}" failed (exit ${result.code}): ${firstLine}`;
  } catch {
    return null;
  }
}

/** Accept `{ providerID, id }`, `{ providerID, modelID }`, or a "provider/model" string. */
function modelRef(model) {
  if (typeof model === 'string') {
    const cut = model.indexOf('/');
    return {
      providerID: cut < 0 ? '' : model.slice(0, cut),
      id: cut < 0 ? model : model.slice(cut + 1),
    };
  }

  const value = model ?? {};
  const id = typeof value.id === 'string' ? value.id : value.modelID;

  return {
    providerID: typeof value.providerID === 'string' ? value.providerID : '',
    id: typeof id === 'string' ? id : '',
  };
}
