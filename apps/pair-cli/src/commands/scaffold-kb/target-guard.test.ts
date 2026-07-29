import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { assertScaffoldTarget } from './target-guard'

const root = '/work/acme-kb'

function newFs(seed: Record<string, string> = {}) {
  return new InMemoryFileSystemService(seed, root, root)
}

describe('assertScaffoldTarget', () => {
  it('allows a fresh, non-existent target', async () => {
    const fs = newFs()

    await expect(assertScaffoldTarget(root, fs)).resolves.toBeUndefined()
  })

  it('allows an existing empty directory', async () => {
    const fs = newFs()
    await fs.mkdir(root, { recursive: true })

    await expect(assertScaffoldTarget(root, fs)).resolves.toBeUndefined()
  })

  it('rejects a target that exists and is not a directory, with a directed message', async () => {
    const target = '/work/afile'
    const fs = newFs({ [target]: 'not a folder' })

    await expect(assertScaffoldTarget(target, fs)).rejects.toThrow(
      /exists and is not a directory/,
    )
  })

  it('rejects a configured pair project — .pair/adoption/ present', async () => {
    const fs = newFs({ [`${root}/.pair/adoption/PRD.md`]: '# PRD\n' })

    await expect(assertScaffoldTarget(root, fs)).rejects.toThrow(
      /configured pair project/,
    )
  })
})
