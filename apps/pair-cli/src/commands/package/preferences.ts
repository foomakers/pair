import path from 'path'
import os from 'os'
import { logger } from '@pair/content-ops'
import type { FileSystemService } from '@pair/content-ops'

export interface PreferencesData {
  packageMetadata: Partial<{
    name: string
    version: string
    description: string
    author: string
    tags: string[]
    license: string
  }>
  updatedAt: string
}

function defaultPreferencesDir(): string {
  return path.join(os.homedir(), '.pair')
}

function preferencesPath(dir: string): string {
  return path.join(dir, 'preferences.json')
}

/**
 * Read preferences from <preferencesDir>/preferences.json.
 * Returns null on any error (missing file, corrupt JSON, permission denied).
 */
export function readPreferences(
  fs: FileSystemService,
  preferencesDir: string = defaultPreferencesDir(),
): PreferencesData | null {
  try {
    const filePath = preferencesPath(preferencesDir)
    if (!fs.existsSync(filePath)) return null
    const raw = JSON.parse(fs.readFileSync(filePath))
    if (!raw.packageMetadata || typeof raw.packageMetadata !== 'object') return null
    return raw as PreferencesData
  } catch {
    logger.warn('Could not read preferences file, continuing with other defaults')
    return null
  }
}

/**
 * Save preferences to <preferencesDir>/preferences.json.
 * Non-critical: logs warning on failure, never throws.
 */
export async function savePreferences(
  data: PreferencesData,
  fs: FileSystemService,
  preferencesDir: string = defaultPreferencesDir(),
): Promise<void> {
  try {
    fs.mkdirSync(preferencesDir, { recursive: true })
  } catch {
    logger.warn('Could not create preferences directory, skipping save')
    return
  }

  try {
    await fs.writeFile(preferencesPath(preferencesDir), JSON.stringify(data, null, 2))
  } catch {
    logger.warn('Could not save preferences file')
  }
}
