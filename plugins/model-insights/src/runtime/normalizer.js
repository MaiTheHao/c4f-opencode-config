import { classifyCost, extractPrice } from '../insights/pricing.js';
import { normalizeProviderID, normalizeModelID } from '../config/schema.js';
import { extractVariantIDs } from './variants.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function modelIDOf(model) {
  if (typeof model.id === 'string' && model.id.trim()) return model.id.trim();
  if (typeof model.modelID === 'string' && model.modelID.trim()) return model.modelID.trim();
  return '';
}

/**
 * Normalize the public registry payload. OpenCode's Model.Info.enabled flag
 * is authoritative: explicitly disabled records are never exposed as choices.
 */
export function normalizeRegistryModels(models) {
  if (!Array.isArray(models)) throw new Error('runtime registry payload must be an array');

  const normalized = [];
  const seen = new Set();
  for (const model of models) {
    if (!isRecord(model) || model.enabled !== true) continue;

    const providerRaw = typeof model.providerID === 'string' ? model.providerID.trim() : '';
    const rawID = modelIDOf(model);
    const providerID = normalizeProviderID(providerRaw);
    const id = normalizeModelID(rawID);
    if (!id) continue;

    const key = `${providerID}\0${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const price = extractPrice(model.cost);
    normalized.push(Object.freeze({
      id,
      runtimeID: rawID,
      providerID,
      provider: providerRaw || '-',
      name: typeof model.name === 'string' && model.name.trim() ? model.name.trim() : null,
      enabled: model.enabled !== false,
      classification: classifyCost(model.cost),
      input: price.input,
      output: price.output,
      variants: Object.freeze(extractVariantIDs(model.variants)),
    }));
  }

  normalized.sort((a, b) => a.providerID.localeCompare(b.providerID) || a.id.localeCompare(b.id));
  return normalized;
}

/** Count records that Runtime does not explicitly mark as enabled. */
export function countUnavailableRegistryModels(models) {
  if (!Array.isArray(models)) return 0;
  return models.filter((model) => isRecord(model) && model.enabled !== true).length;
}

/** Accept the standard OpenCode { data } response and array test adapters. */
export function unwrapRegistryResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  throw new Error('ctx.model.list() returned no model data array');
}
