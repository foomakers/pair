import { describe, it, expect, vi } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createDefaultCycleDriver, readCardTier, runSetupCommand } from './cycle-wiring'
import {
  createCycleScriptsBridge,
  CYCLE_BASE_BRANCH_DEFAULT,
  CYCLE_WORKFLOW_VERSION,
} from './cycle-scripts'
import { ENGINES } from './engines'
import {
  INSTALLED_SCRIPTS,
  PR,
  GATE_PASS,
  root,
  main,
  logs,
  lines,
  resolveCalls,
  mergeCalls,
  runDir,
  gatePrompts,
  runCalls,
  adopt,
  ELIGIBLE,
  drive,
  settle,
} from './cycle-merge-stage-lib'

describe('pair-cli run --card reaches the merge stage (US-490 r1-g2, finding r0-2)', () => {
  it('g2-c1: a card tier outside ## Auto-Advance is the unchanged done terminal (ready-for-merge), no merge script', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:yellow')

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('ready-for-merge')
    expect(outcome.next?.step).toBe('done')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c2: ## Auto-Advance (none) is the unchanged done terminal, no merge script', async () => {
    const outcome = await drive(
      adopt('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\n(none)\n'),
    )

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c3: no automation.md at all is the unchanged done terminal, no merge script', async () => {
    const outcome = await drive(adopt(undefined))

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  it('g2-c4: a card with no risk:* label is the unchanged done terminal, no merge script', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', '')

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('ready-for-merge')
    expect(mergeCalls()).toHaveLength(0)
  }, 60_000)

  // ── the card tier's label grammar: the family:tier shape cycle-merge.mjs readCurrentTier applies
  // (LABEL_SHAPE_RE, /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i). One reader per flow, one grammar: a label
  // readCurrentTier refuses is never a card tier either — the reader's fail-safe (undefined: resolve
  // never offers merge), not the malformed text passed on as --tier / --cardTier.

  it.each(['risk:a.b', 'risk:a/b', 'risk:', 'risk:1x', 'risk:green:x', 'risk:gre en', 'risk:_x'])(
    'g3-w1: a malformed risk label %j is no card tier (fail-safe undefined), never itself',
    label => {
      vi.stubEnv('FAKE_CARD_LABELS', label)

      expect(readCardTier('7', main)).toBeUndefined()
    },
  )

  it.each(['risk:green', 'risk:yellow', 'risk:red', 'risk:Green', 'risk:red-2'])(
    'g3-c1: a well-formed risk label %j is the card tier, verbatim',
    label => {
      vi.stubEnv('FAKE_CARD_LABELS', `bug,${label},auto-dev`)

      expect(readCardTier('7', main)).toBe(label)
    },
  )

  it.each([
    ['two well-formed', 'risk:green,risk:yellow'],
    ['a well-formed and a malformed', 'risk:green,risk:a.b'],
    ['none', 'bug,auto-dev'],
  ])('g3-c2: %s risk label(s) is no card tier (fail-safe undefined)', (_name, labels) => {
    vi.stubEnv('FAKE_CARD_LABELS', labels)

    expect(readCardTier('7', main)).toBeUndefined()
  })

  it('g3-w2: a malformed risk label is never handed to resolve as --tier, and no merge script runs', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:a.b')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(resolveCalls().length).toBeGreaterThan(0)
    for (const call of resolveCalls()) expect(call['tier']).not.toBe('risk:a.b')
    expect(mergeCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it("g2-c5: resolve answering invalid is a typed stop carrying resolve's reason — never a merge", async () => {
    vi.stubEnv(
      'FAKE_RESOLVE_FORCE',
      JSON.stringify({ status: 'invalid', reason: 'policy-auto-advance-invalid' }),
    )

    const outcome = await drive(adopt(ELIGIBLE))

    expect(outcome.status).toBe('invalid')
    expect(outcome.next?.step).toBe('blocked')
    expect(JSON.stringify(outcome)).toContain('policy-auto-advance-invalid')
    expect(mergeCalls()).toHaveLength(0)
    expect(lines(logs.engine)).toHaveLength(0)
  }, 60_000)

  it('g2-c6: the REAL cycle-state.mjs answers a malformed policy.autoAdvance with invalid, through the bridge', () => {
    const bridge = createCycleScriptsBridge({ scriptsDir: INSTALLED_SCRIPTS }, main)

    const answer = bridge.resolve({
      dir: runDir(),
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      policy: { autoAdvance: { tiers: 'risk:green' } },
      entry: 'pr',
      pr: PR,
      story: '7',
      runsRoot: join(main, '.pair/working/runs'),
    })

    expect(answer.status).toBe('invalid')
    expect(answer['reason']).toBe('policy-auto-advance-invalid')
  })

  // ── r3 (review r3-1 / r3-2): the merge hooks through the REAL executor. The r3 blind spot was a
  // scripts dir without cycle-hooks.mjs (the bridge a no-op) and a merge stub that removed no
  // worktree. These rows install the real executor and remove the story worktree on an executed
  // merge, as cycle-merge.mjs run's `branch` step does (AC3).

  const hooksLog = () => join(root, 'hooks.log')
  const hookRuns = (point: string) =>
    lines(hooksLog())
      .filter(l => l.startsWith(`${point} `))
      .map(l => l.slice(point.length + 1))
  const hook = (point: string, code = 0) =>
    `- \`${point}\`: \`echo "${point} $(pwd -P)" >> ${hooksLog()}${code === 0 ? '' : `; exit ${code}`}\``

  /** The real `cycle-hooks.mjs` in the scripts dir, and `## Cycle Hooks` appended to the policy. */
  function withRealHooks(bullets: string[]): InMemoryFileSystemService {
    cpSync(
      join(INSTALLED_SCRIPTS, 'cycle-hooks.mjs'),
      join(main, '.claude/skills/pair-workflow-cycle/scripts/cycle-hooks.mjs'),
    )
    vi.stubEnv('FAKE_MERGE_REMOVE_WORKTREE', '1')
    return adopt(`${ELIGIBLE}\n## Cycle Hooks\n\n${bullets.join('\n')}\n`)
  }

  it('g4-w1 (r3-1): an executed merge that removed the story worktree runs post-merge in the MAIN checkout, then post-cycle — merged, no throw', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('pre-merge'), hook('post-merge'), hook('post-cycle')])

    const outcome = await settle(drive(fs))

    expect(runCalls()).toHaveLength(1)
    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"status":"merged"')
    expect(hookRuns('pre-merge')).toEqual([join(root, 'pair-worktrees', '7')])
    expect(existsSync(join(root, 'pair-worktrees', '7'))).toBe(false)
    expect(hookRuns('post-merge')).toEqual([main])
    expect(hookRuns('post-cycle')).toEqual([main])
  }, 60_000)

  it('g4-w2 (r3-1): the same executed merge with a ## Cycle Hooks section declaring NO post-merge — merged, no throw', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('post-cycle')])

    const outcome = await settle(drive(fs))

    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"status":"merged"')
    expect(hookRuns('post-cycle')).toEqual([main])
  }, 60_000)

  it('g4-c1 (r3-2): a failing pre-merge (real executor) is failed-hook — zero check/run calls, no gate stage', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const fs = withRealHooks([hook('pre-merge', 3), hook('post-merge')])

    const outcome = await drive(fs)

    expect(outcome.status).toBe('failed-hook')
    expect(mergeCalls()).toHaveLength(0)
    expect(gatePrompts()).toHaveLength(0)
    expect(hookRuns('post-merge')).toEqual([])
  }, 60_000)

  // ── D5 (autonomous run 493): the merge gate is decided on the PR's tier, at the merge boundary, BEFORE cycle-merge check ──
  const LACKS_GREEN = {
    until: 'merged',
    prepare: { mode: 'always', has: [], lacks: [] },
    merge: { mode: 'when', has: ['needs-review'], lacks: ['risk:green'] },
  }
  const driveAutonomous = (fs: InMemoryFileSystemService) =>
    createDefaultCycleDriver({
      engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
      cwd: main,
      fs,
      location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
      autonomyArgs: [],
      timeoutSeconds: 30,
      workflowVersion: CYCLE_WORKFLOW_VERSION,
      baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
    })({ runId: 'story-7', card: '7', pr: PR, autonomy: { policy: LACKS_GREEN } } as never)

  it('d5-w1: card risk:green, PR raised to risk:yellow -> escalated at the merge boundary, no cycle-merge check/run, comment posted', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:green')
    vi.stubEnv('FAKE_PR_LABELS', 'risk:yellow')

    const outcome = await settle(driveAutonomous(adopt(undefined)))

    expect(outcome).toContain('"status":"escalated"')
    expect(
      resolveCalls().every(c => JSON.parse(c['prLabels'] ?? 'null')?.[0] === 'risk:yellow'),
    ).toBe(true)
    expect(mergeCalls().map(c => c.cmd)).toEqual(['escalate'])
    expect(mergeCalls()[0]?.opts['conditions']).toBe('["lacks:risk:green"]')
  }, 60_000)

  it('d5-c1: card and PR both risk:green -> the gate allows, the merge stage runs', async () => {
    vi.stubEnv('FAKE_CARD_LABELS', 'risk:green')
    vi.stubEnv('FAKE_PR_LABELS', 'risk:green')
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    const outcome = await settle(driveAutonomous(adopt(undefined)))

    expect(outcome).toContain('"status":"merged"')
    expect(mergeCalls().map(c => c.cmd)).toContain('check')
  }, 60_000)
})

describe('worktree-setup-command keeps the console live', () => {
  it('runs without blocking the event loop (the live row ticker keeps ticking)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'setup-'))
    const wow = join(dir, '.pair/adoption/tech/way-of-working.md')
    mkdirSync(dirname(wow), { recursive: true })
    writeFileSync(wow, '- **`worktree-setup-command`**: `node -e "setTimeout(()=>{},400)"`\n')
    let ticks = 0
    const ticker = setInterval(() => ticks++, 20)
    try {
      expect(await runSetupCommand(dir, dir)).toBeUndefined()
    } finally {
      clearInterval(ticker)
    }
    expect(ticks).toBeGreaterThan(5)
  })
})
