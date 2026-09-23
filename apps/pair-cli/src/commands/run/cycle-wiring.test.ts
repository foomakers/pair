import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseCardRecord, deriveBranch, resolveBranch } from './cycle-wiring'

/**
 * The pure halves of the production wiring — the tracker call itself is the operator's own `gh`
 * and is not re-tested here; what IS testable without a network is the grammar this code reads out
 * of a card body and the branch name it derives from a title.
 */

const body = (status: string, breakdown: boolean) =>
  `## Story Statement\n\nsomething\n\n## Epic Context\n\n**Parent Epic**: #1\n**Status**: ${status}\n${
    breakdown ? '\n## Task Breakdown\n\n- [ ] T-1: do it\n' : ''
  }`

describe('parseCardRecord', () => {
  it('reads the status the card template declares, and whether a breakdown is present', () => {
    expect(parseCardRecord('t', body('Refined', true))).toEqual({
      status: 'Refined',
      hasTaskBreakdown: true,
      title: 't',
    })
    expect(parseCardRecord('t', body('Refined', false)).hasTaskBreakdown).toBe(false)
    expect(parseCardRecord('t', body('Draft', false)).status).toBe('Draft')
  })

  it('REFUSES a body with no `**Status**:` line rather than guessing a macrostate', () => {
    // Guessing here would be the worst failure mode available: a Draft card silently treated as
    // Ready enters `prepare`, which then cannot produce an acceptance contract.
    expect(() => parseCardRecord('t', '## Story Statement\n\nno status anywhere')).toThrow(
      /card-status-unreadable/,
    )
  })

  it('does not mistake a `## Task Breakdown` mention inside prose for the section itself', () => {
    const prose = body('Refined', false) + '\nthe ## Task Breakdown comes later\n'
    expect(parseCardRecord('t', prose).hasTaskBreakdown).toBe(false)
  })
})

describe('deriveBranch', () => {
  it('follows the documented `<type>/<story-id>-<brief-description>` standard', () => {
    expect(
      deriveBranch('135', 'Cross-platform testing for KB source resolution (Linux/macOS)'),
    ).toBe('feature/US-135-cross-platform-testing-for-kb-source')
  })

  it('is deterministic and shell-safe: one slug, no punctuation, bounded length', () => {
    const branch = deriveBranch(
      '9',
      'A/B: "weird" title — with $ymbols, and a very long tail indeed',
    )
    expect(branch).toMatch(/^feature\/US-9(-[a-z0-9]+)*$/)
    expect(branch).toBe(
      deriveBranch('9', 'A/B: "weird" title — with $ymbols, and a very long tail indeed'),
    )
  })

  it('still yields a usable branch when the title slugs to nothing', () => {
    expect(deriveBranch('42', '!!! ???')).toBe('feature/US-42')
  })
})

describe('resolveBranch — ask the authority before deriving', () => {
  // The 8th defect the canary found: US-487's title changed after its branch was cut, so
  // `deriveBranch` produced `feature/US-487-pair-cli-run-card-pr-rounds` while the real branch was
  // `…-coordinator`. The worktree guard refused to switch a checkout, correctly — but the driver
  // should never have asked. Derivation is the fallback of last resort, not the first answer.
  //
  // Hermetic (a0 repair, finding AC1-B2): every case runs against a THROWAWAY repository built
  // here — never `process.cwd()`, whose live refs change under the test (a branch deleted at merge
  // would turn a sealed test red on its own). Precedence: PR head > existing ref > derived.
  const TITLE = 'A title that no longer matches any branch'
  let repo: string
  let bin: string

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })

  beforeEach(() => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pair-resolve-branch-')))
    repo = join(root, 'repo')
    bin = join(root, 'bin')
    mkdirSync(repo, { recursive: true })
    mkdirSync(bin, { recursive: true })
    git('init', '-q', '-b', 'main')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(join(repo, '..'), { recursive: true, force: true })
  })

  /** The operator's `gh`, answering `pr view --json headRefName` with one fixed head branch. */
  const ghAnsweringPrHead = (head: string) => {
    const gh = join(bin, 'gh')
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const a = process.argv.slice(2)
if (a[0] === 'pr' && a[1] === 'view') process.stdout.write(${JSON.stringify(head)} + '\\n')
else process.exit(1)
`,
    )
    chmodSync(gh, 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`)
  }

  it('falls back to derivation only for a card with no branch anywhere', () => {
    // No PR, no local ref, no remote ref — the one case where the title is the only thing to go on.
    expect(resolveBranch('7', TITLE, undefined, repo)).toBe(deriveBranch('7', TITLE))
  })

  it('prefers an existing LOCAL branch for the card over anything the title would derive', () => {
    git('branch', 'feature/US-7-the-branch-actually-cut')

    const resolved = resolveBranch('7', TITLE, undefined, repo)

    expect(resolved).toBe('feature/US-7-the-branch-actually-cut')
    expect(resolved).not.toBe(deriveBranch('7', TITLE))
  })

  it('finds a branch that exists only on origin (never checked out locally)', () => {
    git('update-ref', 'refs/remotes/origin/feature/US-7-cut-on-another-machine', 'HEAD')

    expect(resolveBranch('7', TITLE, undefined, repo)).toBe('feature/US-7-cut-on-another-machine')
  })

  it("a --pr entry takes the PR's own head branch, over an existing ref and the derivation", () => {
    git('branch', 'feature/US-7-the-branch-actually-cut')
    ghAnsweringPrHead('feature/US-7-the-pr-head')

    expect(resolveBranch('7', TITLE, 42, repo)).toBe('feature/US-7-the-pr-head')
  })
})
