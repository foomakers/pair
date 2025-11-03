export { FileSystemService, fileSystemService } from './file-system'
export { InMemoryFileSystemService } from './test-utils/in-memory-fs'
export { walkMarkdownFiles, isExternalLink } from './file-system/file-system-utils'
export { extractLinks, type ParsedLink } from './markdown/markdown-parser'

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

export { logger, setLogLevel, getLogLevel, LogLevel } from './observability'
export { detectRepoRoot, convertToRelative, convertToAbsolute } from './path-resolution'
