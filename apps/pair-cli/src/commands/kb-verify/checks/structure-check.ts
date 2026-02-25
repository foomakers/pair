import type { IZipEntry } from 'adm-zip'
import type { ManifestMetadata } from '../../package/metadata'

export interface StructureCheckResult {
  status: 'PASS' | 'FAIL'
  requiredPaths: string[]
  missingPaths: string[]
}

/**
 * Verify registry directories exist in ZIP
 * @param zipEntries - ZIP file entries
 * @param manifest - Parsed manifest
 * @returns Check result
 */
export function verifyStructure(
  zipEntries: IZipEntry[],
  manifest: ManifestMetadata,
): StructureCheckResult {
  const requiredPaths = manifest.registries
  const missingPaths: string[] = []

  // Get all directory entries from ZIP (normalized paths)
  const zipDirs = new Set(
    zipEntries.filter(e => e.isDirectory).map(e => e.entryName.replace(/\/$/, '')), // Remove trailing slash
  )

  // Also consider file paths as implicit directories
  zipEntries
    .filter(e => !e.isDirectory)
    .forEach(e => {
      const parts = e.entryName.split('/')
      for (let i = 1; i < parts.length; i++) {
        zipDirs.add(parts.slice(0, i).join('/'))
      }
    })

  // Convert to array once for iteration
  const zipDirsList = Array.from(zipDirs)

  // Check each required registry path
  for (const registryPath of requiredPaths) {
    // Root registry "." always passes — it means the ZIP root IS the registry
    if (registryPath === '.') continue

    // Check if directory exists in ZIP (exact match or as subdirectory)
    const found = zipDirsList.some(dir => {
      return (
        dir === registryPath ||
        dir.startsWith(`${registryPath}/`) ||
        dir.endsWith(`/${registryPath}`)
      )
    })

    if (!found) {
      missingPaths.push(registryPath)
    }
  }

  return {
    status: missingPaths.length === 0 ? 'PASS' : 'FAIL',
    requiredPaths,
    missingPaths,
  }
}
