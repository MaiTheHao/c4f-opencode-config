const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Validate model-selection metadata. This file describes model strengths for
 * agent reasoning; it never controls whether OpenCode enables a model.
 */
export function validateConfig(parsed) {
  if (!isRecord(parsed)) {
    throw new Error('config: expected a JSON object');
  }

  for (const key of Object.keys(parsed)) {
    if (!['schemaVersion', 'models'].includes(key)) {
      throw new Error(`config: unknown property ${JSON.stringify(key)}`);
    }
  }

  if (parsed.schemaVersion !== 1) {
    throw new Error(`config: "schemaVersion" must be 1, got ${JSON.stringify(parsed.schemaVersion)}`);
  }
  if (!Array.isArray(parsed.models)) {
    throw new Error('config: "models" must be an array');
  }

  const models = [];
  const seen = new Set();

  for (let index = 0; index < parsed.models.length; index += 1) {
    const entry = parsed.models[index];
    const path = `config: models[${index}]`;
    if (!isRecord(entry)) throw new Error(`${path} must be an object`);

    for (const key of Object.keys(entry)) {
      if (!['id', 'providerID', 'costTier', 'triggers'].includes(key)) {
        throw new Error(`${path} has unknown property ${JSON.stringify(key)}`);
      }
    }

    if (typeof entry.id !== 'string' || entry.id.trim() === '') {
      throw new Error(`${path}.id must be a non-empty string`);
    }
    if (entry.providerID !== undefined
      && (typeof entry.providerID !== 'string' || entry.providerID.trim() === '')) {
      throw new Error(`${path}.providerID must be a non-empty string when supplied`);
    }
    if (entry.costTier !== undefined
      && (!Number.isInteger(entry.costTier) || entry.costTier < 1)) {
      throw new Error(`${path}.costTier must be a positive integer when supplied`);
    }
    if (!Array.isArray(entry.triggers)) {
      throw new Error(`${path}.triggers must be an array of strings`);
    }

    const triggers = [];
    const triggerSet = new Set();
    for (let triggerIndex = 0; triggerIndex < entry.triggers.length; triggerIndex += 1) {
      const rawTrigger = entry.triggers[triggerIndex];
      if (typeof rawTrigger !== 'string' || rawTrigger.trim() === '') {
        throw new Error(`${path}.triggers[${triggerIndex}] must be a non-empty string`);
      }
      const trigger = normalizeTrigger(rawTrigger);
      if (triggerSet.has(trigger)) {
        throw new Error(`${path}.triggers contains duplicate value ${JSON.stringify(trigger)}`);
      }
      triggerSet.add(trigger);
      triggers.push(trigger);
    }

    const id = normalizeModelID(entry.id);
    const providerID = normalizeProviderID(entry.providerID ?? '');
    const key = `${providerID}\0${id}`;
    if (seen.has(key)) throw new Error(`${path} duplicates model metadata for ${entry.id}`);
    seen.add(key);

    models.push(Object.freeze({
      id,
      providerID: providerID || null,
      costTier: entry.costTier ?? null,
      triggers: Object.freeze(triggers),
    }));
  }

  return Object.freeze({ schemaVersion: 1, models: Object.freeze(models) });
}

export function normalizeProviderID(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeModelID(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  const hash = raw.indexOf('#');
  return hash === -1 ? raw : raw.slice(0, hash);
}

export function normalizeTrigger(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, '-')
    : '';
}
