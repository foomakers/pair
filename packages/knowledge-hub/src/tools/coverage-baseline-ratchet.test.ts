import { describe, it, expect } from 'vitest'
import {
  RATCHET_MARKER,
  RATCHET_BRANCH,
  DEFAULT_MARGIN_PP,
  TOKEN_ENV,
  proposeBaseline,
  readBaselineValue,
  readCommitBackFlag,
  shouldSkipCommitBack,
  planRatchet,
  applyRaises,
  classifyWriteRefusal,
  ratchetGitPlan,
  renderRatchetPlan,
} from './coverage-baseline-ratchet'

// A config fixture shaped like the real adoption file: the parseable `key=value`
// block lives inside a fenced code block, wrapped in markdown that MUST survive
// a write untouched (business rule: "edits values in place, never rewrites the
// surrounding markdown").
const CONFIG = `# \`tech/coverage-baseline.md\` — config

Some prose that must not move.

## Config

\`\`\`ini
# comment line
target.default=70
target.shared=90
target.frontend=25

baseline.shared=84
baseline.frontend=19
\`\`\`

## Notes

- trailing prose
`

const measuredPush = {
  eventName: 'push',
  refName: 'main',
  baseBranch: 'main',
  headCommitMessage: 'feat: something unrelated',
}

describe('proposeBaseline — the margin convention the adoption file already documents', () => {
  it('reproduces the committed baselines from the measured values (85.04 -> 84, 20.16 -> 19)', () => {
    expect(proposeBaseline(85.04)).toBe(84)
    expect(proposeBaseline(20.16)).toBe(19)
  })

  it('is floor(measured) - margin', () => {
    expect(proposeBaseline(90)).toBe(89)
    expect(proposeBaseline(90.99)).toBe(89)
    expect(proposeBaseline(100)).toBe(99)
    expect(proposeBaseline(90, 0)).toBe(90)
    expect(proposeBaseline(90, 5)).toBe(85)
  })

  it('never goes negative', () => {
    expect(proposeBaseline(0)).toBe(0)
    expect(proposeBaseline(0.5)).toBe(0)
  })

  it('is a fixpoint — proposing from a value already at the proposal yields no increase', () => {
    // measured 85.04 => 84; a later run measuring the same never proposes 85.
    const first = proposeBaseline(85.04)
    expect(proposeBaseline(85.04)).toBe(first)
  })
})

describe('readBaselineValue — `^baseline.<type>=<int>` only, format unchanged', () => {
  it('reads a committed integer baseline', () => {
    expect(readBaselineValue(CONFIG, 'shared')).toBe(84)
    expect(readBaselineValue(CONFIG, 'frontend')).toBe(19)
  })

  it('returns null for a type absent from the config', () => {
    expect(readBaselineValue(CONFIG, 'backend')).toBeNull()
  })

  it('returns null for a malformed value', () => {
    expect(readBaselineValue('baseline.shared=not-a-number\n', 'shared')).toBeNull()
  })

  it('tolerates a CRLF-authored config', () => {
    expect(readBaselineValue('baseline.shared=84\r\n', 'shared')).toBe(84)
  })

  it('does not match a key that merely contains the type name', () => {
    expect(readBaselineValue('baseline.sharedish=99\nbaseline.shared=84\n', 'shared')).toBe(84)
  })

  it('ignores a commented-out baseline line (only `^baseline.` matches)', () => {
    expect(readBaselineValue('# baseline.shared=99\nbaseline.shared=84\n', 'shared')).toBe(84)
  })
})

describe('readCommitBackFlag — the opt-in, default disabled', () => {
  it('reads `enabled` from the way-of-working bullet', () => {
    expect(readCommitBackFlag('- **Coverage baseline commit-back**: `enabled` — foo')).toBe(
      'enabled',
    )
  })

  it('reads `disabled`', () => {
    expect(readCommitBackFlag('- **Coverage baseline commit-back**: `disabled` — foo')).toBe(
      'disabled',
    )
  })

  it('reports `absent` when the flag is not declared at all (framework default = off)', () => {
    expect(readCommitBackFlag('- **Coverage guardrail**: `enabled`')).toBe('absent')
    expect(readCommitBackFlag('')).toBe('absent')
  })

  it('is case-insensitive and tolerates missing backticks/bold', () => {
    expect(readCommitBackFlag('Coverage Baseline Commit-Back: Enabled')).toBe('enabled')
  })
})

