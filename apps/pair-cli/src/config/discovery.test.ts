import { describe, expect, it } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import {
  getPackageJsonPath,
  findPackageJsonPath,
  isInRelease,
  findManualPairCliPackage,
  findNpmReleasePackage,
} from './discovery'

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

  it('isInRelease returns true when no dev package.json found', async () => {
    const fs = new InMemoryFileSystemService({}, cwd, cwd)
    expect(isInRelease(fs, cwd)).toBe(true)
  })

  it('isInRelease returns false when dev package.json found', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: '{"name":"kh"}',
      },
      cwd,
      cwd,
    )
    expect(isInRelease(fs, cwd)).toBe(false)
  })

  it('findNpmReleasePackage finds root with bundle-cli', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: '{"name":"@foomakers/pair-cli"}',
        [`${cwd}/bundle-cli/dataset/README.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = findNpmReleasePackage(fs, cwd)
    expect(result).toBe(cwd)
  })

  it('findManualPairCliPackage uses BFS to find manual bundle', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/pair-cli/package.json`]: '{"name":"@pair/pair-cli"}',
        [`${cwd}/pair-cli/bundle-cli/dataset/README.md`]: 'data',
      },
      cwd,
      cwd,
    )

    const result = findManualPairCliPackage(fs, cwd)
    expect(result).toBe(`${cwd}/pair-cli`)
  })
})
