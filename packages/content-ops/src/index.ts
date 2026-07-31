export { FileSystemService, fileSystemService } from './file-system'
export { InMemoryFileSystemService } from './test-utils/in-memory-fs'
export { MockHttpClientService } from './test-utils/mock-http-client-service'
export { buildTestResponse, toIncomingMessage } from './test-utils/http-test-helpers'
export { walkMarkdownFiles, isExternalLink } from './file-system/file-system-utils'
export {
  cleanupFile,
  copyFileHelper,
  copyDirHelper,
  isWithinPath,
  normalizePathForCompare,
} from './file-system/file-operations'
export {
  extractLinks,
  extractLinksFromFile,
  extractLinksFromDirectory,
  classifyLinkType,
  extractAnchor,
  splitLinkParts,
  generateNormalizationReplacements,
  generatePathSubstitutionReplacements,
  detectLinkStyle,
  type ParsedLink,
  type LinkProcessingConfig,
} from './markdown/link-processor'
export {
  calculateSHA256,
  validateChecksum,
  getExpectedChecksum,
  type ChecksumValidationResult,
} from './file-system/integrity-validator'
export { isValidHttpUrl, validateUrl } from './file-system/url-validator'
export { extractZip } from './file-system/archive-operations'
export {
  validateKBStructure,
  findKBStructureInSubdirectories,
  moveDirectoryContents,
  copyDirectoryContents,
  normalizeExtractedKB,
} from './file-system/kb-validation'
export {
  detectSourceType,
  SourceType,
  isGitUrl,
  isRemoteUrl,
  isUnsupportedProtocol,
} from './path-resolution/source-detector'

export { SyncOptions, defaultSyncOptions } from './ops/SyncOptions'
export {
  Behavior,
  validateTargets,
  type TargetMode,
  type TargetConfig,
  type TransformConfig,
} from './ops/behavior'
export { copyPathOps, copyDirectoryWithTransforms, type CopyPathOpsResult } from './ops/copy'
export {
  flattenPath,
  prefixPath,
  transformPath,
  detectCollisions,
  isRegistryEntryPath,
  isValidFlattenDepth,
  type TransformOpts,
} from './ops/naming-transforms'
export {
  rewriteLinksInFile,
  rewriteLinksAfterTransform,
  type PathMappingEntry,
} from './ops/link-rewriter'
export { movePathOps } from './ops/movePathOps'
export {
  stripAllMarkers,
  applyTransformCommands,
  validateMarkers,
  type MarkerError,
} from './ops/content-transform'
export { syncFrontmatter } from './ops/frontmatter-transform'
export {
  rewriteSkillReferences,
  buildSkillNameMap,
  findSkillReferences,
  rewriteSkillReferencesInFiles,
  rewriteSkillLinkPaths,
  rewriteSkillLinkPathsInFiles,
  buildSkillLinkPathMap,
  type SkillNameMap,
  type SkillLinkPathMap,
} from './ops/skill-reference-rewriter'
export {
  readSkillNameManifest,
  writeSkillNameManifest,
  buildTransitionMap,
  findOrphanedInstalledNames,
  mergeSkillNameMaps,
  type SkillNameManifest,
} from './ops/skill-name-manifest'
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
  downloadWithRetry,
  isRetryableError,
} from './http'
export type { RetryOptions } from './http'
