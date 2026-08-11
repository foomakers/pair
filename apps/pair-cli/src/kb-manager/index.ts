// Public API exports - only what's used externally.
// Public re-exports live HERE: modules outside kb-manager import from `#kb-manager`,
// never from `#kb-manager/<internal module>` (DR-4).
export { ensureKBAvailable } from './kb-availability'
export { isKBCached, purgeSlot, ensureCacheDirectory } from './cache-manager'
export {
  getCachedKBPath,
  getSourceCachePath,
  localKBSource,
  officialSource,
  type KBSource,
} from './cache-slot-key'
export { validateUrl } from '@pair/content-ops'
export { validateCliOptions } from './cli-options'
export type { KBManagerDeps } from './kb-availability'
