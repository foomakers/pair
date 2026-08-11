// Public API of the kb-manager module.
// Public re-exports live HERE: production modules outside kb-manager import from
// `#kb-manager`, never from `#kb-manager/<internal module>` (DR-4). Tests still reach
// internal modules directly — deliberately, to spy on them.
//
// Nothing is re-exported "for completeness": every symbol below has a caller outside
// kb-manager. Slot primitives (getSourceCachePath, purgeSlot, ensureCacheDirectory,
// getCachedKBPath) are NOT public — slot mechanics stay inside the module that owns
// slots, behind the install* entry points.
export { ensureKBAvailable } from './kb-availability'
export { isKBCached } from './cache-manager'
export { localKBSource } from './cache-slot-key'
export { installKBFromLocalZip, installKBFromGit } from './kb-installer'
export { validateUrl } from '@pair/content-ops'
export { validateCliOptions } from './cli-options'
export type { KBManagerDeps } from './kb-availability'
