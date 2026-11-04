const col = (header, key, format = (value) => value, align = undefined) => ({
  header,
  align,
  get: (row) => format(row[key]),
});

const price = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const variants = (value) => Array.isArray(value) && value.length ? value.join(', ') : null;
const triggers = (value) => Array.isArray(value) && value.length ? value.join(', ') : null;

export const LIST_COLUMNS = [
  col('Model', 'id'),
  col('Provider', 'provider'),
  col('Class', 'classification'),
  col('Cost tier', 'costTier'),
  col('Triggers', 'triggers', triggers),
  col('Variants', 'variants', variants),
];

export const PRICING_COLUMNS = [
  col('Model', 'id'),
  col('Provider', 'provider'),
  col('Class', 'classification'),
  col('Input', 'input', price, 'right'),
  col('Output', 'output', price, 'right'),
  col('Cost tier', 'costTier'),
  col('Triggers', 'triggers', triggers),
];

export const INSPECT_COLUMNS = [
  col('Model', 'id'),
  col('Provider', 'provider'),
  col('Class', 'classification'),
  col('Input', 'input', price, 'right'),
  col('Output', 'output', price, 'right'),
  col('Cost tier', 'costTier'),
  col('Triggers', 'triggers', triggers),
  col('Variants', 'variants', variants),
];

export const VARIANT_COLUMNS = [
  col('Model', 'id'),
  col('Provider', 'provider'),
  col('Variant', 'variant'),
];
