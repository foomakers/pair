import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isExternalLine,
  rewriteLine,
  rewriteContent,
  shouldExclude,
  walkDocFiles,
  findFilesWithVersion,
  syncVersionInDocs,
  parseArgv,
  parseGitignoreExcludes,
  readGitignoreExcludes,
} from './sync-version-in-docs'

describe('isExternalLine', () => {
  it('flags a GitHub Actions "uses:" pin', () => {
    expect(isExternalLine('      uses: actions/checkout@v0.4.3')).toBe(true)
  })

  it('flags an npm install with a pinned version', () => {
    expect(isExternalLine('npm install some-pkg@0.4.3')).toBe(true)
  })

  it('flags a pnpm add with a pinned version', () => {
    expect(isExternalLine('pnpm add some-pkg@0.4.3')).toBe(true)
  })

  it('does not flag an ordinary prose line', () => {
    expect(isExternalLine('pair v0.4.3 is the current release.')).toBe(false)
  })
})

describe('rewriteLine', () => {
  it('replaces the version when present and not an external-version line', () => {
    expect(rewriteLine('pair v0.4.3 released.', '0.4.3', '0.5.0')).toBe('pair v0.5.0 released.')
  })

  it('leaves the line untouched when the version is absent', () => {
    expect(rewriteLine('no version here', '0.4.3', '0.5.0')).toBe('no version here')
  })

  it('leaves an external-version line untouched even if it contains our version substring', () => {
    const line = 'uses: some/action@0.4.3'
    expect(rewriteLine(line, '0.4.3', '0.5.0')).toBe(line)
  })
})

describe('rewriteContent', () => {
  it('rewrites every eligible line and reports changed=true', () => {
    const content = 'pair v0.4.3\nsome prose\nuses: some/action@0.4.3\n'
    const { updated, changed } = rewriteContent(content, '0.4.3', '0.5.0')
    expect(changed).toBe(true)
    expect(updated).toBe('pair v0.5.0\nsome prose\nuses: some/action@0.4.3\n')
  })

  it('reports changed=false when nothing needed rewriting', () => {
    const content = 'uses: some/action@0.4.3\n'
    const { changed } = rewriteContent(content, '0.4.3', '0.5.0')
    expect(changed).toBe(false)
  })
})

describe('shouldExclude', () => {
  it('matches a substring anywhere in the relative path', () => {
    expect(shouldExclude('packages/foo/node_modules/bar.md', ['node_modules'])).toBe(true)
    expect(shouldExclude('docs/CHANGELOG.md', ['CHANGELOG.md'])).toBe(true)
    expect(shouldExclude('docs/guide.md', ['CHANGELOG.md'])).toBe(false)
  })
})

describe('parseGitignoreExcludes', () => {
  it('extracts simple top-level entries, stripping trailing slashes', () => {
    const content = ['node_modules/', 'dist/', 'TODO.md', ''].join('\n')
    expect(parseGitignoreExcludes(content)).toEqual(['node_modules', 'dist', 'TODO.md'])
  })

  it('ignores comments, blank lines, and negation patterns', () => {
    const content = ['# comment', '', 'release/', '!scripts/workflows/release'].join('\n')
    expect(parseGitignoreExcludes(content)).toEqual(['release'])
  })

  it('ignores multi-segment paths and wildcard globs (not meaningful for segment-level excludes)', () => {
    const content = ['*.log', 'apps/website/scripts/landing-video/*.cast', 'coverage/'].join('\n')
    expect(parseGitignoreExcludes(content)).toEqual(['coverage'])
  })
})

describe('readGitignoreExcludes', () => {
  const root = mkdtempSync(join(tmpdir(), 'gitignore-read-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('returns [] when no .gitignore exists at root', () => {
    expect(readGitignoreExcludes(root)).toEqual([])
  })

  it('reads and parses a real .gitignore at root', () => {
    writeFileSync(join(root, '.gitignore'), 'release/\ncoverage/\n')
    expect(readGitignoreExcludes(root)).toEqual(['release', 'coverage'])
  })
})

