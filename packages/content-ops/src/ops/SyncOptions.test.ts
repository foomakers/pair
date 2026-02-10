import { describe, it, expect } from 'vitest'
import { SyncOptions, defaultSyncOptions } from './SyncOptions'
import { TargetConfig } from './behavior'

describe('SyncOptions', () => {
  it('supports existing fields with required new fields', () => {
    const opts: SyncOptions = {
      defaultBehavior: 'overwrite',
      folderBehavior: { docs: 'add' },
      concurrencyLimit: 5,
      flatten: false,
      targets: [],
    }
    expect(opts.defaultBehavior).toBe('overwrite')
    expect(opts.concurrencyLimit).toBe(5)
    expect(opts.flatten).toBe(false)
    expect(opts.targets).toEqual([])
  })

  it('supports flatten set to true', () => {
    const opts: SyncOptions = { flatten: true, targets: [] }
    expect(opts.flatten).toBe(true)
  })

  it('supports optional prefix field', () => {
    const opts: SyncOptions = { flatten: false, prefix: 'pair', targets: [] }
    expect(opts.prefix).toBe('pair')
  })

  it('allows omitting prefix (no prefix)', () => {
    const opts: SyncOptions = { flatten: false, targets: [] }
    expect(opts.prefix).toBeUndefined()
  })

  it('supports targets with TargetConfig entries', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
      { path: '.cursor/skills/', mode: 'copy' },
    ]
    const opts: SyncOptions = { flatten: false, targets }
    expect(opts.targets).toHaveLength(3)
    expect(opts.targets[0].mode).toBe('canonical')
  })

  it('supports all fields together', () => {
    const opts: SyncOptions = {
      defaultBehavior: 'mirror',
      folderBehavior: { docs: 'add' },
      concurrencyLimit: 10,
      flatten: true,
      prefix: 'pair',
      targets: [{ path: '.claude/skills/', mode: 'canonical' }],
    }
    expect(opts.flatten).toBe(true)
    expect(opts.prefix).toBe('pair')
    expect(opts.targets).toHaveLength(1)
    expect(opts.defaultBehavior).toBe('mirror')
  })
})

describe('defaultSyncOptions', () => {
  it('returns sensible defaults', () => {
    const opts = defaultSyncOptions()
    expect(opts.flatten).toBe(false)
    expect(opts.prefix).toBeUndefined()
    expect(opts.targets).toEqual([])
  })

  it('can be spread with overrides', () => {
    const opts: SyncOptions = { ...defaultSyncOptions(), flatten: true, prefix: 'pair' }
    expect(opts.flatten).toBe(true)
    expect(opts.prefix).toBe('pair')
    expect(opts.targets).toEqual([])
  })
})