describe('shouldSkipCommitBack — AC1 (default off), AC4 (loop termination), AC5 (PR vs push)', () => {
  it('AC1: skips when the flag is absent — the framework default writes nothing', () => {
    const d = shouldSkipCommitBack({ ...measuredPush, commitBackFlag: 'absent' })
    expect(d.skip).toBe(true)
    expect(d.code).toBe('flag-disabled')
  })

  it('AC1: skips when the flag is explicitly disabled', () => {
    expect(shouldSkipCommitBack({ ...measuredPush, commitBackFlag: 'disabled' }).code).toBe(
      'flag-disabled',
    )
  })

  it('AC5: skips a pull_request run — a PR never writes back (fork or not)', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'enabled',
      eventName: 'pull_request',
      refName: 'feature/US-1-foo',
    })
    expect(d.skip).toBe(true)
    expect(d.code).toBe('not-base-push')
  })

  it('AC5: skips a push to a non-base branch', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'enabled',
      refName: 'feature/US-1-foo',
    })
    expect(d.code).toBe('not-base-push')
  })

  it('AC4: skips a run whose head commit carries the ratchet marker', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'enabled',
      headCommitMessage: `chore: ratchet coverage baseline (shared 84->89) ${RATCHET_MARKER}`,
    })
    expect(d.skip).toBe(true)
    expect(d.code).toBe('automated-commit')
  })

  it('AC4: skips a squash-merge subject taken from the ratchet PR title', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'enabled',
      headCommitMessage: `chore: ratchet coverage baseline ${RATCHET_MARKER} (#123)`,
    })
    expect(d.code).toBe('automated-commit')
  })

  it('AC4: skips a plain merge commit naming the ratchet branch (marker not in the subject)', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'enabled',
      headCommitMessage: `Merge pull request #123 from foomakers/${RATCHET_BRANCH}`,
    })
    expect(d.code).toBe('automated-commit')
  })

  it('proceeds on a base-branch push from a human commit with the flag enabled', () => {
    expect(shouldSkipCommitBack({ ...measuredPush, commitBackFlag: 'enabled' })).toEqual({
      skip: false,
    })
  })

  it('evaluates the flag before anything else (an enabled-only concern never leaks)', () => {
    const d = shouldSkipCommitBack({
      ...measuredPush,
      commitBackFlag: 'disabled',
      eventName: 'pull_request',
      headCommitMessage: RATCHET_MARKER,
    })
    expect(d.code).toBe('flag-disabled')
  })
})

