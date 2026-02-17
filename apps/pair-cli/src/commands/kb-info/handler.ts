import type { FileSystemService } from '@pair/content-ops'
import type { KbInfoCommandConfig } from './parser'
import type { ManifestMetadata } from '../package/metadata'
import AdmZip from 'adm-zip'
import { formatHumanReadable, formatJSON } from './display-formatter'
import { verifyManifest } from '../kb-verify/checks/manifest-check'

function readManifest(packagePath: string): ManifestMetadata {
  const zip = new AdmZip(packagePath)
  const entry = zip.getEntry('manifest.json')
  if (!entry) throw new Error('Missing manifest.json in package')

  let parsed: unknown
  try {
    parsed = JSON.parse(entry.getData().toString('utf-8'))
  } catch {
    throw new Error('Invalid JSON in manifest.json')
  }

  const check = verifyManifest(parsed)
  if (check.status === 'FAIL') throw new Error(`Invalid manifest: ${check.errors.join(', ')}`)

  return parsed as ManifestMetadata
}

/**
 * Handle kb-info command
 * @param config - Parsed command configuration
 * @param fs - File system service
 * @returns Exit code (0 = success, 1 = error)
 */
export async function handleKbInfoCommand(
  config: KbInfoCommandConfig,
  fs: FileSystemService,
): Promise<number> {
  try {
    if (!fs.existsSync(config.packagePath)) {
      console.error(`File not found: ${config.packagePath}`)
      return 1
    }

    let manifest: ManifestMetadata
    try {
      manifest = readManifest(config.packagePath)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      return 1
    }

    console.log(config.json ? formatJSON(manifest) : formatHumanReadable(manifest))
    return 0
  } catch (error) {
    console.error(
      `Error reading package: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}
