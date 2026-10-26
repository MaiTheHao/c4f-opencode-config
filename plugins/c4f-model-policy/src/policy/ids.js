// Identifier normalization. Pure functions, no side effects.

/** Separator joining provider and model parts of a pricing key. */
export const PRICING_KEY_SEP = '\0';

/** Convert a provider-qualified / variant model identifier to its base id. */
export function baseId(id) {
  const last = id.trim().split('/').pop() ?? '';
  const hash = last.indexOf('#');
  return (hash === -1 ? last : last.slice(0, hash)).toLowerCase();
}

/** Normalize a provider id for exact comparison: trim + lowercase. */
export function normalizeProviderID(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Join normalized provider and base model ids, or '' when either part is empty. */
export function pricingKey(providerID, modelID) {
  const provider = normalizeProviderID(providerID);
  const id = typeof modelID === 'string' ? baseId(modelID) : '';
  if (provider === '' || id === '') return '';
  return `${provider}${PRICING_KEY_SEP}${id}`;
}

/** Accept `{ providerID, id }`, `{ providerID, modelID }`, or a "provider/model" string. */
export function modelRef(model) {
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
