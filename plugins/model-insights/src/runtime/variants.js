/**
 * Read variant IDs from the OpenCode runtime model record.
 * Supports the runtime's string and { id } forms, preserving order.
 */
export function extractVariantIDs(variants) {
  if (!Array.isArray(variants)) return [];

  const ids = [];
  const seen = new Set();
  for (const variant of variants) {
    const raw = typeof variant === 'string'
      ? variant
      : variant !== null && typeof variant === 'object' && typeof variant.id === 'string'
        ? variant.id
        : '';
    const id = raw.trim();
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
