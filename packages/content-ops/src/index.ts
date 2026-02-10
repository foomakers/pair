export { FileSystemService, fileSystemService } from './file-system'
export { InMemoryFileSystemService } from './test-utils/in-memory-fs'
export { MockHttpClientService } from './test-utils/mock-http-client-service'
export { buildTestResponse, toIncomingMessage } from './test-utils/http-test-helpers'
export { walkMarkdownFiles, isExternalLink } from './file-system/file-system-utils'
export { cleanupFile, copyFileHelper, copyDirHelper } from './file-system/file-operations'
export { extractLinks, type ParsedLink, LinkProcessor } from './markdown/link-processor'
export { detectLinkStyle } from './markdown/link-processor'
export {
  calculateSHA256,
  validateChecksum,
  getExpectedChecksum,
  type ChecksumValidationResult,
} from './file-system/integrity-validator'
export { isValidHttpUrl, validateUrl } from './file-system/url-validator'
export { extractZip } from './file-system/archive-operations'
export { detectSourceType, SourceType } from './path-resolution/source-detector'

export { SyncOptions, defaultSyncOptions } from './ops/SyncOptions'
export { Behavior, validateTargets, type TargetMode, type TargetConfig } from './ops/behavior'
export { copyPathOps } from './ops/copyPathOps'
export { flattenPath, prefixPath, transformPath, detectCollisions } from './ops/naming-transforms'
export {
  rewriteLinksInFile,
  rewriteLinksAfterTransform,
  type PathMappingEntry,
} from './ops/link-rewriter'
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
export { StatsCollector, formatSummary, formatJSON } from './reporting'
export type { LinkStats, FormatOptions } from './reporting'

export {
  BackupService,
  type BackupSession,
  type RegistryConfig,
} from './file-updates/backup-service'
export { AtomicWriter, type AtomicWriterOptions } from './file-updates/atomic-write'

// HTTP download utilities
export type {
  DownloadOptions,
  DownloadErrorHandler,
  ProgressWriter,
  ProgressData,
  ResumeDecision,
  DownloadContext,
  HttpClientService,
} from './http'
export {
  downloadFile,
  NodeHttpClientService,
  ProgressReporter,
  calculateSpeed,
  formatProgress,
  setupResumeContext,
  finalizeDownload,
  getContentLength,
  getPartialFilePath,
  hasPartialDownload,
  getPartialFileSize,
  cleanupPartialFile,
  shouldResume,
} from './http'
