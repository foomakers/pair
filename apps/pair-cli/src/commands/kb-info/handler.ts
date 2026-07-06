import type { FileSystemService, HttpClientService } from '@pair/content-ops'
import type { KbInfoCommandConfig } from './parser'
import type { ManifestMetadata } from '../package/metadata'
import { formatHumanReadable, formatJSON } from './display-formatter'
import { formatVersionCheckHuman, formatVersionCheckJSON } from './version-check-formatter'
import { readManifestFromZip } from './manifest-reader'
import { resolveCurrentVersion, resolveInstalledVersion } from './version-resolver'
import { compareVersions } from './version-check'

/** Options accepted by handleKbInfoCommand's version-check mode. */
export interface KbInfoHandlerOptions {
  httpClient?: HttpClientService
  baseTarget?: string
}

async function handlePackageMode(
  config: { packagePath: string; json: boolean },
  fs: FileSystemService,
): Promise<number> {
  if (!fs.existsSync(config.packagePath)) {
    console.error(`File not found: ${config.packagePath}`)
    return 1
  }

  let manifest: ManifestMetadata
  try {
    manifest = readManifestFromZip(config.packagePath)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }

  console.log(config.json ? formatJSON(manifest) : formatHumanReadable(manifest))
  return 0
}

async function handleVersionCheckMode(
  config: { source?: string; json: boolean },
  fs: FileSystemService,
  options: KbInfoHandlerOptions,
): Promise<number> {
  const projectRoot = options.baseTarget || fs.currentWorkingDirectory()

  const installed = resolveInstalledVersion(fs, projectRoot)
  const current = await resolveCurrentVersion(fs, {
    ...(config.source && { source: config.source }),
    ...(options.httpClient && { httpClient: options.httpClient }),
  })

  const result = compareVersions(installed, current)

  console.log(config.json ? formatVersionCheckJSON(result) : formatVersionCheckHuman(result))
  return 0
}

/**
 * Handle kb-info command.
 * - `mode: 'package'` — display metadata read from a KB package ZIP file.
 * - `mode: 'version-check'` — compare installed vs current KB version.
 * @param config - Parsed command configuration
 * @param fs - File system service
 * @param options - httpClient/baseTarget for version-check mode
 * @returns Exit code (0 = success, 1 = error)
 */
export async function handleKbInfoCommand(
  config: KbInfoCommandConfig,
  fs: FileSystemService,
  options: KbInfoHandlerOptions = {},
): Promise<number> {
  try {
    if (config.mode === 'package') {
      return handlePackageMode(config, fs)
    }
    return handleVersionCheckMode(config, fs, options)
  } catch (error) {
    console.error(
      `Error reading package: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}
