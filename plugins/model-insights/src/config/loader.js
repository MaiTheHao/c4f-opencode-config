import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { errorMessage } from '../shared/errors.js';
import { validateConfig } from './schema.js';

const DEFAULT_FILE = new URL('../../model_insights.json', import.meta.url);
const OVERRIDE_FILE = new URL('../../model_insights.override.json', import.meta.url);
const EMPTY_CONFIG = Object.freeze({ schemaVersion: 1, models: Object.freeze([]) });

async function readConfig(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    const label = file instanceof URL ? fileURLToPath(file) : String(file);
    const wrapped = new Error(`cannot read ${label}: ${errorMessage(error)}`);
    wrapped.code = error?.code;
    throw wrapped;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON: ${errorMessage(error)}`);
  }
  return validateConfig(parsed);
}

/**
 * A valid override replaces the complete metadata catalog. If it is absent,
 * the base file is used. Invalid overrides are ignored with a diagnostic.
 * Explicit custom base files only use an override when one is explicitly
 * supplied, keeping test and custom-path behavior deterministic.
 */
export async function loadConfig(options = {}) {
  const { file } = options;
  const overrideFile = options.overrideFile ?? OVERRIDE_FILE;
  const shouldTryOverride = file === undefined || options.overrideFile !== undefined;
  let overrideError = null;

  if (shouldTryOverride) {
    try {
      const config = await readConfig(overrideFile);
      return { config, source: 'override', overrideError: null, error: null };
    } catch (error) {
      if (error?.code !== 'ENOENT') overrideError = errorMessage(error);
    }
  }

  try {
    const config = await readConfig(file ?? DEFAULT_FILE);
    return { config, source: file === undefined ? 'default' : 'custom', overrideError, error: null };
  } catch (error) {
    return {
      config: EMPTY_CONFIG,
      source: 'none',
      overrideError,
      error: errorMessage(error),
    };
  }
}
