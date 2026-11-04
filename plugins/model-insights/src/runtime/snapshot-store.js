import { loadConfig } from '../config/loader.js';
import { buildCatalog } from '../insights/catalog.js';
import { errorMessage } from '../shared/errors.js';
import {
  countUnavailableRegistryModels,
  normalizeRegistryModels,
  unwrapRegistryResponse,
} from './normalizer.js';

function emptySnapshot() {
  return Object.freeze({
    models: Object.freeze([]),
    runtimeStatus: 'unavailable',
    runtimeLoadedAt: null,
    runtimeError: 'runtime registry has not been loaded',
    unavailableModelCount: 0,
    metadataStatus: 'unavailable',
    metadataSource: 'none',
    metadataLoadedAt: null,
    metadataError: null,
    overrideError: null,
    refreshedAt: null,
  });
}

/**
 * Atomic read-only snapshot of OpenCode's current model registry plus local
 * agent-selection metadata. Failed refreshes retain internal last-known data,
 * but callers must not present that data as currently available.
 */
export function createSnapshotStore(ctx, { configFile = undefined, overrideFile = undefined } = {}) {
  let snapshot = emptySnapshot();
  let refreshPromise = null;
  let timer = null;

  async function doRefresh() {
    const configResult = await loadConfig({
      ...(configFile !== undefined ? { file: configFile } : {}),
      ...(overrideFile !== undefined ? { overrideFile } : {}),
    });

    let runtimeModels = snapshot.models;
    let runtimeStatus = snapshot.runtimeStatus;
    let runtimeLoadedAt = snapshot.runtimeLoadedAt;
    let runtimeError = snapshot.runtimeError;
    let unavailableModelCount = snapshot.unavailableModelCount;

    try {
      if (typeof ctx?.model?.list !== 'function') {
        throw new Error('ctx.model.list() is not available');
      }
      const response = await ctx.model.list();
      const rawModels = unwrapRegistryResponse(response);
      unavailableModelCount = countUnavailableRegistryModels(rawModels);
      runtimeModels = normalizeRegistryModels(rawModels);
      runtimeStatus = 'loaded';
      runtimeLoadedAt = Date.now();
      runtimeError = null;
    } catch (error) {
      runtimeError = errorMessage(error);
      runtimeStatus = runtimeLoadedAt === null ? 'unavailable' : 'stale';
    }

    const catalog = buildCatalog(runtimeModels, configResult.config);
    snapshot = Object.freeze({
      models: Object.freeze(catalog),
      runtimeStatus,
      runtimeLoadedAt,
      runtimeError,
      unavailableModelCount,
      metadataStatus: configResult.error ? 'unavailable' : 'loaded',
      metadataSource: configResult.source,
      metadataLoadedAt: configResult.error ? null : Date.now(),
      metadataError: configResult.error,
      overrideError: configResult.overrideError,
      refreshedAt: Date.now(),
    });
    return snapshot;
  }

  function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  return {
    get: () => snapshot,
    refresh,
    start(intervalMs) {
      if (!(intervalMs > 0) || timer) return;
      timer = setInterval(() => { void refresh(); }, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
