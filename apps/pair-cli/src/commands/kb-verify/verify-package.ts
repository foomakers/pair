import AdmZip from 'adm-zip'
import type { FileSystemService } from '@pair/content-ops'
import { verifyChecksum } from './checks/checksum-check'
import { verifyStructure } from './checks/structure-check'
import { verifyManifest } from './checks/manifest-check'
import type { ManifestMetadata } from '../package/metadata'

export interface VerifyPackageResult {
  valid: boolean
  errors: string[]
}

function loadZipArchive(
  packagePath: string,
  fs: FileSystemService,
): { zip?: AdmZip; error?: string } {
  if (!fs.existsSync(packagePath)) {
    return { error: `File not found: ${packagePath}` }
  }

  try {
    return { zip: new AdmZip(packagePath) }
  } catch {
    return { error: `Invalid ZIP archive: ${packagePath}` }
  }
}

function extractManifest(zip: AdmZip): { manifest?: ManifestMetadata; error?: string } {
  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) {
    return { error: 'Missing manifest.json in package' }
  }

  try {
    const content = manifestEntry.getData().toString('utf-8')
    const manifest = JSON.parse(content) as ManifestMetadata
    if (!manifest.contentChecksum) {
      return { error: 'Missing contentChecksum in manifest.json' }
    }
    return { manifest }
  } catch {
    return { error: 'Invalid JSON in manifest.json' }
  }
}

function runVerificationChecks(zip: AdmZip, manifest: ManifestMetadata): string[] {
  const errors: string[] = []
  const zipEntries = zip.getEntries()

  const manifestCheck = verifyManifest(manifest)
  if (manifestCheck.status === 'FAIL') {
    errors.push(...manifestCheck.errors)
  }

  const structureCheck = verifyStructure(zipEntries, manifest)
  if (structureCheck.status === 'FAIL') {
    errors.push(`Missing registry paths: ${structureCheck.missingPaths.join(', ')}`)
  }

  const checksumCheck = verifyChecksum(zipEntries, manifest.contentChecksum!)
  if (checksumCheck.status === 'FAIL') {
    errors.push(
      `Checksum mismatch: expected ${checksumCheck.expected}, got ${checksumCheck.actual}`,
    )
  }

  return errors
}

/**
 * Verify package integrity (shared by kb-verify command and install flow)
 */
export async function verifyPackage(
  packagePath: string,
  fs: FileSystemService,
): Promise<VerifyPackageResult> {
  const { zip, error: zipError } = loadZipArchive(packagePath, fs)
  if (zipError) {
    return { valid: false, errors: [zipError] }
  }

  const { manifest, error: manifestError } = extractManifest(zip!)
  if (manifestError) {
    return { valid: false, errors: [manifestError] }
  }

  const errors = runVerificationChecks(zip!, manifest!)
  return { valid: errors.length === 0, errors }
}
