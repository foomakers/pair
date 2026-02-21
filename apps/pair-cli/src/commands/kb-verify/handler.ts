import type { FileSystemService } from '@pair/content-ops'
import type { KbVerifyCommandConfig } from './parser'
import AdmZip from 'adm-zip'
import { verifyChecksum } from './checks/checksum-check'
import { verifyStructure } from './checks/structure-check'
import { verifyManifest } from './checks/manifest-check'
import { formatHumanReadable, formatJSON, type VerificationReport } from './report-formatter'
import type { ManifestMetadata } from '../package/metadata'

interface ValidatedPackage {
  manifest: ManifestMetadata
  zipEntries: AdmZip.IZipEntry[]
}

function validateAndExtractManifest(
  packagePath: string,
  fs: FileSystemService,
): ValidatedPackage | null {
  if (!fs.existsSync(packagePath)) {
    console.error(`File not found: ${packagePath}`)
    return null
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(packagePath)
  } catch {
    console.error(`Invalid ZIP archive: ${packagePath}`)
    return null
  }

  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) {
    console.error(`Missing manifest.json in package`)
    return null
  }

  let manifest: ManifestMetadata
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8'))
  } catch {
    console.error(`Invalid JSON in manifest.json`)
    return null
  }

  return { manifest, zipEntries: zip.getEntries() }
}

/**
 * Handle kb-verify command
 * @param config - Parsed command configuration
 * @param fs - File system service
 * @returns Exit code (0 = pass, 1 = fail)
 */
export async function handleKbVerifyCommand(
  config: KbVerifyCommandConfig,
  fs: FileSystemService,
): Promise<number> {
  try {
    const extracted = validateAndExtractManifest(config.packagePath, fs)
    if (!extracted) return 1

    const { manifest, zipEntries } = extracted

    const manifestCheck = verifyManifest(manifest)
    const structureCheck = verifyStructure(zipEntries, manifest)

    if (!manifest.contentChecksum) {
      console.error(`Missing contentChecksum in manifest.json`)
      return 1
    }
    const checksumCheck = verifyChecksum(zipEntries, manifest.contentChecksum)

    const report: VerificationReport = {
      package: config.packagePath,
      timestamp: new Date().toISOString(),
      checks: {
        checksum: checksumCheck,
        structure: structureCheck,
        manifest: manifestCheck,
      },
      overall:
        checksumCheck.status === 'PASS' &&
        structureCheck.status === 'PASS' &&
        manifestCheck.status === 'PASS'
          ? 'PASS'
          : 'FAIL',
    }

    const output = config.json ? formatJSON(report) : formatHumanReadable(report)
    console.log(output)

    return report.overall === 'PASS' ? 0 : 1
  } catch (error) {
    console.error(`Verification error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
