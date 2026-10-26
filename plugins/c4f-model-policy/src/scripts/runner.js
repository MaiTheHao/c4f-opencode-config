// Process runner with a recursion guard. Node built-ins only; never rejects:
// spawn errors and timeouts are reported through the result code.

import { spawn } from 'node:child_process';

function basename(arg) {
  const cut = Math.max(arg.lastIndexOf('/'), arg.lastIndexOf('\\'));
  return cut >= 0 ? arg.slice(cut + 1) : arg;
}

/** Return a reason when a command could recursively start OpenCode, else null. */
export function guardRecursion(command) {
  for (const arg of command) {
    const base = basename(arg).toLowerCase().replace(/\.exe$/, '');
    if (base === 'opencode') return 'spawns opencode';
  }
  return null;
}

/** Replace every `{HOME}` / `{ROOT}` token that has a value in `vars`. */
export function expandTokens(arg, vars) {
  return arg.replaceAll('{HOME}', vars.HOME).replaceAll('{ROOT}', vars.ROOT);
}

/**
 * Run an executable without a shell.
 * Exit code: -1 for spawn/timeout failure, -2 when recursion is blocked.
 */
export function runScript(command, timeoutMs, cwd) {
  const reason = guardRecursion(command);
  if (reason !== null) {
    return Promise.resolve({ code: -2, stdout: '', stderr: reason, ms: 0 });
  }

  const started = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let done = false;
    let timer;

    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ms: Date.now() - started });
    };

    const fail = (err) => {
      const message = err?.message ?? String(err);
      stderr = stderr ? `${stderr}\n${message}` : message;
      finish(-1);
    };

    try {
      const child = spawn(command[0], command.slice(1), {
        shell: false,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));

      timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(-1);
      }, timeoutMs);

      child.on('error', fail);
      child.on('close', (code) => finish(code ?? -1));
    } catch (err) {
      // Synchronous spawn failures (e.g. an empty command) settle too.
      fail(err);
    }
  });
}
