import type { FileSystemService } from '@pair/content-ops'
import type { KbVerifyCommandConfig } from './parser'
import AdmZip from 'adm-zip'
import { verifyChecksum } from './checks/checksum-check'
import { verifyStructure } from './checks/structure-check'
import { verifyManifest } from './checks/manifest-check'
import { formatHumanReadable, formatJSON, type VerificationReport } from './report-formatter'
import type { ManifestMetadata } from '../package/metadata'

/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
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
    // Validate file exists
    if (!fs.existsSync(config.packagePath)) {
      console.error(`File not found: ${config.packagePath}`)
      return 1
    }

    // Validate is ZIP archive
    let zip: AdmZip
    try {
      zip = new AdmZip(config.packagePath)
    } catch {
      console.error(`Invalid ZIP archive: ${config.packagePath}`)
      return 1
    }

    // Extract manifest
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

    // Run checks
    const zipEntries = zip.getEntries()

    // 1. Manifest check
    const manifestCheck = verifyManifest(manifest)

    // 2. Structure check
    const structureCheck = verifyStructure(zipEntries, manifest)

    // 3. Checksum check (only if contentChecksum exists)
    const checksumCheck = manifest.contentChecksum
      ? verifyChecksum(zipEntries, manifest.contentChecksum)
      : {
          status: 'FAIL' as const,
          expected: '',
          actual: '',
          algorithm: 'SHA-256',
        }

    if (!manifest.contentChecksum) {
      console.error(`Missing contentChecksum in manifest.json`)
      return 1
    }

    // Build report
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

    // Output report
    const output = config.json ? formatJSON(report) : formatHumanReadable(report)
    console.log(output)

    return report.overall === 'PASS' ? 0 : 1
  } catch (error) {
    console.error(`Verification error: ${error instanceof Error ? error.message : String(error)}`)
    return 1
  }
}
