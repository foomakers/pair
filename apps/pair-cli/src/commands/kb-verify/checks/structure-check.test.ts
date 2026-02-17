import { describe, it, expect } from 'vitest'
import { verifyStructure } from './structure-check'
import type { IZipEntry } from 'adm-zip'
import type { ManifestMetadata } from '../../package/metadata'

function mockZipEntry(name: string, isDir = false): IZipEntry {
  return { entryName: name, isDirectory: isDir } as IZipEntry
}

describe('verifyStructure', () => {
  it('returns PASS when all registry paths exist', () => {
    const entries: IZipEntry[] = [
      mockZipEntry('knowledge/', true),
      mockZipEntry('knowledge/file.md'),
      mockZipEntry('adoption/', true),
      mockZipEntry('adoption/doc.md'),
    ]

    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      tags: [],
      license: 'MIT',
      created_at: '2025-01-01',
      registries: ['knowledge', 'adoption'],
    }

    const result = verifyStructure(entries, manifest)

    expect(result.status).toBe('PASS')
    expect(result.missingPaths).toEqual([])
  })

  it('returns FAIL when registry path is missing', () => {
    const entries: IZipEntry[] = [
      mockZipEntry('knowledge/', true),
      mockZipEntry('knowledge/file.md'),
    ]

    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      tags: [],
      license: 'MIT',
      created_at: '2025-01-01',
      registries: ['knowledge', 'adoption'],
    }

    const result = verifyStructure(entries, manifest)

    expect(result.status).toBe('FAIL')
    expect(result.missingPaths).toEqual(['adoption'])
  })

  it('infers directories from file paths', () => {
    const entries: IZipEntry[] = [mockZipEntry('knowledge/subdir/file.md')]

    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      tags: [],
      license: 'MIT',
      created_at: '2025-01-01',
      registries: ['knowledge'],
    }

    const result = verifyStructure(entries, manifest)

    expect(result.status).toBe('PASS')
  })

  it('matches registry paths with subdirectories', () => {
    const entries: IZipEntry[] = [mockZipEntry('.pair/knowledge/', true)]

    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      description: 'Test',
      author: 'Tester',
      tags: [],
      license: 'MIT',
      created_at: '2025-01-01',
      registries: ['knowledge'],
    }

    const result = verifyStructure(entries, manifest)

    expect(result.status).toBe('PASS')
  })
})
