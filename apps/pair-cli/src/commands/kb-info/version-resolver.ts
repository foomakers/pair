import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'
import { isGitUrl, isRemoteUrl } from '@pair/content-ops'
import type { GitCloner } from '#kb-manager'
import { cloneGitRepo, redactGitCredentials } from '#kb-manager'
import { resolveDatasetRoot } from '#config/kb-resolver'
import { readManifestFromZip } from './manifest-reader'

/** KB source kind, as detected from an (optional) --source value. */
export type KbSourceKind = 'registry' | 'remote' | 'local' | 'git'

/** Result of resolving the "current" (available/publishable) KB version for a source. */
export interface CurrentVersionResult {
  sourceKind: KbSourceKind
  version: string | null
  available: boolean
  stable: boolean
  error?: string
}

/** Result of resolving the "installed" KB version recorded in a project. */
export interface InstalledVersionResult {
  version: string | null
  recordedAt?: string
}

export const INSTALLED_VERSION_MARKER = join('.pair', '.kb-version.json')

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A version is considered "stable" when it's a plain major.minor.patch (no pre-release/build tag). */
export function isStableVersion(version: string | null): boolean {
  return version !== null && /^\d+\.\d+\.\d+$/.test(version)
}

/** `version` of the JSON file at `filePath`, or null when absent/unreadable/untyped. */
function readVersionField(fs: FileSystemService, filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath)) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : null
  } catch {
    return null
  }
}

/**
 * Read a version string from a directory: prefers a manifest.json at the
 * directory root (packaged KB layout), falls back to a sibling package.json
 * (monorepo `packages/knowledge-hub/dataset` layout, where `..` IS the KB package
 * root). Returns null when neither is present or neither carries a usable version
 * field.
 *
 * Only for a directory whose PARENT is known to be the owning package — never for a
 * clone in a temp directory: see `readVersionFromRepoRoot`.
 */
export function readVersionFromDirectory(fs: FileSystemService, dirPath: string): string | null {
  return (
    readVersionField(fs, join(dirPath, 'manifest.json')) ??
    readVersionField(fs, join(dirPath, '..', 'package.json'))
  )
}

/**
 * Read a version string from a directory that IS the repository root of a fresh clone:
 * manifest.json ONLY.
 *
 * Two files are deliberately not consulted.
 *
 * The PARENT directory's package.json, because for a clone the parent is a throwaway temp
 * root — the sibling fallback `readVersionFromDirectory` applies would report
 * `<temp-root>/package.json`, a file the repository does not own and, on Linux, one any
 * local process can drop into the shared /tmp.
 *
 * The repository's OWN package.json, because the INSTALL side cannot mirror that read and
 * the two must agree. `install --url <git url>` records the installed version from the
 * cache slot through `readVersionFromDirectory` (`<slot>/manifest.json` ??
 * `~/.pair/kb/external/package.json`, which is never created), so a git KB with a root
 * package.json but no manifest.json would report a "current" version that install can
 * never record: the user would be told "installed version unknown" against a known current
 * one forever, never up-to-date and never drift. Manifest-only makes the same repo report
 * `available: false` with a reason that names the cure instead.
 */
function readVersionFromRepoRoot(fs: FileSystemService, dirPath: string): string | null {
  return readVersionField(fs, join(dirPath, 'manifest.json'))
}

/**
 * What has to be resolved, with the value each kind needs already narrowed. A discriminated
 * union rather than an options bag with optional fields: the compiler proves `source` is
 * present on every kind that reads it, so no branch re-asserts it.
 */
type VersionRequest =
  | { kind: 'registry' }
  | { kind: 'local'; source: string }
  | { kind: 'remote'; source: string }
  | { kind: 'git'; source: string }

function detectRequest(source?: string): VersionRequest {
  if (!source) return { kind: 'registry' }
  if (isGitUrl(source)) return { kind: 'git', source }
  if (isRemoteUrl(source)) return { kind: 'remote', source }
  return { kind: 'local', source }
}

/**
 * Resolve the registry (no --source) KB version. Mirrors install/update's own
 * dataset resolution: tries the monorepo dataset first, then falls back to
 * download/cache via `resolveDatasetRoot`'s 'default' resolution — the same
 * path release-context (real npm-installed, no monorepo) users go through.
 */
