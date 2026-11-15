import { spawn } from 'node:child_process';

/**
 * Runs one process and always resolves (never rejects) so the tool can turn
 * failures into readable status content instead of a provider error.
 */
export function runProcess({ command, args, cwd, timeoutMs = 0, env = process.env, signal }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, command, code: null, stdout: '', stderr: '', spawnError: error, timedOut: false, aborted: false });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let spawnError;
    let settled = false;

    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      resolve({
        ok: code === 0 && !timedOut && !aborted && !spawnError,
        command,
        code,
        stdout,
        stderr,
        spawnError,
        timedOut,
        aborted,
      });
    };

    const onAbort = () => {
      aborted = true;
      child.kill('SIGKILL');
    };

    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs)
      : undefined;
    timer?.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      spawnError = error;
      finish(null);
    });
    child.on('close', (code) => finish(code));

    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener?.('abort', onAbort, { once: true });
    }
  });
}

/**
 * Python runner with a `python3` -> `python` fallback. Only a missing binary
 * triggers the fallback; a non-zero exit is a real result and is returned as-is.
 */
export function createPythonRunner({ python, fallback = 'python' } = {}) {
  const commands = [python, fallback].filter(Boolean);

  return async function runPython({ args, cwd, timeoutMs, env, signal }) {
    let last;
    for (const command of [...new Set(commands)]) {
      const result = await runProcess({ command, args, cwd, timeoutMs, env, signal });
      if (result.spawnError?.code === 'ENOENT') {
        last = result;
        continue;
      }
      return result;
    }
    return last;
  };
}
