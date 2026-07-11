import type { ManifestMetadata } from '../package/metadata'
import AdmZip from 'adm-zip'
import { verifyManifest } from '../kb-verify/checks/manifest-check'

/**
 * Read and validate manifest.json from a KB package ZIP file.
 * Shared by kb-info's package-display mode and the version resolver's
 * local-zip source handling.
 */
export function readManifestFromZip(packagePath: string): ManifestMetadata {
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
