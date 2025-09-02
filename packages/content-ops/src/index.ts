export { FileSystemService, fileSystemService } from './file-system'

export { SyncOptions } from './ops/SyncOptions'
export { Behavior } from './ops/behavior'
export { copyPathOps } from './ops/copyPathOps'
export { movePathOps } from './ops/movePathOps'
export { validatePathOps } from './ops/validatePathOps'
export {
  processFilesWithLinkReplacements,
  processDirectoryWithLinkReplacements,
  processPathSubstitution,
  processNormalization,
  createSemaphore,
} from './ops/link-batch-processor'

// observability exports
export { logger, setLogLevel, getLogLevel, LogLevel } from './observability'