async function resolveRegistryVersion(
  fs: FileSystemService,
  options: { httpClient?: HttpClientService; cliVersion?: string } = {},
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  try {
    const datasetPath = await resolveDatasetRoot(
      fs,
      { resolution: 'default' },
      { cliVersion: options.cliVersion, httpClient: options.httpClient },
    )
    if (!fs.existsSync(datasetPath)) {
      return {
        version: null,
        available: false,
        error: `Knowledge base dataset not found at ${datasetPath}`,
      }
    }
    return { version: readVersionFromDirectory(fs, datasetPath), available: true }
  } catch (err) {
    return { version: null, available: false, error: errorMessage(err) }
  }
}

function extractVersionFromUrl(url: string): string | null {
  const match = url.match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/)
  return match ? (match[1] ?? null) : null
}

function checkReachable(
  url: string,
  httpClient: HttpClientService,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise(resolve => {
    let settled = false
    const settle = (result: { ok: boolean; error?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    try {
      httpClient.get(
        url,
        res => {
          if (typeof res.destroy === 'function') res.destroy()
          const statusCode = res.statusCode ?? 0
          if (statusCode >= 400) {
            settle({ ok: false, error: `HTTP ${statusCode}` })
          } else {
            settle({ ok: true })
          }
        },
        undefined,
        (err: Error) => settle({ ok: false, error: err.message }),
      )
    } catch (err) {
      settle({ ok: false, error: errorMessage(err) })
    }
  })
}

async function resolveRemoteVersion(
  url: string,
  httpClient?: HttpClientService,
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  if (!httpClient) {
    return {
      version: extractVersionFromUrl(url),
      available: false,
      error: 'No network client available to verify remote KB source',
    }
  }

  const reachability = await checkReachable(url, httpClient)
  if (!reachability.ok) {
    return {
      version: null,
      available: false,
      ...(reachability.error && { error: reachability.error }),
    }
  }
  return { version: extractVersionFromUrl(url), available: true }
}

async function resolveLocalVersion(
  fs: FileSystemService,
  sourcePath: string,
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  const resolved = fs.resolve(fs.currentWorkingDirectory(), sourcePath)
  if (!fs.existsSync(resolved)) {
    return { version: null, available: false, error: `Source path not found: ${resolved}` }
  }

  if (resolved.endsWith('.zip')) {
    try {
      const manifest = readManifestFromZip(resolved)
      return { version: manifest.version ?? null, available: true }
    } catch (err) {
      return { version: null, available: false, error: errorMessage(err) }
    }
  }

  return { version: readVersionFromDirectory(fs, resolved), available: true }
}

/**
 * Resolve the version a git source currently publishes.
 *
 * The clone lands in a THROWAWAY directory under the OS temp root, never in the KB cache
 * slot the same source owns (`~/.pair/kb/external/git-<hash>`): the version check is a read
 * (D20), while the install path clones into that slot unconditionally and deletes it on
 * failure. Reusing it here would make a read able to destroy an installed KB — and a cached
 * clone can be arbitrarily stale, which would make the reported "current" version a lie.
 *
 * The clone gets a PRIVATE root of its own (`<temp>/pair-kb-version-<uuid>/repo`), created
 * 0700 before anything lands in it, for two reasons:
 *   - the clone's PARENT must never be the shared OS temp root, or a `/tmp/package.json`
 *     dropped by any local process would be read as the KB's version (the read here is
 *     root-only anyway — `readVersionFromRepoRoot` — so this is defence in depth);
 *   - `git clone` creates its destination 0755 & ~umask, i.e. a world-readable copy of a
 *     possibly-private KB sitting in shared /tmp for the duration of the check.
 * The root is created empty and the clone lands in a child that does not exist yet, which
 * `git clone` requires (it accepts a missing or empty destination, never a populated one).
 */
async function resolveGitVersion(
  fs: FileSystemService,
  source: string,
  cloner: GitCloner,
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  const tempRoot = join(tmpdir(), `pair-kb-version-${randomUUID()}`)
  const tempDir = join(tempRoot, 'repo')
  try {
    await fs.mkdir(tempRoot, { recursive: true })
    // Private BEFORE the clone starts: until chmod returns the directory is empty, so the
    // window exposes nothing. (`mkdir` here takes no mode, hence create-then-restrict.)
    await fs.chmod(tempRoot, 0o700)
    await cloner(source, tempDir)
    const version = readVersionFromRepoRoot(fs, tempDir)
    if (version === null) {
      return {
        version: null,
        available: false,
        error: `No KB version found at git source ${redactGitCredentials(source)} (no manifest.json at the repository root — add one so install and kb-info report the same version)`,
      }
    }
    return { version, available: true }
  } catch (err) {
    // Offline, auth failure, missing `git`, unknown #ref — all degrade, none throw. The
    // token no longer travels in the URL this module builds (see `gitAuthEnv` in
    // `git-clone.ts`), but the source is redacted anyway (AC4): a caller-supplied source
    // URL may still embed its own credential, or an injected `gitCloner` could leak one.
    return { version: null, available: false, error: redactGitCredentials(errorMessage(err)) }
  } finally {
    // Best-effort: a temp directory that outlives the check is litter, never a failure,
    // and it can never be mistaken for the install cache (different root).
    try {
      await fs.rm(tempRoot, { recursive: true, force: true })
    } catch {
      // ignore — cleanup must not turn a successful read into an error
    }
  }
}

/**
 * Resolve the "current" KB version for a given source (registry/remote/local/git).
 * Never throws: unexpected errors degrade to `{ available: false, error }`.
 */
export async function resolveCurrentVersion(
  fs: FileSystemService,
  options: CurrentVersionOptions = {},
): Promise<CurrentVersionResult> {
  const request = detectRequest(options.source)
  const sourceKind = request.kind

  try {
    const partial = await resolvePartialCurrentVersion(request, fs, options)
    return { sourceKind, stable: isStableVersion(partial.version), ...partial }
  } catch (err) {
    // Unreachable for a git source today (resolveGitVersion catches everything), which is
    // exactly why it redacts too: a future refactor must not be able to leak a token here.
    return {
      sourceKind,
      version: null,
      available: false,
      stable: false,
      error: redactGitCredentials(errorMessage(err)),
    }
  }
}

interface CurrentVersionOptions {
  source?: string
  httpClient?: HttpClientService
  cliVersion?: string
  gitCloner?: GitCloner
}

async function resolvePartialCurrentVersion(
  request: VersionRequest,
  fs: FileSystemService,
  options: CurrentVersionOptions,
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  switch (request.kind) {
    case 'registry':
      return resolveRegistryVersion(fs, {
        ...(options.httpClient && { httpClient: options.httpClient }),
        ...(options.cliVersion && { cliVersion: options.cliVersion }),
      })
    case 'local':
      return resolveLocalVersion(fs, request.source)
    case 'remote':
      return resolveRemoteVersion(request.source, options.httpClient)
    case 'git':
      return resolveGitVersion(fs, request.source, options.gitCloner ?? cloneGitRepo)
  }
}

/**
 * Resolve the KB version recorded as installed in a project, read from the
 * marker file written by `install`/`update` on success. Returns
 * `{ version: null }` for legacy installs with no recorded metadata.
 */
export function resolveInstalledVersion(
  fs: FileSystemService,
  projectRoot: string,
): InstalledVersionResult {
  const markerPath = join(projectRoot, INSTALLED_VERSION_MARKER)
  if (!fs.existsSync(markerPath)) return { version: null }

  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath)) as {
      version?: unknown
      recordedAt?: unknown
    }
    return {
      version: typeof parsed.version === 'string' ? parsed.version : null,
      ...(typeof parsed.recordedAt === 'string' && { recordedAt: parsed.recordedAt }),
    }
  } catch {
    return { version: null }
  }
}

/**
 * Record the just-installed/updated KB version into the project so future
 * version checks can compare against it. Best-effort: callers should not
 * let a failure here block install/update.
 */
export async function writeInstalledVersion(
  fs: FileSystemService,
  projectRoot: string,
  version: string,
): Promise<void> {
  // Derive from the same constant resolveInstalledVersion reads, so write and
  // read paths cannot drift.
  const markerPath = join(projectRoot, INSTALLED_VERSION_MARKER)
  const markerDir = dirname(markerPath)
  if (!fs.existsSync(markerDir)) {
    await fs.mkdir(markerDir, { recursive: true })
  }
  const content = JSON.stringify({ version, recordedAt: new Date().toISOString() }, null, 2)
  await fs.writeFile(markerPath, content)
}
