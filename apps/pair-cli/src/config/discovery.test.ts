import { describe, expect, it } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { getPackageJsonPath, findPackageJsonPath } from './discovery'

describe('registry discovery', () => {
  const cwd = '/project'

  it('getPackageJsonPath finds package.json in monorepo layout', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{"name":"kh"}',
      },
      cwd,
      cwd,
    )

    const result = getPackageJsonPath(fs, cwd)
    expect(result).toBe(`${cwd}/packages/knowledge-hub/package.json`)
  })

  it('getPackageJsonPath finds package.json in node_modules layout', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/node_modules/@pair/knowledge-hub/package.json`]: '{"name":"kh"}',
      },
      cwd,
      cwd,
    )

    const result = getPackageJsonPath(fs, cwd)
    expect(result).toBe(`${cwd}/node_modules/@pair/knowledge-hub/package.json`)
  })

  it('findPackageJsonPath throws if not found', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    expect(() => findPackageJsonPath(fs, cwd)).toThrow(/Unable to find/)
  })

  it('getPackageJsonPath returns null when no dev package.json found', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    expect(getPackageJsonPath(fs, cwd)).toBeNull()
  })

  it('getPackageJsonPath returns non-null when dev package.json found', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{"name":"kh"}',
      },
      cwd,
      cwd,
    )
    expect(getPackageJsonPath(fs, cwd)).not.toBeNull()
  })
})
