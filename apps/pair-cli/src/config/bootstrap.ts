import { FileSystemService, HttpClientService, isRemoteUrl, validateUrl } from '@pair/content-ops'
import { getKnowledgeHubDatasetPath, getKnowledgeHubDatasetPathWithFallback } from './kb-resolver'
import { validateCliOptions } from '#kb-manager'
import { isDiagEnabled } from '#diagnostics'
import { DatasetAccessError, DatasetNotFoundError, KnowledgeHubSetupError } from './errors'

/**
 * Main entry point for application bootstrap.
 * Validates options and ensures the Knowledge Hub dataset is ready for use.
 *
 * LIVE since US-395 round 17 — it was dead code for the whole life of the feature.
 * `cli.ts`'s `preAction` hook guarded on `thisCommand === prog`, which Commander makes
 * always true (a program-level hook is invoked as `callback(hookedCommand, actionCommand)`),
 * so nothing here ever executed on a real `pair <command>`. Reviving it means:
 * - `--no-kb` skips the pre-flight fetch again, so it is no longer a no-op;
 * - `--url` together with `--no-kb` is REJECTED (`validateCliOptions`), where the dead
 *   pre-flight silently accepted it;
 * - only `install` and `update` reach this at all — the exemption list was inverted to an
 *   allow-list (`commands/bootstrap-policy.ts`) so waking the hook up does not make every
 *   read-only command reach for the network.
 *
 * The blast radius is every `install`/`update` invocation, so the two steps below must
 * agree on ONE path: step 3 checks what step 2 resolved, never a path of its own. Probing
 * the BUNDLED dataset path there is what made the first revival abort every released
 * install — in a published package `@pair/knowledge-hub` is a sibling under
 * `node_modules/@pair/`, not nested under the CLI, and no dataset is bundled.
 *
 * Recorded in
 * `.pair/adoption/decision-log/2026-08-11-kb-cache-slots-keyed-by-source-identity.md`
 * ("The KB pre-flight (`bootstrapEnvironment`) is LIVE"). US-395 review rounds 13-18.
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

  // 2. Ensure a KB is available — bundled, already cached, or downloaded — and keep WHICH
  //    path answered. `undefined` means "nothing to check": the fetch was skipped on
  //    purpose (--no-kb, or a local --url the command resolves itself).
  const datasetPath = await resolveDatasetForPreflight({ fsService, httpClient, version, url, kb })

  // 3. Final accessibility check, on the path step 2 actually resolved.
  if (datasetPath !== undefined) {
    checkDatasetAccessible(fsService, datasetPath)
  }
}

/**
 * Resolve the dataset the pre-flight is responsible for, and return the path it landed on.
 *
 * Returning the path (rather than a "did we skip" boolean) is the whole point: the previous
 * shape decided with `shouldSkipKBDownload` and then re-derived a path in step 3 from
 * `getKnowledgeHubDatasetPath`, i.e. the BUNDLED dataset. The two disagree in exactly the
 * case that matters — a released install, where the download populates `~/.pair/kb/<version>/`
 * and no bundled dataset exists at all — so step 3 threw on a fetch that had just succeeded.
 *
 * Order is load-bearing and unchanged: `--no-kb` first, then a local `--url` (a path the
 * command reads directly), then the bundled/monorepo dataset, then the network.
 */
async function resolveDatasetForPreflight(options: {
  fsService: FileSystemService
  httpClient: HttpClientService
  version: string
  url: string | undefined
  kb: boolean
}): Promise<string | undefined> {
  const { fsService, httpClient, version, url, kb } = options

  if (kb === false) {
    if (isDiagEnabled()) console.error('[diag] Skipping KB download (--no-kb flag set)')
    return undefined
  }

  if (url && !isRemoteUrl(url)) {
    if (isDiagEnabled()) console.error(`[diag] Using local path: ${url}`)
    return undefined
  }

  const bundled = bundledDatasetPath(fsService)
  if (bundled) {
    if (isDiagEnabled()) console.error('[diag] Using local dataset')
    return bundled
  }

  if (isDiagEnabled()) console.error('[diag] Local dataset not available, using KB manager')
  if (url) validateAndLogCustomUrl(url)

  try {
    return await getKnowledgeHubDatasetPathWithFallback({
      fsService,
      version,
      httpClient,
      ...(url !== undefined && { customUrl: url }),
    })
  } catch (err) {
    throw new KnowledgeHubSetupError(err instanceof Error ? err.message : String(err), err)
  }
}

/**
 * The dataset shipped alongside the CLI (monorepo checkout, or a nested install layout), or
 * `undefined` when there is none.
 *
 * `getKnowledgeHubDatasetPath` THROWS in a released install — it walks for
 * `<rootModuleDirectory>/packages/knowledge-hub/package.json` or
 * `.../node_modules/@pair/knowledge-hub/package.json`, and npm hoisting (like pnpm's flat
 * symlink layout) puts `@pair/knowledge-hub` next to `pair-cli`, not under it. So the throw
 * is the NORMAL released path, not an error: it means "no bundled dataset, go fetch".
 */
function bundledDatasetPath(fsService: FileSystemService): string | undefined {
  try {
    const datasetPath = getKnowledgeHubDatasetPath(fsService)
    return fsService.existsSync(datasetPath) ? datasetPath : undefined
  } catch {
    return undefined
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
 * Verify that the dataset the pre-flight resolved is present and readable.
 *
 * It takes the path as an ARGUMENT: deriving one here is what broke released installs — a
 * check that answers about a different location than the fetch it follows is not a check.
 *
 * @throws DatasetNotFoundError if the resolved dataset is not on disk
 * @throws DatasetAccessError if it exists but cannot be read
 */
function checkDatasetAccessible(fsService: FileSystemService, datasetPath: string): void {
  if (!fsService.existsSync(datasetPath)) {
    throw new DatasetNotFoundError(datasetPath)
  }

  try {
    fsService.accessSync(datasetPath)
  } catch (err) {
    throw new DatasetAccessError(datasetPath, err)
  }
}
