import { FileSystemService, HttpClientService } from '@pair/content-ops'
import { getKnowledgeHubDatasetPath, getKnowledgeHubDatasetPathWithFallback } from './kb-resolver'
import { isDiagEnabled } from '#diagnostics'
import { DatasetAccessError, DatasetNotFoundError, KnowledgeHubSetupError } from './errors'

/**
 * One diagnostic line. Inlining the `isDiagEnabled()` guard at every call site put
 * `resolveDatasetForPreflight` over the complexity ceiling with branches that carry no
 * behaviour — logging is not a decision.
 */
function diag(message: string): void {
  if (isDiagEnabled()) console.error(`[diag] ${message}`)
}

/**
 * Main entry point for application bootstrap.
 * Validates options and ensures the Knowledge Hub dataset is ready for use.
 *
 * LIVE since US-395 round 17 — it was dead code for the whole life of the feature.
 * `cli.ts`'s `preAction` hook guarded on `thisCommand === prog`, which Commander makes
 * always true (a program-level hook is invoked as `callback(hookedCommand, actionCommand)`),
 * so nothing here ever executed on a real `pair-cli <command>`. Reviving it means:
 * - `--no-kb` skips the pre-flight fetch again, so it is no longer a no-op;
 * - `--url` together with `--no-kb` is REJECTED, where the dead pre-flight silently accepted
 *   it — at the hook now (`runKbPreflight`), because a NAMED source makes the pre-flight skip
 *   and a validation below the skip would never run;
 * - only `install` and `update` reach this at all — the exemption list was inverted to an
 *   allow-list (`commands/bootstrap-policy.ts`) so waking the hook up does not make every
 *   read-only command reach for the network.
 *
 * It warms the OFFICIAL KB and nothing else. It takes no `url`: any named source — `--source`,
 * `--git`, `--url`, local or remote — makes the hook skip this entirely, because the command
 * fetches that source itself into its own identity-keyed slot. Passing a `url` down here is
 * what made a remote `--url` download the whole archive TWICE (round 21): warmed here, then
 * re-fetched by `ensureKBAvailable`, which never inspects an external slot.
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
  kb: boolean
}): Promise<void> {
  const { fsService, httpClient, version, kb } = options

  // 1. Ensure a KB is available — bundled, already cached, or downloaded — and keep WHICH
  //    path answered. `undefined` means "nothing to check": the fetch was skipped on
  //    purpose (--no-kb).
  const datasetPath = await resolveDatasetForPreflight({ fsService, httpClient, version, kb })

  // 2. Final accessibility check, on the path step 1 actually resolved.
  if (datasetPath !== undefined) {
    checkDatasetAccessible(fsService, datasetPath)
  }
}

/**
 * Resolve the dataset the pre-flight is responsible for, and return the path it landed on.
 *
 * Returning the path (rather than a "did we skip" boolean) is the whole point: the previous
 * shape decided with `shouldSkipKBDownload` and then re-derived a path in the accessibility
 * step from `getKnowledgeHubDatasetPath`, i.e. the BUNDLED dataset. The two disagree in exactly
 * the case that matters — a released install, where the download populates
 * `~/.pair/kb/<version>/` and no bundled dataset exists at all — so the check threw on a fetch
 * that had just succeeded.
 *
 * Order is load-bearing: `--no-kb` first, then the bundled/monorepo dataset, then the network.
 * The `--url` branches that used to sit between them are gone with the parameter (see
 * `bootstrapEnvironment`): the hook skips this function outright for a named source, so a
 * custom URL could only be re-fetched here, never served.
 */
async function resolveDatasetForPreflight(options: {
  fsService: FileSystemService
  httpClient: HttpClientService
  version: string
  kb: boolean
}): Promise<string | undefined> {
  const { fsService, httpClient, version, kb } = options

  if (kb === false) {
    diag('Skipping KB download (--no-kb flag set)')
    return undefined
  }

  const bundled = bundledDatasetPath(fsService)
  if (bundled) {
    diag('Using local dataset')
    return bundled
  }

  diag('Local dataset not available, using KB manager')

  try {
    return await getKnowledgeHubDatasetPathWithFallback({
      fsService,
      version,
      httpClient,
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
