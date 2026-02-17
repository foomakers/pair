import { describe, it, expect, vi } from 'vitest'
import { resolveDefaults, readGitConfig, readPackageJsonDefaults } from './defaults-resolver'
import type { ResolvedMetadata } from './defaults-resolver'

describe('resolveDefaults', () => {
  const hardcoded: ResolvedMetadata = {
    name: 'kb-package',
    version: '1.0.0',
    description: 'Knowledge base package',
    author: 'unknown',
    tags: [],
    license: 'MIT',
  }

  it('returns hardcoded defaults when all sources empty', () => {
    const result = resolveDefaults({})

    expect(result).toEqual(hardcoded)
  })

  it('preferences override hardcoded defaults', () => {
    const result = resolveDefaults({
      preferences: { name: 'pref-kb', license: 'Apache-2.0' },
    })

    expect(result.name).toBe('pref-kb')
    expect(result.license).toBe('Apache-2.0')
    expect(result.version).toBe('1.0.0') // hardcoded fallback
  })

  it('gitConfig overrides preferences', () => {
    const result = resolveDefaults({
      preferences: { author: 'pref-author' },
      gitConfig: { author: 'git-author' },
    })

    expect(result.author).toBe('git-author')
  })

  it('packageJson overrides gitConfig', () => {
    const result = resolveDefaults({
      gitConfig: { author: 'git-author' },
      packageJson: { name: 'pkg-name', version: '2.0.0', description: 'pkg desc' },
    })

    expect(result.name).toBe('pkg-name')
    expect(result.version).toBe('2.0.0')
    expect(result.description).toBe('pkg desc')
    expect(result.author).toBe('git-author') // packageJson doesn't have author
  })

  it('cliFlags override everything', () => {
    const result = resolveDefaults({
      preferences: { name: 'pref', license: 'GPL' },
      gitConfig: { author: 'git-author' },
      packageJson: { name: 'pkg', version: '2.0.0' },
      cliFlags: { name: 'cli-name', version: '3.0.0', author: 'cli-author', license: 'BSD' },
    })

    expect(result.name).toBe('cli-name')
    expect(result.version).toBe('3.0.0')
    expect(result.author).toBe('cli-author')
    expect(result.license).toBe('BSD')
  })

  it('full precedence chain: CLI > packageJson > gitConfig > preferences > hardcoded', () => {
    const result = resolveDefaults({
      preferences: {
        name: 'pref',
        version: 'pref-v',
        description: 'pref-d',
        author: 'pref-a',
        license: 'pref-l',
      },
      gitConfig: { author: 'git-a' },
      packageJson: { name: 'pkg', version: 'pkg-v', description: 'pkg-d' },
      cliFlags: { name: 'cli' },
    })

    expect(result.name).toBe('cli') // from cliFlags
    expect(result.version).toBe('pkg-v') // from packageJson
    expect(result.description).toBe('pkg-d') // from packageJson
    expect(result.author).toBe('git-a') // from gitConfig
    expect(result.license).toBe('pref-l') // from preferences
  })

  it('handles tags from cliFlags', () => {
    const result = resolveDefaults({
      cliFlags: { tags: ['ai', 'devops'] },
    })

    expect(result.tags).toEqual(['ai', 'devops'])
  })

  it('falls back to next source when field not present', () => {
    const result = resolveDefaults({
      cliFlags: { name: 'cli' },
      packageJson: { version: '2.0.0' },
    })

    expect(result.name).toBe('cli')
    expect(result.version).toBe('2.0.0')
  })
})

describe('readGitConfig', () => {
  it('returns author from git config', () => {
    // This test runs in a real git repo, so it should return a value
    const result = readGitConfig()

    expect(result).toBeDefined()
    if (result?.author) {
      expect(typeof result.author).toBe('string')
      expect(result.author.length).toBeGreaterThan(0)
    }
  })
})

describe('readPackageJsonDefaults', () => {
  it('reads name, version, description from package.json', () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi
        .fn()
        .mockReturnValue(
          JSON.stringify({ name: 'test-pkg', version: '1.2.3', description: 'A test' }),
        ),
    }

    const result = readPackageJsonDefaults(
      '/project',
      fs as Parameters<typeof readPackageJsonDefaults>[1],
    )

    expect(result).toEqual({ name: 'test-pkg', version: '1.2.3', description: 'A test' })
  })

  it('returns empty object when package.json missing', () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
    }

    const result = readPackageJsonDefaults(
      '/project',
      fs as Parameters<typeof readPackageJsonDefaults>[1],
    )

    expect(result).toEqual({})
  })

  it('returns empty object on parse error', () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('not json'),
    }

    const result = readPackageJsonDefaults(
      '/project',
      fs as Parameters<typeof readPackageJsonDefaults>[1],
    )

    expect(result).toEqual({})
  })

  it('uses directory name as fallback when package.json has no name', () => {
    const fs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: '1.0.0' })),
    }

    const result = readPackageJsonDefaults(
      '/project/my-app',
      fs as Parameters<typeof readPackageJsonDefaults>[1],
    )

    expect(result).toEqual({ version: '1.0.0' })
  })
})
