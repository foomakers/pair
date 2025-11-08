import { describe, it, expect } from 'vitest'
import { detectRepoRoot } from './root-detection'
import { InMemoryFileSystemService } from '../test-utils/in-memory-fs'

describe('detectRepoRoot', () => {
  it('should detect .git at startDir', async () => {
    const fs = new InMemoryFileSystemService({ '/project/.git/config': '' }, '/', '/project')
    const root = await detectRepoRoot('/project', fs)
    expect(root).toBe('/project')
  })

  it('should detect package.json up the tree', async () => {
    const fs = new InMemoryFileSystemService({ '/repo/package.json': '{}' }, '/', '/repo/sub')
    const root = await detectRepoRoot('/repo/sub', fs)
    expect(root).toBe('/repo')
  })

  it('should return null when not found', async () => {
    const fs = new InMemoryFileSystemService({}, '/', '/x/y')
    const root = await detectRepoRoot('/x/y', fs, 3)
    expect(root).toBeNull()
  })
})
