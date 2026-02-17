import { describe, it, expect } from 'vitest'
import { readPreferences, savePreferences } from './preferences'
import type { PreferencesData } from './preferences'
import { InMemoryFileSystemService } from '@pair/content-ops'

const PREFS_DIR = '/test-home/.pair'
const PREFS_PATH = `${PREFS_DIR}/preferences.json`

function makeFs(files: Record<string, string> = {}): InMemoryFileSystemService {
  return new InMemoryFileSystemService(files, '/', '/')
}

describe('readPreferences', () => {
  it('reads valid preferences file', () => {
    const data: PreferencesData = {
      packageMetadata: { name: 'my-kb', license: 'MIT' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const fs = makeFs({ [PREFS_PATH]: JSON.stringify(data) })

    const result = readPreferences(fs, PREFS_DIR)

    expect(result).toEqual(data)
  })

  it('returns null when file does not exist', () => {
    const fs = makeFs()

    const result = readPreferences(fs, PREFS_DIR)

    expect(result).toBeNull()
  })

  it('returns null on invalid JSON', () => {
    const fs = makeFs({ [PREFS_PATH]: 'not json' })

    const result = readPreferences(fs, PREFS_DIR)

    expect(result).toBeNull()
  })

  it('returns null when data has no packageMetadata', () => {
    const fs = makeFs({ [PREFS_PATH]: JSON.stringify({ other: 'data' }) })

    const result = readPreferences(fs, PREFS_DIR)

    expect(result).toBeNull()
  })

  it('uses custom preferences directory', () => {
    const customDir = '/custom/config'
    const customPath = `${customDir}/preferences.json`
    const data: PreferencesData = {
      packageMetadata: { author: 'Custom Author' },
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const fs = makeFs({ [customPath]: JSON.stringify(data) })

    const result = readPreferences(fs, customDir)

    expect(result).toEqual(data)
  })
})

describe('savePreferences', () => {
  it('saves preferences to preferences directory', async () => {
    const fs = makeFs()
    const data: PreferencesData = {
      packageMetadata: { name: 'my-kb' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    await savePreferences(data, fs, PREFS_DIR)

    expect(fs.existsSync(PREFS_PATH)).toBe(true)
    const saved = JSON.parse(fs.readFileSync(PREFS_PATH))
    expect(saved).toEqual(data)
  })

  it('creates preferences directory if missing', async () => {
    const fs = makeFs()

    await savePreferences({ packageMetadata: {}, updatedAt: '' }, fs, PREFS_DIR)

    expect(fs.existsSync(PREFS_PATH)).toBe(true)
  })

  it('uses custom preferences directory', async () => {
    const customDir = '/custom/prefs'
    const customPath = `${customDir}/preferences.json`
    const fs = makeFs()
    const data: PreferencesData = {
      packageMetadata: { name: 'custom' },
      updatedAt: '2026-02-01T00:00:00.000Z',
    }

    await savePreferences(data, fs, customDir)

    expect(fs.existsSync(customPath)).toBe(true)
    const saved = JSON.parse(fs.readFileSync(customPath))
    expect(saved).toEqual(data)
  })

  it('round-trips: save then read returns same data', async () => {
    const fs = makeFs()
    const data: PreferencesData = {
      packageMetadata: { name: 'round-trip', version: '2.0.0', tags: ['ai', 'kb'] },
      updatedAt: '2026-02-17T00:00:00.000Z',
    }

    await savePreferences(data, fs, PREFS_DIR)
    const result = readPreferences(fs, PREFS_DIR)

    expect(result).toEqual(data)
  })
})
