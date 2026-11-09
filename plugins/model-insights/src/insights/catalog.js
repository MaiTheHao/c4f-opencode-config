import { normalizeModelID, normalizeProviderID, normalizeTrigger } from '../config/schema.js';

function metadataFor(configModels, model) {
  const providerID = normalizeProviderID(model.providerID);
  const id = normalizeModelID(model.id);
  let generic = null;
  for (const metadata of configModels) {
    if (metadata.id !== id) continue;
    if (metadata.providerID === providerID) return metadata;
    if (metadata.providerID === null) generic = metadata;
  }
  return generic;
}

/** Join live runtime records with non-authoritative agent-selection metadata. */
export function buildCatalog(runtimeModels, config) {
  const metadata = Array.isArray(config?.models) ? config.models : [];
  return runtimeModels.map((model) => {
    const match = metadataFor(metadata, model);
    return Object.freeze({
      ...model,
      configured: match != null,
      costTier: Number.isInteger(match?.costTier) ? match.costTier : null,
      triggers: Object.freeze(Array.isArray(match?.triggers) ? [...match.triggers] : []),
    });
  }).sort((a, b) => {
    const tierA = Number.isInteger(a.costTier) ? a.costTier : Number.POSITIVE_INFINITY;
    const tierB = Number.isInteger(b.costTier) ? b.costTier : Number.POSITIVE_INFINITY;
    return tierA - tierB
      || a.providerID.localeCompare(b.providerID)
      || a.id.localeCompare(b.id);
  });
}

export function filterCatalog(models, { provider = '', paidType = 'CONFIGURED', trigger = '' } = {}) {
  const providerID = normalizeProviderID(provider);
  const allowedTypes = new Set(['CONFIGURED', 'ALL', 'PAID', 'FREE', 'UNPRICED']);
  const normalizedType = String(paidType).trim().toUpperCase();
  const normalizedTrigger = normalizeTrigger(trigger);
  if (!allowedTypes.has(normalizedType)) {
    throw new Error(`unknown paid_type ${JSON.stringify(normalizedType)}; valid values: ${[...allowedTypes].join(' | ')}`);
  }

  return models.filter((model) => {
    if (providerID && normalizeProviderID(model.providerID) !== providerID) return false;
    if (normalizedTrigger && !model.triggers.includes(normalizedTrigger)) return false;
    if (normalizedType === 'CONFIGURED' || normalizedType === 'PAID' || normalizedType === 'UNPRICED') {
      if (model.configured !== true) return false;
    }
    return normalizedType === 'ALL' || normalizedType === 'CONFIGURED' || model.classification === normalizedType;
  });
}

export function resolveModel(models, modelInput, providerInput = '') {
  const raw = typeof modelInput === 'string' ? modelInput.trim() : '';
  if (!raw) return { matches: [], error: 'model is required' };

  let provider = normalizeProviderID(providerInput);
  let modelID = raw;
  const slash = raw.indexOf('/');
  if (!provider && slash > 0) {
    provider = normalizeProviderID(raw.slice(0, slash));
    modelID = raw.slice(slash + 1);
  }
  const id = normalizeModelID(modelID);
  if (!id) return { matches: [], error: 'model ID is invalid' };

  const matches = models.filter((model) => model.id === id && (!provider || model.providerID === provider));
  return { matches, error: null, ambiguous: !provider && matches.length > 1 };
}