describe('walkDocFiles / findFilesWithVersion (fixture tree)', () => {
  const root = mkdtempSync(join(tmpdir(), 'sync-version-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const write = (rel: string, content: string) => {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }

  write('docs/guide.md', 'pair v0.4.3 install guide')
  write('docs/other.md', 'no version mentioned here')
  write('docs/action.mdx', 'uses: some/action@0.4.3')
  write('CHANGELOG.md', 'pair v0.4.3 changelog entry — must be excluded')
  write('node_modules/dep/readme.md', 'pair v0.4.3 vendored, must be excluded')
  write('notes.txt', 'pair v0.4.3 — not a doc file, must be skipped')

  it('walkDocFiles collects only .md/.mdx outside excluded paths', () => {
    const files = walkDocFiles(root, root, ['node_modules', 'CHANGELOG.md'])
    const rels = files.map(f => f.replace(root + '/', '')).sort()
    expect(rels).toEqual(['docs/action.mdx', 'docs/guide.md', 'docs/other.md'])
  })

  it('findFilesWithVersion further filters to files whose content contains oldVersion', () => {
    const files = findFilesWithVersion(root, '0.4.3', ['node_modules', 'CHANGELOG.md'])
    const rels = files.map(f => f.replace(root + '/', '')).sort()
    expect(rels).toEqual(['docs/action.mdx', 'docs/guide.md'])
  })
})

describe('syncVersionInDocs', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'sync-version-run-'))
    const write = (rel: string, content: string) => {
      const abs = join(root, rel)
      mkdirSync(join(abs, '..'), { recursive: true })
      writeFileSync(abs, content)
    }
    write('docs/guide.md', 'pair v0.4.3 install guide')
    write('docs/action.mdx', 'uses: some/action@0.4.3')
    write('CHANGELOG.md', 'pair v0.4.3 changelog entry')
    return { root, write }
  }

  it('check mode: reports drift without writing files', () => {
    const { root } = setup()
    const before = readFile(join(root, 'docs/guide.md'))
    const result = syncVersionInDocs(root, '0.4.3', '0.5.0', { check: true })
    expect(result.drifted).toEqual(['docs/guide.md'])
    expect(result.unchanged).toEqual(['docs/action.mdx'])
    expect(result.fixed).toEqual([])
    expect(readFile(join(root, 'docs/guide.md'))).toBe(before) // unchanged on disk
  })

  it('apply mode: rewrites drifted files in place', () => {
    const { root } = setup()
    const result = syncVersionInDocs(root, '0.4.3', '0.5.0', { check: false })
    expect(result.fixed).toEqual(['docs/guide.md'])
    expect(result.drifted).toEqual([])
    expect(readFile(join(root, 'docs/guide.md'))).toBe('pair v0.5.0 install guide')
    // external-version line is never rewritten
    expect(readFile(join(root, 'docs/action.mdx'))).toBe('uses: some/action@0.4.3')
  })

  it('excludes CHANGELOG.md from the scan entirely', () => {
    const { root } = setup()
    const result = syncVersionInDocs(root, '0.4.3', '0.5.0', { check: true })
    expect(result.scanned).not.toContain('CHANGELOG.md')
  })

  // Regression: the pure-JS walker replaced an `rg`-based scan that implicitly
  // respected .gitignore. A gitignored top-level dir (e.g. `release/`, a real
  // build-artifact dir in this repo's own .gitignore) can hold real .md files on
  // disk locally; those must never surface as DRIFT/FIXED.
  it('skips a gitignored top-level dir holding a stale-version .md file', () => {
    const { root, write } = setup()
    write('.gitignore', 'release/\n')
    write('release/pair-cli-manual-0.4.3/README.md', 'pair v0.4.3 packaged build')

    const result = syncVersionInDocs(root, '0.4.3', '0.5.0', { check: true })

    expect(result.scanned.some(f => f.startsWith('release/'))).toBe(false)
    expect(readFile(join(root, 'release/pair-cli-manual-0.4.3/README.md'))).toContain('0.4.3')
  })
})

function readFile(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('parseArgv', () => {
  it('extracts --check and the positional old-version arg', () => {
    expect(parseArgv(['0.4.3', '--check'])).toEqual({ check: true, oldVersionArg: '0.4.3' })
  })

  it('defaults check to false and oldVersionArg to undefined with no args', () => {
    expect(parseArgv([])).toEqual({ check: false, oldVersionArg: undefined })
  })

  // Regression: `pnpm ... sync-version -- 0.4.3` can leave a literal '--' in argv
  // (pnpm/ts-node do not always strip the separator) — if not filtered, '--' would
  // be read as the old-version arg and match nearly every doc (e.g. markdown '---').
  it('filters out a stray literal "--" left over from pnpm/ts-node arg forwarding', () => {
    expect(parseArgv(['--', '0.4.3'])).toEqual({ check: false, oldVersionArg: '0.4.3' })
    expect(parseArgv(['--', '--check'])).toEqual({ check: true, oldVersionArg: undefined })
  })
})
