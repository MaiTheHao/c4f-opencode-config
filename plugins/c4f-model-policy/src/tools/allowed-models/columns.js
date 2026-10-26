// Column definitions for every view. Add or remove a column here once;
// the renderers and `renderTable` pick it up automatically.

import { isMoney } from '../../policy/index.js';

/** `{ key, header, get, format?, align? }`; `get` defaults to the matching row field. */
const column = (key, header, { get, format, align } = {}) => ({
  key,
  header,
  get: get ?? ((row) => row[key]),
  format,
  align,
});

const price = (value) => (isMoney(value) ? String(value) : '-');
const joined = (value) => (Array.isArray(value) && value.length > 0 ? value.join(', ') : '-');
const tier = (value) => (Number.isFinite(value) ? String(value) : '-');

const MODEL = column('model', 'Model');
const PROVIDER = column('provider', 'Provider');
const CLASS = column('class', 'Class');
const INPUT = column('input', 'Input', { format: price, align: 'right' });
const OUTPUT = column('output', 'Output', { format: price, align: 'right' });
const TIER = column('tier', 'Tier', { format: tier, align: 'right' });
const VARIANTS = column('variants', 'Variants', { format: joined });
const TRIGGER = column('trigger', 'Trigger', { format: joined });

/** `allowed`: every model the policy permits (authorized + FREE-by-price). */
export const ALLOWED_COLUMNS = [MODEL, PROVIDER, CLASS, INPUT, OUTPUT, TIER, VARIANTS, TRIGGER];

/** `banned`: refused ids only. */
export const BANNED_COLUMNS = [MODEL];

/** `pricing`: raw registry view, including DENIED and BANNED models. */
export const PRICING_COLUMNS = [MODEL, PROVIDER, CLASS, INPUT, OUTPUT];

/** `check`: exactly one row. */
export const CHECK_COLUMNS = [
  MODEL,
  PROVIDER,
  column('status', 'Status'),
  CLASS,
  TIER,
  VARIANTS,
  column('reason', 'Reason'),
];
