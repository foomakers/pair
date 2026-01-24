import { describe, it, expect } from 'vitest'
import { createTestFs } from '../test-utils/test-helpers'
import { ensureDir, calculatePathType } from './fs-utils'

describe('config fs-utils', () => {
  const cwd = '/test'

  it('calculatePathType returns dir for directory', async () => {
    const fs = createTestFs({}, {}, cwd)
    await fs.mkdir('/test/dir')
    expect(await calculatePathType(fs, '/test/dir')).toBe('dir')
  })

  it('ensureDir creates directory with recursive option', async () => {
    const fs = createTestFs({}, {}, cwd)
    await ensureDir(fs, '/test/new/nested/dir')
    expect(await fs.exists('/test/new/nested/dir')).toBe(true)
  })

  it('ensureDir works with existing directory', async () => {
    const fs = createTestFs({}, { '/test/existing/file.txt': 'content' }, cwd)
    await fs.mkdir('/test/existing', { recursive: true })
    await ensureDir(fs, '/test/existing')
    expect(await fs.exists('/test/existing')).toBe(true)
  })
})
