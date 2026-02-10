import { describe, it, expect } from 'vitest'
import { SyncOptions } from './SyncOptions'
import { TargetConfig } from './behavior'

describe('SyncOptions', () => {
  it('supports existing fields without new fields', () => {
    const opts: SyncOptions = {
      defaultBehavior: 'overwrite',
      folderBehavior: { docs: 'add' },
      concurrencyLimit: 5,
    }
    expect(opts.defaultBehavior).toBe('overwrite')
    expect(opts.concurrencyLimit).toBe(5)
  })

  it('supports flatten field with default false', () => {
    const opts: SyncOptions = { flatten: false }
    expect(opts.flatten).toBe(false)
  })

  it('supports flatten set to true', () => {
    const opts: SyncOptions = { flatten: true }
    expect(opts.flatten).toBe(true)
  })

  it('supports prefix field as string', () => {
    const opts: SyncOptions = { prefix: 'pair' }
    expect(opts.prefix).toBe('pair')
  })

  it('supports prefix as undefined (no prefix)', () => {
    const opts: SyncOptions = {}
    expect(opts.prefix).toBeUndefined()
  })

  it('supports targets field as empty array', () => {
    const opts: SyncOptions = { targets: [] }
    expect(opts.targets).toEqual([])
  })

  it('supports targets with TargetConfig entries', () => {
    const targets: TargetConfig[] = [
      { path: '.claude/skills/', mode: 'canonical' },
      { path: '.github/skills/', mode: 'symlink' },
      { path: '.cursor/skills/', mode: 'copy' },
    ]
    const opts: SyncOptions = { targets }
    expect(opts.targets).toHaveLength(3)
    expect(opts.targets![0].mode).toBe('canonical')
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