describe('planRatchet — monotonic, per-type', () => {
  it('AC2: raises when the proposal is strictly above the committed baseline', () => {
    const plan = planRatchet(CONFIG, { shared: 90.5 })
    expect(plan).toEqual([
      {
        type: 'shared',
        measured: 90.5,
        current: 84,
        proposed: 89,
        action: 'raise',
        reason: 'measured 90.5% => baseline 89 (floor - 1pp margin), above committed 84',
      },
    ])
  })

  it('AC3: holds when coverage is exactly at the baseline', () => {
    const [p] = planRatchet(CONFIG, { shared: 84 })
    expect(p.action).toBe('hold')
    expect(p.reason).toContain('not above')
  })

  it('AC3: holds when the proposal equals the committed baseline (fixpoint, no churn)', () => {
    const [p] = planRatchet(CONFIG, { shared: 85.04 })
    expect(p.proposed).toBe(84)
    expect(p.action).toBe('hold')
  })

  it('AC3 + business rule: NEVER lowers — a drop is a hold, not a write', () => {
    const [p] = planRatchet(CONFIG, { shared: 40 })
    expect(p.action).toBe('hold')
    expect(p.proposed).toBeLessThan(p.current as number)
  })

  it('edge case: a type measured but absent from the config is reported, not written', () => {
    const [p] = planRatchet(CONFIG, { backend: 99 })
    expect(p.action).toBe('no-baseline-configured')
    expect(p.current).toBeNull()
  })

  it('edge case: a malformed committed baseline is reported, not overwritten', () => {
    const [p] = planRatchet('baseline.shared=oops\n', { shared: 99 })
    expect(p.action).toBe('no-baseline-configured')
  })

  it('edge case: a missing/unparseable measurement is reported, never assumed', () => {
    expect(planRatchet(CONFIG, { shared: '' }).map(p => p.action)).toEqual(['not-measured'])
    expect(planRatchet(CONFIG, { shared: 'null' }).map(p => p.action)).toEqual(['not-measured'])
    expect(planRatchet(CONFIG, { shared: undefined }).map(p => p.action)).toEqual(['not-measured'])
  })

  it('plans every type independently and preserves input order', () => {
    const plan = planRatchet(CONFIG, { shared: 90.5, frontend: 19.2, backend: 50 })
    expect(plan.map(p => [p.type, p.action])).toEqual([
      ['shared', 'raise'],
      ['frontend', 'hold'],
      ['backend', 'no-baseline-configured'],
    ])
  })

  it('accepts a custom margin', () => {
    const [p] = planRatchet(CONFIG, { shared: 90.5 }, 0)
    expect(p.proposed).toBe(90)
  })
})

describe('applyRaises — in-place value edit, surrounding markdown untouched', () => {
  it('changes only the matched baseline line', () => {
    const raises = planRatchet(CONFIG, { shared: 90.5 }).filter(p => p.action === 'raise')
    const { text, changedLines } = applyRaises(CONFIG, raises)
    expect(changedLines).toBe(1)

    const before = CONFIG.split('\n')
    const after = text.split('\n')
    expect(after.length).toBe(before.length)
    const differing = before
      .map((line, i) => (line === after[i] ? null : i))
      .filter((i): i is number => i !== null)
    expect(differing.length).toBe(1)
    expect(before[differing[0]]).toBe('baseline.shared=84')
    expect(after[differing[0]]).toBe('baseline.shared=89')
  })

  it('leaves the file byte-identical when there is nothing to raise', () => {
    expect(applyRaises(CONFIG, []).text).toBe(CONFIG)
    expect(applyRaises(CONFIG, []).changedLines).toBe(0)
  })

  it('raises several types in one pass', () => {
    const raises = planRatchet(CONFIG, { shared: 95, frontend: 40 }).filter(
      p => p.action === 'raise',
    )
    const { text, changedLines } = applyRaises(CONFIG, raises)
    expect(changedLines).toBe(2)
    expect(text).toContain('baseline.shared=94')
    expect(text).toContain('baseline.frontend=39')
  })

  it('is idempotent — re-planning against the written text yields no further raise', () => {
    const raises = planRatchet(CONFIG, { shared: 90.5 }).filter(p => p.action === 'raise')
    const { text } = applyRaises(CONFIG, raises)
    expect(planRatchet(text, { shared: 90.5 }).map(p => p.action)).toEqual(['hold'])
  })

  it('refuses to write a value that is not strictly above what is on disk now (concurrency)', () => {
    // Simulates: this run planned 89 from a stale read; a concurrent run already
    // committed 92. Re-checking against the CURRENT text must drop the proposal
    // so the higher value is never clobbered.
    const concurrent = CONFIG.replace('baseline.shared=84', 'baseline.shared=92')
    const stale = planRatchet(CONFIG, { shared: 90.5 }).filter(p => p.action === 'raise')
    const { text, changedLines, dropped } = applyRaises(concurrent, stale)
    expect(changedLines).toBe(0)
    expect(text).toBe(concurrent)
    expect(dropped.map(d => d.type)).toEqual(['shared'])
  })

  it('preserves CRLF line endings on the edited line', () => {
    const crlf = 'x\r\nbaseline.shared=84\r\ny\r\n'
    const raises = planRatchet(crlf, { shared: 90.5 }).filter(p => p.action === 'raise')
    expect(applyRaises(crlf, raises).text).toBe('x\r\nbaseline.shared=89\r\ny\r\n')
  })
})

