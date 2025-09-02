import { FileSystemService, walkMarkdownFiles } from '../file-system'
import { Replacement } from '../markdown'
import { LinkProcessor, ParsedLink, LinkProcessingConfig } from '../markdown/link-processor'
import { logger } from '../observability'
import { DEFAULT_CONCURRENCY_LIMIT } from './path-operation-helpers'

/**
 * Result of a batch processing operation
 */
export type BatchProcessingResult = {
  totalFiles: number
  processedFiles: number
  totalLinksUpdated: number
  totalReplacementsApplied: number
  byKind: Record<string, number>
  errors: Array<{ file: string; error: string }>
}

/**
 * Batch Link Processor - Functions for batch processing of multiple files
 * Handles concurrent processing with configurable limits and progress tracking
 */

/**
 * Process multiple files concurrently with link replacements
 */
export async function processFilesWithLinkReplacements(
  files: string[],
  generateReplacements: (
    links: ParsedLink[],
    file: string,
    config: LinkProcessingConfig,
    fileService: FileSystemService,
  ) => Promise<Replacement[]>,
  config: LinkProcessingConfig & { concurrencyLimit?: number },
  fileService: FileSystemService,
): Promise<BatchProcessingResult> {
  const concurrencyLimit = config.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT
  const result: BatchProcessingResult = {
    totalFiles: files.length,
    processedFiles: 0,
    totalLinksUpdated: 0,
    totalReplacementsApplied: 0,
    byKind: {},
    errors: [],
  }

  // Process files in batches to avoid overwhelming the file system
  for (let i = 0; i < files.length; i += concurrencyLimit) {
    const batch = files.slice(i, i + concurrencyLimit)
    const batchPromises = batch.map(file =>
      processSingleFile(file, generateReplacements, config, fileService),
    )

    try {
      const batchResults = await Promise.all(batchPromises)
      aggregateBatchResults(result, batchResults)
    } catch (error) {
      logger.error(`Batch processing error: ${error}`)
      result.errors.push({ file: 'batch', error: String(error) })
    }
  }

  return result
}

type ProcessResult = {
  file: string
  success: boolean
  linksUpdated: number
  replacementsApplied: number
  byKind: Record<string, number>
  error?: string
}

function aggregateBatchResults(result: BatchProcessingResult, batchResults: ProcessResult[]) {
  for (const batchResult of batchResults) {
    if (batchResult.success) {
      result.processedFiles++
      result.totalLinksUpdated += batchResult.linksUpdated
      result.totalReplacementsApplied += batchResult.replacementsApplied

      // Aggregate byKind counts
      for (const [kind, count] of Object.entries(batchResult.byKind)) {
        result.byKind[kind] = (result.byKind[kind] || 0) + (count as number)
      }
    } else {
      result.errors.push({ file: batchResult.file, error: batchResult.error || 'Unknown error' })
    }
  }
}

/**
 * Process all markdown files in a directory with link replacements
 */
export async function processDirectoryWithLinkReplacements(
  datasetRoot: string,
  generateReplacements: (
    links: ParsedLink[],
    file: string,
    config: LinkProcessingConfig,
    fileService: FileSystemService,
  ) => Promise<Replacement[]>,
  config: LinkProcessingConfig & { concurrencyLimit?: number },
  fileService: FileSystemService,
): Promise<BatchProcessingResult> {
  const mdFiles = await walkMarkdownFiles(datasetRoot, fileService)
  return processFilesWithLinkReplacements(mdFiles, generateReplacements, config, fileService)
}

/**
 * Process files with path substitution (bulk update operation)
 */
