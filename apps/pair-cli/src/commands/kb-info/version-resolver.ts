import { join } from 'path'
import type { FileSystemService, HttpClientService } from '@pair/content-ops'
import { isGitUrl, isRemoteUrl } from '@pair/content-ops'
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

const INSTALLED_VERSION_MARKER = join('.pair', '.kb-version.json')

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** A version is considered "stable" when it's a plain major.minor.patch (no pre-release/build tag). */
export function isStableVersion(version: string | null): boolean {
  return version !== null && /^\d+\.\d+\.\d+$/.test(version)
}

/**
 * Read a version string from a directory: prefers a manifest.json at the
 * directory root (packaged KB layout), falls back to a sibling package.json
 * (monorepo `packages/knowledge-hub/dataset` layout). Returns null when
 * neither is present or neither carries a usable version field.
 */
export function readVersionFromDirectory(fs: FileSystemService, dirPath: string): string | null {
  const manifestPath = join(dirPath, 'manifest.json')
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath)) as { version?: unknown }
      if (typeof manifest.version === 'string') return manifest.version
    } catch {
      // fall through to package.json fallback
    }
  }

  const siblingPkgPath = join(dirPath, '..', 'package.json')
  if (fs.existsSync(siblingPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(siblingPkgPath)) as { version?: unknown }
      if (typeof pkg.version === 'string') return pkg.version
    } catch {
      // fall through to null
    }
  }

  return null
}

function detectSourceKind(source?: string): KbSourceKind {
  if (!source) return 'registry'
  if (isGitUrl(source)) return 'git'
  if (isRemoteUrl(source)) return 'remote'
  return 'local'
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
 * Resolve the "current" KB version for a given source (registry/remote/local/git).
 * Never throws: unexpected errors degrade to `{ available: false, error }`.
 */
export async function resolveCurrentVersion(
  fs: FileSystemService,
  options: { source?: string; httpClient?: HttpClientService; cliVersion?: string } = {},
): Promise<CurrentVersionResult> {
  const sourceKind = detectSourceKind(options.source)

  try {
    const partial = await resolvePartialCurrentVersion(sourceKind, fs, options)
    return { sourceKind, stable: isStableVersion(partial.version), ...partial }
  } catch (err) {
    return { sourceKind, version: null, available: false, stable: false, error: errorMessage(err) }
  }
}

async function resolvePartialCurrentVersion(
  sourceKind: KbSourceKind,
  fs: FileSystemService,
  options: { source?: string; httpClient?: HttpClientService; cliVersion?: string },
): Promise<Omit<CurrentVersionResult, 'sourceKind' | 'stable'>> {
  switch (sourceKind) {
    case 'registry':
      return resolveRegistryVersion(fs, {
        ...(options.httpClient && { httpClient: options.httpClient }),
        ...(options.cliVersion && { cliVersion: options.cliVersion }),
      })
    case 'local':
      return resolveLocalVersion(fs, options.source as string)
    case 'remote':
      return resolveRemoteVersion(options.source as string, options.httpClient)
    case 'git':
      return {
        version: null,
        available: false,
        error: 'Git source version check is not supported yet',
      }
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
  const markerDir = join(projectRoot, '.pair')
  if (!fs.existsSync(markerDir)) {
    await fs.mkdir(markerDir, { recursive: true })
  }
  const markerPath = join(markerDir, '.kb-version.json')
  const content = JSON.stringify({ version, recordedAt: new Date().toISOString() }, null, 2)
  await fs.writeFile(markerPath, content)
}