describe('classifyWriteRefusal — AC6 names the reason', () => {
  it('names a missing credential', () => {
    expect(classifyWriteRefusal('', { hasToken: false }).code).toBe('missing-credential')
    expect(classifyWriteRefusal('', { hasToken: false }).message).toContain(TOKEN_ENV)
  })

  it('names branch protection', () => {
    const r = classifyWriteRefusal(
      'remote: error: GH006: Protected branch update failed for refs/heads/main.',
      { hasToken: true },
    )
    expect(r.code).toBe('protected-branch')
  })

  it('names an insufficient scope / permission', () => {
    expect(
      classifyWriteRefusal('remote: Permission to foomakers/pair.git denied to github-actions.', {
        hasToken: true,
      }).code,
    ).toBe('insufficient-scope')
    expect(
      classifyWriteRefusal('gh: Resource not accessible by integration (HTTP 403)', {
        hasToken: true,
      }).code,
    ).toBe('insufficient-scope')
  })

  it('names a stale-lease race', () => {
    expect(
      classifyWriteRefusal('! [rejected] chore/x -> chore/x (stale info)', { hasToken: true }).code,
    ).toBe('stale-lease')
  })

  it('falls back to an explicit unknown rather than swallowing the output', () => {
    const r = classifyWriteRefusal('something nobody predicted', { hasToken: true })
    expect(r.code).toBe('unknown')
    expect(r.message).toContain('something nobody predicted')
  })
})

