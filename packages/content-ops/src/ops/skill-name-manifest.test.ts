import { describe, it, expect } from 'vitest'
import {
  readSkillNameManifest,
  writeSkillNameManifest,
  buildTransitionMap,
  findOrphanedInstalledNames,
  mergeSkillNameMaps,
} from './skill-name-manifest'
import { InMemoryFileSystemService } from '../test-utils'

describe('readSkillNameManifest', () => {
  it('returns an empty map when the manifest does not exist', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const result = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')
    expect(result.size).toBe(0)
  })

  it('returns an empty map when the manifest is malformed JSON', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/.pair/.skill-name-map.json': '{not json' },
      '/',
      '/',
    )
    const result = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')
    expect(result.size).toBe(0)
  })

  it('returns an empty map when the manifest has no skills field', async () => {
    const fs = new InMemoryFileSystemService(
      { '/project/.pair/.skill-name-map.json': JSON.stringify({ version: 1 }) },
      '/',
      '/',
    )
    const result = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')
    expect(result.size).toBe(0)
  })

  it('reads a previously written manifest into a SkillNameMap', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/.pair/.skill-name-map.json': JSON.stringify({
          version: 1,
          skills: { next: 'pair-next', 'verify-quality': 'pair-capability-verify-quality' },
        }),
      },
      '/',
      '/',
    )
    const result = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')
    expect(result.get('next')).toBe('pair-next')
    expect(result.get('verify-quality')).toBe('pair-capability-verify-quality')
  })
})

describe('writeSkillNameManifest', () => {
  it('writes a manifest that can be read back identically', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const map = new Map([
      ['next', 'pair-next'],
      ['implement', 'pair-process-implement'],
    ])

    await writeSkillNameManifest(fs, '/project/.pair/.skill-name-map.json', map)
    const roundTripped = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')

    expect(roundTripped).toEqual(map)
  })

  it('overwrites a previous manifest', async () => {
    const fs = new InMemoryFileSystemService(
      {
        '/project/.pair/.skill-name-map.json': JSON.stringify({
          version: 1,
          skills: { next: 'pair-next' },
        }),
      },
      '/',
      '/',
    )

    await writeSkillNameManifest(
      fs,
      '/project/.pair/.skill-name-map.json',
      new Map([['next', 'foo-next']]),
    )
    const result = await readSkillNameManifest(fs, '/project/.pair/.skill-name-map.json')
    expect(result.get('next')).toBe('foo-next')
  })

  it('is idempotent: writing the same map twice produces byte-identical output', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/')
    const map = new Map([['next', 'pair-next']])

    await writeSkillNameManifest(fs, '/project/.pair/.skill-name-map.json', map)
    const first = await fs.readFile('/project/.pair/.skill-name-map.json')

    await writeSkillNameManifest(fs, '/project/.pair/.skill-name-map.json', map)
    const second = await fs.readFile('/project/.pair/.skill-name-map.json')

    expect(second).toBe(first)
  })
})

describe('buildTransitionMap', () => {
  it('maps old installed name to new installed name after a prefix change', () => {
    const previous = new Map([['next', 'pair-next']])
    const current = new Map([['next', 'foo-next']])
    const transitions = buildTransitionMap(previous, current)
    expect(transitions.get('pair-next')).toBe('foo-next')
  })

  it('omits entries whose installed name did not change', () => {
    const previous = new Map([['next', 'pair-next']])
    const current = new Map([['next', 'pair-next']])
    const transitions = buildTransitionMap(previous, current)
    expect(transitions.size).toBe(0)
  })

  it('omits entries only present in previous (removed skill)', () => {
    const previous = new Map([
      ['next', 'pair-next'],
      ['removed', 'pair-removed'],
    ])
    const current = new Map([['next', 'pair-next']])
    const transitions = buildTransitionMap(previous, current)
    expect(transitions.size).toBe(0)
  })

  it('omits entries only present in current (new skill)', () => {
    const previous = new Map([['next', 'pair-next']])
    const current = new Map([
      ['next', 'pair-next'],
      ['added', 'pair-added'],
    ])
    const transitions = buildTransitionMap(previous, current)
    expect(transitions.size).toBe(0)
  })

  it('handles multiple simultaneous renames', () => {
    const previous = new Map([
      ['next', 'pair-next'],
      ['implement', 'pair-process-implement'],
    ])
    const current = new Map([
      ['next', 'foo-next'],
      ['implement', 'foo-process-implement'],
    ])
    const transitions = buildTransitionMap(previous, current)
    expect(transitions.get('pair-next')).toBe('foo-next')
    expect(transitions.get('pair-process-implement')).toBe('foo-process-implement')
  })
})

describe('findOrphanedInstalledNames', () => {
  it('returns installed names for skills removed from the current registry', () => {
    const previous = new Map([
      ['next', 'pair-next'],
      ['removed', 'pair-removed'],
    ])
    const current = new Map([['next', 'pair-next']])
    expect(findOrphanedInstalledNames(previous, current)).toEqual(['pair-removed'])
  })

  it('returns empty array when nothing was removed', () => {
    const previous = new Map([['next', 'pair-next']])
    const current = new Map([['next', 'pair-next']])
    expect(findOrphanedInstalledNames(previous, current)).toEqual([])
  })

  it('returns empty array for a fresh install (no previous manifest)', () => {
    const previous = new Map()
    const current = new Map([['next', 'pair-next']])
    expect(findOrphanedInstalledNames(previous, current)).toEqual([])
  })
})

describe('mergeSkillNameMaps', () => {
  it('merges disjoint maps', () => {
    const a = new Map([['next', 'pair-next']])
    const b = new Map([['pair-implement', 'foo-implement']])
    const merged = mergeSkillNameMaps(a, b)
    expect(merged.get('next')).toBe('pair-next')
    expect(merged.get('pair-implement')).toBe('foo-implement')
  })

  it('later maps win on key collision', () => {
    const a = new Map([['next', 'pair-next']])
    const b = new Map([['next', 'foo-next']])
    const merged = mergeSkillNameMaps(a, b)
    expect(merged.get('next')).toBe('foo-next')
  })

  it('returns an empty map when called with no arguments', () => {
    expect(mergeSkillNameMaps().size).toBe(0)
  })
})
