import type { FileSystemService } from '@pair/content-ops'
import type { KbInfoCommandConfig } from './parser'
import type { ManifestMetadata } from '../package/metadata'
import AdmZip from 'adm-zip'
import { formatHumanReadable, formatJSON } from './display-formatter'

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

    let zip: AdmZip
    try {
      zip = new AdmZip(config.packagePath)
    } catch {
      console.error(`Invalid ZIP archive: ${config.packagePath}`)
      return 1
    }

    const manifestEntry = zip.getEntry('manifest.json')
    if (!manifestEntry) {
      console.error(`Missing manifest.json in package`)
      return 1
    }

    const manifestContent = manifestEntry.getData().toString('utf-8')
    let manifest: ManifestMetadata
    try {
      manifest = JSON.parse(manifestContent)
    } catch {
      console.error(`Invalid JSON in manifest.json`)
      return 1
    }

    const output = config.json ? formatJSON(manifest) : formatHumanReadable(manifest)
    console.log(output)

    return 0
  } catch (error) {
    console.error(
      `Error reading package: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
}