describe('ratchetGitPlan — the exact command sequence (a bot PR, never a push to base)', () => {
  const raises = planRatchet(CONFIG, { shared: 90.5 }).filter(p => p.action === 'raise')
  const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567'
  const plan = ratchetGitPlan({
    raises,
    configPath: '.pair/adoption/tech/coverage-baseline.md',
    baseBranch: 'main',
    remote: 'origin',
    headCommit: HEAD_SHA,
  })
  const argvs = plan.commands.map(c => c.argv)
  const flat = argvs.flat()

  it('never pushes to the base branch — only to the dedicated ratchet branch', () => {
    const pushes = argvs.filter(c => c[0] === 'git' && c[1] === 'push')
    expect(pushes.length).toBe(1)
    expect(pushes[0]).toContain(`HEAD:refs/heads/${RATCHET_BRANCH}`)
    expect(pushes.flat().join(' ')).not.toContain('refs/heads/main')
  })

  it('pushes with --force-with-lease (never a bare force)', () => {
    const push = argvs.find(c => c[1] === 'push') as string[]
    expect(push).toContain('--force-with-lease')
    expect(push).not.toContain('--force')
  })

  it('makes the lease possible: maps + fetches a remote-tracking ref BEFORE the push', () => {
    // Without this a CI checkout (which fetches only the base ref) has no
    // remote-tracking ref for the destination, and git rejects every
    // non-fast-forward lease push as `stale info` — the ratchet would work once
    // and then warn forever.
    const refspec = `+refs/heads/${RATCHET_BRANCH}:refs/remotes/origin/${RATCHET_BRANCH}`
    const configIdx = argvs.findIndex(c => c[1] === 'config' && c[2] === '--add')
    const fetchIdx = argvs.findIndex(c => c[1] === 'fetch')
    const pushIdx = argvs.findIndex(c => c[1] === 'push')
    expect(argvs[configIdx]).toEqual(['git', 'config', '--add', 'remote.origin.fetch', refspec])
    expect(argvs[fetchIdx]).toEqual(['git', 'fetch', '--no-tags', 'origin', refspec])
    expect(configIdx).toBeLessThan(fetchIdx)
    expect(fetchIdx).toBeLessThan(pushIdx)
  })

  it('tolerates ONLY the fetch failing — the branch does not exist on the first run', () => {
    const optional = plan.commands.filter(c => c.optional === true).map(c => c.argv[1])
    expect(optional).toEqual(['fetch'])
  })

  it('creates no local branch and never switches branches', () => {
    expect(argvs.some(c => c[1] === 'checkout' || c[1] === 'switch' || c[1] === 'branch')).toBe(
      false,
    )
  })

  it('restores the checkout to the SHA the run was given, by SHA and not HEAD~1', () => {
    // A relative reset would destroy the base branch's own tip if the sequence
    // failed before the commit existed.
    expect(plan.restore).toEqual(['git', 'reset', '--hard', HEAD_SHA])
    expect(plan.restore).not.toContain('HEAD~1')
  })

  it('stages ONLY the config file — never `git add -A`', () => {
    const add = argvs.find(c => c[1] === 'add') as string[]
    expect(add).toEqual(['git', 'add', '--', '.pair/adoption/tech/coverage-baseline.md'])
    expect(flat).not.toContain('-A')
  })

  it('marks the commit subject as automated (loop marker)', () => {
    expect(plan.commitMessage).toContain(RATCHET_MARKER)
    expect(plan.commitMessage).toContain('shared 84->89')
  })

  it('carries the marker in the PR title too, so a squash subject keeps it', () => {
    expect(plan.prTitle).toContain(RATCHET_MARKER)
  })

  it('creates-or-updates ONE PR against the base branch from the ratchet branch', () => {
    const gh = argvs.filter(c => c[0] === 'gh')
    expect(gh.length).toBe(1)
    const ghFlat = gh.map(c => c.join(' ')).join('\n')
    expect(ghFlat).toContain(`--base main`)
    expect(ghFlat).toContain(`--head ${RATCHET_BRANCH}`)
  })

  it('explains itself in the PR body: why a PR, the flag, and the ADL', () => {
    expect(plan.prBody).toContain('#372')
    expect(plan.prBody).toContain('2026-07-30-coverage-ratchet-pr-not-push')
    expect(plan.prBody).toContain('shared')
  })

  it('refreshes an already-open ratchet PR in place instead of opening a second one', () => {
    expect(plan.prUpdate.slice(0, 4)).toEqual(['gh', 'pr', 'edit', RATCHET_BRANCH])
    expect(plan.prUpdate).toContain(plan.prTitle)
    expect(plan.prUpdate).toContain(plan.prBody)
  })

  it('has no commands at all when there is nothing to raise', () => {
    const empty = ratchetGitPlan({
      raises: [],
      configPath: 'x.md',
      baseBranch: 'main',
      remote: 'origin',
      headCommit: HEAD_SHA,
    })
    expect(empty.commands).toEqual([])
    expect(empty.prUpdate).toEqual([])
    expect(empty.restore).toEqual([])
  })
})

describe('renderRatchetPlan — the human-readable step output', () => {
  it('reports a skip with its code and reason', () => {
    const out = renderRatchetPlan({
      skip: { skip: true, code: 'flag-disabled', reason: 'commit-back is disabled' },
      plan: [],
    })
    expect(out).toContain('SKIPPED')
    expect(out).toContain('flag-disabled')
  })

  it('reports each per-type action', () => {
    const out = renderRatchetPlan({ plan: planRatchet(CONFIG, { shared: 90.5, frontend: 19.2 }) })
    expect(out).toContain('shared')
    expect(out).toContain('raise')
    expect(out).toContain('frontend')
    expect(out).toContain('hold')
  })

  it('says so explicitly when nothing is to be raised', () => {
    expect(renderRatchetPlan({ plan: planRatchet(CONFIG, { shared: 84 }) })).toContain('no raise')
  })
})

describe('module constants pin the contract the CI step and the docs rely on', () => {
  it('exposes the marker, branch, margin and token env name', () => {
    expect(RATCHET_MARKER).toBe('[coverage-baseline-ratchet]')
    expect(RATCHET_BRANCH).toBe('chore/coverage-baseline-ratchet')
    expect(DEFAULT_MARGIN_PP).toBe(1)
    expect(TOKEN_ENV).toBe('COVERAGE_RATCHET_TOKEN')
  })
})
