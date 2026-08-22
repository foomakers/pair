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
export { isKBCached, isStageOwnerAlive } from './cache-manager'
// `getCacheRoot` is the ONE public slot primitive: `kb-cache list/prune` inspects the cache
// as a whole, which is the one job that cannot go through an install entry point. It reads a
// root, it derives no slot — `getSourceCachePath` and friends stay private.
export { getCacheRoot, localKBSource } from './cache-slot-key'
export { cachedOfficialKBPath } from './kb-availability'
export { installKBFromLocalZip, installKBFromGit } from './kb-installer'
// The barrel surface was WIDENED here (US-291), not excepted from: `cloneGitRepo` becomes
// public because materializing a git source is not always an INSTALL — `kb-info`'s version
// check clones read-only into a throwaway directory and owns no slot, so it cannot go
// through `installKBFromGit`. `redactGitCredentials` travels with it: whoever surfaces a git
// error must be able to strip the credential from it.
export { cloneGitRepo, redactGitCredentials } from './git-clone'
export type { GitCloner } from './git-clone'
export { validateUrl } from '@pair/content-ops'
export { validateCliOptions } from './cli-options'
export type { KBManagerDeps } from './kb-availability'
