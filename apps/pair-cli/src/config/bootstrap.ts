import {
  FileSystemService,
  HttpClientService,
  validateUrl,
  detectSourceType,
  SourceType,
} from '@pair/content-ops'
import { getKnowledgeHubDatasetPath, getKnowledgeHubDatasetPathWithFallback } from './kb-resolver'
import { validateCliOptions } from '#kb-manager/cli-options'
import { isDiagEnabled } from '#diagnostics'
import { DatasetAccessError, DatasetNotFoundError, KnowledgeHubSetupError } from './errors'

/**
 * Main entry point for application bootstrap.
 * Validates options and ensures the Knowledge Hub dataset is ready for use.
 */
export async function bootstrapEnvironment(options: {
  fsService: FileSystemService
  httpClient: HttpClientService
  version: string
  url: string | undefined
  kb: boolean
}): Promise<void> {
  const { fsService, httpClient, version, url, kb } = options

  // 1. Validate CLI input options formally
  validateCliOptions({ ...(url && { url }), kb })

  // 2. Ensure KB is available (local or download)
  if (!shouldSkipKBDownload(kb, fsService, url)) {
    if (isDiagEnabled()) console.error('[diag] Local dataset not available, using KB manager')

    if (url) {
      validateAndLogCustomUrl(url)
    }

    try {
      await getKnowledgeHubDatasetPathWithFallback({
        fsService,
        version,
        httpClient,
        ...(url !== undefined && { customUrl: url }),
      })
    } catch (err) {
      throw new KnowledgeHubSetupError(err instanceof Error ? err.message : String(err), err)
    }
  }

  // 3. Final accessibility check if KB is expected to be present
  if (kb !== false) {
    checkKnowledgeHubDatasetAccessible(fsService, url)
  }
}

/**
 * Check if local dataset exists in monorepo pair context
 * Guard clause: prevents getKnowledgeHubDatasetPath() call in release mode
 * Safe to call in both monorepo and release contexts - fails gracefully
 *
 * @param fsService - FileSystemService for path resolution
 * @returns true if dataset found locally, false otherwise
 */
function hasLocalDataset(fsService: FileSystemService): boolean {
  try {
    const datasetPath = getKnowledgeHubDatasetPath(fsService)
    return fsService.existsSync(datasetPath)
  } catch {
    return false
  }
}

/**
 * Validate custom URL format and log for diagnostics
 *
 * @param customUrl - URL to validate
 * @throws Error if URL format is invalid
 */
function validateAndLogCustomUrl(customUrl: string): void {
  validateUrl(customUrl)
  if (isDiagEnabled()) console.error(`[diag] Using custom URL: ${customUrl}`)
}

/**
 * Determine if KB download should be skipped based on flags and local dataset availability
 * Checks in order: --no-kb flag, custom local path, local dataset in monorepo context
 *
 * @param kb - Knowledge base flag value
 * @param fsService - FileSystemService for local dataset check (optional)
 * @param customUrl - Custom URL provided via CLI (optional)
 * @returns true if KB download can be skipped, false if download required
 */
function shouldSkipKBDownload(
  kb: boolean,
  fsService?: FileSystemService,
  customUrl?: string,
): boolean {
  if (kb === false) {
    if (isDiagEnabled()) console.error('[diag] Skipping KB download (--no-kb flag set)')
    return true
  }

  if (customUrl && detectSourceType(customUrl) !== SourceType.REMOTE_URL) {
    if (isDiagEnabled()) console.error(`[diag] Using local path: ${customUrl}`)
    return true
  }

  if (fsService && hasLocalDataset(fsService)) {
    if (isDiagEnabled()) console.error('[diag] Using local dataset')
    return true
  }

  return false
}

/**
 * Verify that the Knowledge Hub dataset is accessible
 * Skips check for local custom URLs; validates accessibility for default/remote sources
 *
 * @param fsService - FileSystemService for dataset path resolution
 * @param customUrl - Custom URL from CLI (optional, skips check if local path)
 * @throws DatasetNotFoundError if dataset not found
 * @throws DatasetAccessError if dataset exists but not accessible
 */
function checkKnowledgeHubDatasetAccessible(
  fsService: FileSystemService,
  customUrl?: string,
): void {
  if (customUrl && detectSourceType(customUrl) !== SourceType.REMOTE_URL) {
    return
  }

  const datasetPath = getKnowledgeHubDatasetPath(fsService)
  if (!fsService.existsSync(datasetPath)) {
    throw new DatasetNotFoundError(datasetPath)
  }

  try {
    fsService.accessSync(datasetPath)
  } catch (err) {
    throw new DatasetAccessError(datasetPath, err)
  }
}