export async function processPathSubstitution(options: {
  datasetRoot: string
  oldBase: string
  newBase: string
  config: { concurrencyLimit?: number }
  fileService: FileSystemService
}): Promise<BatchProcessingResult> {
  const { datasetRoot, oldBase, newBase, config, fileService } = options
  const generateReplacements = async (links: ParsedLink[]) =>
    LinkProcessor.generatePathSubstitutionReplacements(links, oldBase, newBase)

  return processDirectoryWithLinkReplacements(
    datasetRoot,
    generateReplacements,
    { docsFolders: [], datasetRoot, exclusionList: [], ...config },
    fileService,
  )
}

/**
 * Process files with normalization replacements
 */
export async function processNormalization(
  datasetRoot: string,
  config: LinkProcessingConfig & { concurrencyLimit?: number },
  fileService: FileSystemService,
): Promise<BatchProcessingResult> {
  const generateReplacements = async (
    links: ParsedLink[],
    file: string,
    config: LinkProcessingConfig,
    fileService: FileSystemService,
  ) => LinkProcessor.generateNormalizationReplacements(links, file, config, fileService)

  return processDirectoryWithLinkReplacements(
    datasetRoot,
    generateReplacements,
    config,
    fileService,
  )
}

/**
 * Process a single file with error handling
 */
async function processSingleFile(
  file: string,
  generateReplacements: (
    links: ParsedLink[],
    file: string,
    config: LinkProcessingConfig,
    fileService: FileSystemService,
  ) => Promise<Replacement[]>,
  config: LinkProcessingConfig,
  fileService: FileSystemService,
): Promise<{
  file: string
  success: boolean
  linksUpdated: number
  replacementsApplied: number
  byKind: Record<string, number>
  error?: string
}> {
  try {
    const content = await fileService.readFile(file)

    const result = await LinkProcessor.processFileWithLinks(content, async (links: ParsedLink[]) =>
      generateReplacements(links, file, config, fileService),
    )

    return await handleFileProcessingSuccess(file, result, fileService)
  } catch (error) {
    return handleFileProcessingError(file, error)
  }
}

/**
 * Handles successful file processing
 */
async function handleFileProcessingSuccess(
  file: string,
  result: { content: string; applied: number; byKind: Record<string, number> },
  fileService: FileSystemService,
): Promise<{
  file: string
  success: boolean
  linksUpdated: number
  replacementsApplied: number
  byKind: Record<string, number>
  error?: string
}> {
  // Check if file was modified
  const modified =
    (result.byKind?.['normalizedFull'] || 0) +
      (result.byKind?.['patched'] || 0) +
      (result.byKind?.['pathSubstitution'] || 0) >
    0

  if (modified) {
    await fileService.writeFile(file, result.content)
  }

  return {
    file,
    success: true,
    linksUpdated: Object.values(result.byKind).reduce(
      (sum: number, count: unknown) => sum + (count as number),
      0,
    ),
    replacementsApplied: result.applied,
    byKind: result.byKind,
  }
}

/**
 * Handles file processing error
 */
function handleFileProcessingError(
  file: string,
  error: unknown,
): {
  file: string
  success: boolean
  linksUpdated: number
  replacementsApplied: number
  byKind: Record<string, number>
  error?: string
} {
  return {
    file,
    success: false,
    linksUpdated: 0,
    replacementsApplied: 0,
    byKind: {},
    error: String(error),
  }
}

/**
 * Create a semaphore for controlling concurrency
 */
export function createSemaphore(maxConcurrent: number): {
  acquire: () => Promise<() => void>
  run: <T>(fn: () => Promise<T>) => Promise<T>
} {
  let running = 0
  const waiting: Array<{ resolve: (value: () => void) => void; reject: (error: Error) => void }> =
    []

  const acquire = (): Promise<() => void> => {
    return new Promise<() => void>((resolve, reject) => {
      const release = () => {
        running--
        if (waiting.length > 0) {
          const next = waiting.shift()
          next?.resolve(release)
        }
      }

      if (running < maxConcurrent) {
        running++
        resolve(release)
      } else {
        waiting.push({ resolve, reject })
      }
    })
  }

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    const release = await acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }

  return { acquire, run }
}
