import { describe, it, expect, vi } from 'vitest'
import {
  PATTERNS,
  FILE_GLOBS,
  buildGitGrepCommand,
  parseGrepOutput,
  scanPattern,
  runHygieneCheck,
  type HygienePattern,
} from './code-hygiene-check'

// Test fixtures below use synthetic marker names ("marker-one" etc.), not the real
// suppression strings (split in the module under test — @ts- + ignore, etc.) — this
// file is itself scanned by *.ts globs, so it must not contain the literal markers.

describe('buildGitGrepCommand', () => {
  it('builds a git grep invocation with quoted globs and a self-exclude pathspec', () => {
    // Globs are joined with ' -- ' (matches the original script verbatim); git
    // tolerates the repeated separator — verified against a real git grep.
    const cmd = buildGitGrepCommand('marker-one', ['*.ts', '*.tsx'], 'scripts/self.ts')
    expect(cmd).toBe('git grep -n "marker-one" -- "*.ts" -- "*.tsx" \':!scripts/self.ts\'')
  })
})

describe('parseGrepOutput', () => {
  it('parses one match per line into "  file:line" entries', () => {
    const out = 'src/a.ts:10:// marker-one\nsrc/b.ts:22:// marker-one reason\n'
    expect(parseGrepOutput(out)).toEqual(['  src/a.ts:10', '  src/b.ts:22'])
  })

  it('drops empty lines and trims trailing newline noise', () => {
    expect(parseGrepOutput('\n\n')).toEqual([])
  })
})

describe('scanPattern', () => {
  const pattern: HygienePattern = { label: 'marker-one', regex: 'marker-one' }

  it('returns formatted matches from the injected exec function', () => {
    const exec = vi.fn(() => 'src/a.ts:5:// marker-one\n')
    const matches = scanPattern(pattern, FILE_GLOBS, 'self.ts', exec)
    expect(matches).toEqual(['  src/a.ts:5'])
    expect(exec).toHaveBeenCalledWith(buildGitGrepCommand(pattern.regex, FILE_GLOBS, 'self.ts'))
  })

  it('treats a thrown error (git grep exit 1, no matches) as the happy path — empty result', () => {
    const exec = vi.fn(() => {
      throw new Error('exit 1')
    })
    expect(scanPattern(pattern, FILE_GLOBS, 'self.ts', exec)).toEqual([])
  })
})

describe('runHygieneCheck', () => {
  it('aggregates violations across patterns and totals the match count', () => {
    const patterns: HygienePattern[] = [
      { label: 'marker-one', regex: 'marker-one' },
      { label: 'marker-two', regex: 'marker-two' },
      { label: 'marker-three', regex: 'marker-three' },
    ]
    const exec: (cmd: string) => string = cmd => {
      if (cmd.includes('marker-one')) return 'src/a.ts:1:x\nsrc/b.ts:2:x\n'
      if (cmd.includes('marker-two')) return 'src/c.ts:3:x\n'
      throw new Error('exit 1') // marker-three: no matches
    }
    const { violations, total } = runHygieneCheck(patterns, FILE_GLOBS, 'self.ts', exec)
    expect(total).toBe(3)
    expect(violations.get('marker-one')).toEqual(['  src/a.ts:1', '  src/b.ts:2'])
    expect(violations.get('marker-two')).toEqual(['  src/c.ts:3'])
    expect(violations.has('marker-three')).toBe(false)
  })

  it('reports zero total when nothing matches', () => {
    const { violations, total } = runHygieneCheck(PATTERNS, FILE_GLOBS, 'self.ts', () => {
      throw new Error('exit 1')
    })
    expect(total).toBe(0)
    expect(violations.size).toBe(0)
  })
})
