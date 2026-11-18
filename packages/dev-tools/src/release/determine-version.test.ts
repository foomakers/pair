import { InMemoryFileSystemService } from '@pair/content-ops'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseArgv, resolveVersion, writeGithubEnv, writeGithubOutput } from './determine-version'

describe('resolveVersion', () => {
  it('picks input-version when all three are set (highest precedence)', () => {
    expect(
      resolveVersion({
        inputVersion: 'v1.0.0',
        releaseTag: 'v2.0.0',
        githubRef: 'refs/tags/v3.0.0',
      }),
    ).toEqual({ version: 'v1.0.0', source: 'input' })
  })

  it('picks release-tag over github-ref when input-version is absent', () => {
    expect(resolveVersion({ releaseTag: 'v2.0.0', githubRef: 'refs/tags/v3.0.0' })).toEqual({
      version: 'v2.0.0',
      source: 'release-tag',
    })
  })

  it('falls back to github-ref tag extraction when input-version and release-tag are absent', () => {
    expect(resolveVersion({ githubRef: 'refs/tags/v3.0.0' })).toEqual({
      version: 'v3.0.0',
      source: 'github-ref',
    })
  })

  it('extracts the tag name without a leading v as-is (no normalization)', () => {
    expect(resolveVersion({ githubRef: 'refs/tags/1.2.3' })).toEqual({
      version: '1.2.3',
      source: 'github-ref',
    })
  })

  it('treats empty-string inputs as unset (falls through), matching bash `-n` checks', () => {
    expect(
      resolveVersion({ inputVersion: '', releaseTag: '', githubRef: 'refs/tags/v4.0.0' }),
    ).toEqual({ version: 'v4.0.0', source: 'github-ref' })
  })

  it('does not match a non-tag github-ref (e.g. a branch ref)', () => {
    expect(() => resolveVersion({ githubRef: 'refs/heads/main' })).toThrow(
      /Could not determine version/,
    )
  })

  it('throws with all three values echoed when none of the three inputs apply', () => {
    expect(() => resolveVersion({})).toThrow(
      "Error: Could not determine version from provided inputs\nINPUT_VERSION: ''\nRELEASE_TAG: ''\nGITHUB_REF: ''",
    )
  })

  it('preserves the bash script edge case where refs/tags/ with nothing after it yields an empty version', () => {
    expect(resolveVersion({ githubRef: 'refs/tags/' })).toEqual({
      version: '',
      source: 'github-ref',
    })
  })

  it('passes an --input-version without a leading v through as-is (no normalization, same as github-ref)', () => {
    expect(resolveVersion({ inputVersion: '1.2.3' })).toEqual({
      version: '1.2.3',
      source: 'input',
    })
  })
})

describe('parseArgv', () => {
  it('parses all five flags', () => {
    expect(
      parseArgv([
        '--input-version',
        'v1.0.0',
        '--release-tag',
        'v2.0.0',
        '--github-ref',
        'refs/tags/v3.0.0',
        '--output-file',
        '/tmp/out',
        '--env-file',
        '/tmp/env',
      ]),
    ).toEqual({
      inputVersion: 'v1.0.0',
      releaseTag: 'v2.0.0',
      githubRef: 'refs/tags/v3.0.0',
      outputFile: '/tmp/out',
      envFile: '/tmp/env',
      help: false,
    })
  })

  it('filters out a literal "--" that survives pnpm/ts-node argv forwarding (PR #330 failure mode)', () => {
    expect(parseArgv(['--', '--input-version', 'v1.0.0', '--'])).toEqual({
      inputVersion: 'v1.0.0',
      help: false,
    })
  })

  it('recognizes -h/--help', () => {
    expect(parseArgv(['--help']).help).toBe(true)
    expect(parseArgv(['-h']).help).toBe(true)
  })

  it('throws on an unknown option', () => {
    expect(() => parseArgv(['--bogus'])).toThrow(/Unknown option: --bogus/)
  })

  it('throws when a recognized flag is trailing with no value, matching bash `set -u` fail-loud behavior', () => {
    expect(() => parseArgv(['--input-version'])).toThrow(
      /Missing value for option: --input-version/,
    )
  })

  it('short-circuits on -h/--help without processing/validating the rest of argv', () => {
    expect(parseArgv(['-h', '--bogus'])).toEqual({ help: true })
    expect(parseArgv(['--help', '--input-version'])).toEqual({ help: true })
  })
})

describe('writeGithubOutput / writeGithubEnv', () => {
  let fs: InMemoryFileSystemService

  beforeEach(() => {
    fs = new InMemoryFileSystemService({}, '/', '/')
  })

  it('appends "version=<value>" to the output file in GITHUB_OUTPUT format', async () => {
    await writeGithubOutput('/output', 'v1.2.3', fs)
    expect(fs.readFileSync('/output')).toBe('version=v1.2.3\n')
  })

  it('appends "VERSION=<value>" to the env file in GITHUB_ENV format', async () => {
    await writeGithubEnv('/env', 'v1.2.3', fs)
    expect(fs.readFileSync('/env')).toBe('VERSION=v1.2.3\n')
  })

  it('appends rather than overwrites pre-existing content (real GITHUB_OUTPUT/ENV files accumulate across steps)', async () => {
    await writeGithubOutput('/output', 'v1.0.0', fs)
    await writeGithubOutput('/output', 'v2.0.0', fs)
    expect(fs.readFileSync('/output')).toBe('version=v1.0.0\nversion=v2.0.0\n')
  })

  describe('platform-injected line endings (darwin, linux, win32)', () => {
    const real = process.platform
    afterEach(() => Object.defineProperty(process, 'platform', { value: real }))

    it.each(['darwin', 'linux', 'win32'] as const)(
      'writes LF-terminated lines when platform is %s (GITHUB_OUTPUT is LF on every runner)',
      async platform => {
        Object.defineProperty(process, 'platform', { value: platform })
        await writeGithubOutput('/output', 'v1.2.3', fs)
        expect(fs.readFileSync('/output')).toBe('version=v1.2.3\n')
      },
    )
  })
})
