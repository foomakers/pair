// Public API exports - only what's used externally
export { ensureKBAvailable } from './kb-availability'
export { getCachedKBPath, isKBCached } from './cache-manager'
export { validateKBUrl } from './url-validator'
export { validateCliOptions } from './cli-options'
export type { KBManagerDeps } from './kb-availability'
