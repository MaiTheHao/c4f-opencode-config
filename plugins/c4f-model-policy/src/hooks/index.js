import { registerRegistryFilter } from './registry-filter.js';
import { registerRequestGate } from './request-gate.js';

/** Hook registrars in execution order. Each takes `{ ctx, snapshot, policy }`. */
export const REGISTRARS = [registerRegistryFilter, registerRequestGate];
