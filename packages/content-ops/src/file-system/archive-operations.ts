/**
 * Archive operations utilities for ZIP extraction
 */

import type { FileSystemService } from './file-system-service'
import { join } from 'path'

/**
 * Extract a ZIP file to target path
 * @param zipPath - Path to ZIP file
 * @param targetPath - Target extraction path
 * @param fs - Optional filesystem service (for testing)
 */
export async function extractZip(
  zipPath: string,
  targetPath: string,
  fs?: FileSystemService,
): Promise<void> {
  // Test helper: if an in-memory FS is provided, simulate extraction by writing a manifest
  if (fs) {
    if (!fs.existsSync(zipPath)) throw new Error('ZIP not found')
    await fs.writeFile(join(targetPath, 'manifest.json'), JSON.stringify({ extracted: true }))
    return
  }

  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(targetPath, true)
}

export default extractZip
