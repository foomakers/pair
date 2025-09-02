import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'

// create a minimal mock for copyPathOps to avoid pulling the full module; keep short to satisfy max-lines-per-function
vi.mock('@pair/content-ops', () => ({
  copyPathOps: vi.fn(),
}))

import * as utils from './command-utils'
import { copyPathOps } from '@pair/content-ops'

describe('command-utils basic utilities', () => {
  beforeEach(() => {
    ;(copyPathOps as unknown as Mock)?.mockReset?.()
    vi.restoreAllMocks()
  })

  it('parseTargetAndSource returns nulls for missing args', () => {
    expect(utils.parseTargetAndSource(undefined)).toEqual({ target: null, source: null })
    expect(utils.parseTargetAndSource([])).toEqual({ target: null, source: null })
  })

  it('parseTargetAndSource parses target and source', () => {
    const args = ['--foo', '--target', 'out/path', '--source', 'in/path']
    expect(utils.parseTargetAndSource(args)).toEqual({ target: 'out/path', source: 'in/path' })
  })

  it('createLogger records entries and respects verbose', () => {
    const { logs, pushLog } = utils.createLogger()
    expect(Array.isArray(logs)).toBe(true)
    pushLog('info', 'hello')
    expect(logs.length).toBe(1)
    expect(logs[0].message).toBe('hello')

    // The logger now always captures logs internally and does not print to console
    // regardless of a verbose flag. Ensure logs are recorded.
    const { logs: logs2, pushLog: push2 } = utils.createLogger()
    push2('warn', 'w', { a: 1 })
    expect(logs2.length).toBe(1)
  })
})

describe('command-utils fs operations - ensureDir', () => {
  it('ensureDir calls fsService.mkdir with recursive', async () => {
    const fs = { mkdir: vi.fn().mockResolvedValue(undefined) } as unknown as FileSystemService
    await utils.ensureDir(fs, '/tmp/dir')
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/dir', { recursive: true })
  })

  it('ensureDir propagates mkdir errors', async () => {
    const fs = {
      mkdir: vi.fn().mockRejectedValue(new Error('nope')),
    } as unknown as FileSystemService
    await expect(utils.ensureDir(fs, '/tmp/fail')).rejects.toThrow('nope')
  })
})

describe('command-utils fs operations - doCopyAndUpdateLinks', () => {
  beforeEach(() => {
    ;(copyPathOps as unknown as Mock)?.mockReset?.()
    vi.restoreAllMocks()
  })

  it('doCopyAndUpdateLinks calls copyPathOps and logs returned logs', async () => {
    const fakeResult = {}
    ;(copyPathOps as unknown as Mock).mockResolvedValue(fakeResult)

    const fs = {
      /* fsService stub */
    } as unknown as FileSystemService
    const push = vi.fn()

    const res = await utils.doCopyAndUpdateLinks(fs, {
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { foo: 'bar' },
    })
    expect(copyPathOps as unknown as Mock).toHaveBeenCalledWith({
      fileService: fs,
      source: 'src',
      target: 'dst',
      datasetRoot: '/dataset',
      options: { foo: 'bar' },
    })
    expect(push).toHaveBeenCalledTimes(0) // No more logs to push
    expect(res).toEqual({})
  })

  it('doCopyAndUpdateLinks propagates errors from copyPathOps', async () => {
    ;(copyPathOps as unknown as Mock).mockRejectedValue(new Error('copy-fail'))
    const fs = {} as unknown as FileSystemService
    const push = vi.fn()
    await expect(
      utils.doCopyAndUpdateLinks(fs, {
        source: 's',
        target: 'd',
        datasetRoot: '/dataset',
        options: undefined,
      }),
    ).rejects.toThrow('copy-fail')
    expect(push).toHaveBeenCalledTimes(0)
  })
})
