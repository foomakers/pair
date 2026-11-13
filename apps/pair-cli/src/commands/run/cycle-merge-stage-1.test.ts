import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { createDefaultCycleDriver } from './cycle-wiring'
import { CYCLE_BASE_BRANCH_DEFAULT, CYCLE_WORKFLOW_VERSION } from './cycle-scripts'
import { ENGINES } from './engines'
import {
  REVIEWED_HEAD,
  BRANCH,
  PR,
  GATE_PASS,
  GATE_BLOCKED,
  root,
  main,
  remoteHead,
  logs,
  printed,
  lines,
  resolveCalls,
  mergeCalls,
  runDir,
  gatePrompts,
  runCalls,
  reported,
  adopt,
  ELIGIBLE,
  drive,
  settle,
} from './cycle-merge-stage-lib'

describe('pair-cli run --card reaches the merge stage (US-490 r1-g2, finding r0-2)', () => {
  it('g2-w1: resolve receives the card tier as --tier and the Auto-Advance tiers as policy.autoAdvance.tiers', async () => {
    await settle(drive(adopt(ELIGIBLE)))

    const calls = resolveCalls()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call['tier']).toBe('risk:green')
      const policy = JSON.parse(call['policy'] ?? '{}') as { autoAdvance?: { tiers?: unknown } }
      expect(policy.autoAdvance?.tiers).toEqual(['risk:green'])
    }
  }, 60_000)

  it('g2-w2: a merge next runs cycle-merge.mjs check, then cycle-merge.mjs run — never a ready-for-merge terminal', async () => {
    // US-575: a red gate no longer reaches `run` (it is routed to the fix stage) — the pinning is observed on a green one.
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const cmds = mergeCalls().map(c => c.cmd)
    expect(cmds[0]).toBe('check')
    expect(cmds).toContain('run')
    expect(cmds.indexOf('check')).toBeLessThan(cmds.indexOf('run'))
    expect(cmds.filter(c => c === 'check')).toHaveLength(1)
    expect(cmds.filter(c => c === 'run')).toHaveLength(1)
    expect(outcome).not.toMatch(/"status":"ready-for-merge"/)
  }, 60_000)

  it('g2-w3: check and run are pinned to the reviewed head, the PR, the story, the tier and the Auto-Advance tiers', async () => {
    // US-575: a red gate no longer reaches `run` (it is routed to the fix stage) — the pinning is observed on a green one.
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    await settle(drive(adopt(ELIGIBLE)))

    const calls = mergeCalls()
    expect(calls.map(c => c.cmd)).toEqual(['check', 'run'])
    expect(REVIEWED_HEAD).not.toBe(remoteHead)
    for (const { opts } of calls) {
      expect(opts['reviewedHead']).toBe(REVIEWED_HEAD)
      expect(opts['pr']).toBe(String(PR))
      expect(opts['story']).toBe('7')
      expect(opts['cardTier']).toBe('risk:green')
      expect(JSON.parse(opts['autoAdvance'] ?? 'null')).toEqual(['risk:green'])
      expect(realpathSync(opts['dir'] ?? '')).toBe(realpathSync(runDir()))
    }
    const run = calls[1]!.opts
    expect(run['branch']).toBe(BRANCH)
    expect((run['message'] ?? '').trim().length).toBeGreaterThan(0)
  }, 60_000)

  it('g2-w4: the gate stage ran but wrote NO evidence — red: retried once, then routed to the fix stage; nothing merges', async () => {
    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(existsSync(join(runDir(), 'merge-gate.json'))).toBe(false)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
    expect(outcome).toContain('stub-fix-stage')
    expect(`${outcome}\n${printed.join('\n')}`).toContain('no gate evidence for this tier and head')
  }, 60_000)

  it('g2-w5: a parked check never runs the merge, and its reason is reported verbatim', async () => {
    const reason = 'the card tier changed since the cycle started (risk:green -> risk:yellow)'
    vi.stubEnv(
      'FAKE_MERGE_CHECK',
      JSON.stringify({
        mergeAllowed: false,
        failed: [{ code: 'tier-changed', detail: reason }],
        reason,
        parkKind: 'halted',
      }),
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check'])
    expect(`${outcome}\n${printed.join('\n')}`).toContain(reason)
    expect(outcome).not.toContain('"merged":true')
  }, 60_000)

  it('g2-w6: a malformed ## Auto-Advance halts naming the section — no merge script, no stage', async () => {
    const outcome = await settle(
      drive(adopt('## Eligibility\n\nrisk:green\n\n## Auto-Advance\n\nrisk:green AND risk:red\n')),
    )

    expect(outcome).toMatch(/^rejected .*Auto-Advance|"status":"invalid"/)
    expect(mergeCalls()).toHaveLength(0)
    expect(lines(logs.engine)).toHaveLength(0)
  }, 60_000)

  it('g2-w7: green gate evidence for the card tier gives exactly one run --gate green, merged:true and cascaded relayed', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(mergeCalls().map(c => c.cmd)).toEqual(['check', 'run'])
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toMatch(/^resolved /)
    expect(outcome).toContain('"merged":true')
    expect(outcome).toContain('"cascaded":true')
  }, 60_000)

  it('g2-w8: a merge that landed with the closure unfinished is relayed merged:true, cascaded:false with its reason', async () => {
    const reason = 'post-merge closure unfinished: board (status field not found)'
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    vi.stubEnv('FAKE_MERGE_RUN', JSON.stringify({ merged: true, cascaded: false, reason }))

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toContain('"merged":true')
    expect(outcome).toContain('"cascaded":false')
    expect(outcome).not.toContain('"cascaded":true')
    expect(reported(outcome)).toContain(reason)
  }, 60_000)

  // 2026-10-24 (#575 / PR #581): CI stayed red on a deterministic failure (no git identity on the
  // runner); re-runs cannot fix it, and the card parked awaiting a human instead of being fixed.
  const platformCases = ['darwin', 'linux']
  it.each(platformCases)(
    'US-575 follow-up: CI still red after its re-run is routed to the fix stage with the failing checks as findings — never parked (platform %s)',
    async platform => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue(platform as NodeJS.Platform)
      vi.stubEnv(
        'FAKE_MERGE_CHECK',
        JSON.stringify({
          mergeAllowed: false,
          ciPending: false,
          ciFailed: true,
          failed: [{ code: 'ci-failed', detail: 'build: failure' }],
          reason: 'required CI failed: build',
          parkKind: 'halted',
        }),
      )

      const outcome = await settle(drive(adopt(ELIGIBLE), { capSeconds: 0 }))

      expect(runCalls()).toHaveLength(0)
      expect(outcome).not.toContain('merge-parked')
      const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
      expect(recovery.gateRed.reviewedHead).toBe(REVIEWED_HEAD)
      expect(JSON.stringify(recovery.gateRed.gates)).toContain('build')
    },
    60_000,
  )

  it('g2-w9 / US-575 AC2: gate evidence that ran and FAILED twice is routed to the fix stage with the failing gates as findings — never run --gate red', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(runCalls()).toHaveLength(0)
    expect(outcome).not.toContain('"merged":true')
    expect(reported(outcome)).toContain(GATE_BLOCKED)
    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.gateRed).toMatchObject({
      reviewedHead: REVIEWED_HEAD,
      gates: [
        { name: 'lint', ok: false, lastLines: 'error  no-unused-vars' },
        { name: 'test', ok: true },
      ],
    })
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)

  it('US-575 AC1: a gate BLOCKED once, then green on re-run, merges — the driver never exits on the first BLOCKED (#568 / PR #574)', async () => {
    vi.stubEnv('FAKE_GATE_SEQUENCE', JSON.stringify([GATE_BLOCKED, GATE_PASS]))

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    expect(gatePrompts()).toHaveLength(2)
    expect(gatePrompts().every(p => p.includes(REVIEWED_HEAD))).toBe(true)
    expect(runCalls()).toHaveLength(1)
    expect(runCalls()[0]!.opts['gate']).toBe('green')
    expect(outcome).toContain('"status":"merged"')
    expect(printed.join('\n')).toMatch(/recovery round 1\/5/)
    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.rounds).toMatchObject([{ kind: 'gate-retry', detail: GATE_BLOCKED }])
  }, 60_000)

  it('US-575 AC1: the gate prompt asks for every gate by name with its last error lines in merge-gate.json', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    await settle(drive(adopt(ELIGIBLE)))
    expect(gatePrompts()[0]).toMatch(
      /"gates": \[\{"name": "<gate>", "ok": <true\|false>, "lastLines": "<its last error lines>"\}/,
    )
  }, 60_000)

  it('US-575 AC1: before the re-run the driver runs the adopted worktree-setup-command in the story worktree; a failing setup is one round, its error recorded', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)
    const wow = join(main, '.pair/adoption/tech/way-of-working.md')
    mkdirSync(dirname(wow), { recursive: true })
    writeFileSync(
      wow,
      "- **`worktree-setup-command`**: `node -e \"require('fs').appendFileSync('setup.log', process.cwd() + '\\\\n'); process.exit(3)\"` — run once.\n",
    )

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const recovery = JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8'))
    expect(recovery.rounds.map((r: { detail: string }) => r.detail)).toEqual([GATE_BLOCKED])
    expect(recovery.gateRed.gates).toContainEqual({
      name: 'worktree-setup-command',
      ok: false,
      lastLines: expect.stringMatching(/worktree-setup-command .* exited 3/),
    })
    expect(printed.join('\n')).toMatch(/worktree-setup-command .* exited 3/)
    expect(readFileSync(join(root, 'pair-worktrees/7/setup.log'), 'utf8')).toContain(
      'pair-worktrees/7',
    )
    expect(gatePrompts()).toHaveLength(1)
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)

  it('US-575 AC5: a story branch that conflicts with its base is synced mechanically, pushed, and the new head re-resolved — then it merges', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_PASS)
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: main,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    git('checkout', '-q', '-b', 'scratch')
    writeFileSync(join(main, 'f.txt'), 'story\n')
    git('add', 'f.txt')
    git('commit', '-q', '-m', '[#7] feat: story side')
    git('push', '-q', 'origin', `HEAD:refs/heads/${BRANCH}`)
    git('checkout', '-q', 'main')
    writeFileSync(join(main, 'f.txt'), 'base\n')
    git('add', 'f.txt')
    git('commit', '-q', '-m', 'base side')
    git('push', '-q', 'origin', 'main')

    const outcome = await settle(drive(adopt(ELIGIBLE)))

    const synced = git('rev-parse', `origin/${BRANCH}`)
    expect(git('log', '-1', '--format=%B', synced)).toMatch(
      /Pair-Base-Sync: base=[0-9a-f]{40}; ours=f\.txt/,
    )
    expect(resolveCalls().some(c => c['head'] === synced)).toBe(true)
    expect(JSON.parse(readFileSync(join(runDir(), 'recovery.json'), 'utf8')).rounds).toMatchObject([
      { kind: 'base-sync' },
    ])
    expect(outcome).toContain('"status":"merged"')
  }, 60_000)

  it('US-575 AC8 edge: the run budgets reach resolve; autoRecoveryRounds 0 re-runs nothing — the red gate goes straight to the fix stage', async () => {
    vi.stubEnv('FAKE_GATE_RESULT', GATE_BLOCKED)
    const outcome = await settle(
      createDefaultCycleDriver({
        engine: { ...ENGINES.claude, command: join(root, 'bin', 'fake-engine') },
        cwd: main,
        fs: adopt(ELIGIBLE),
        location: { scriptsDir: join(main, '.claude/skills/pair-workflow-cycle/scripts') },
        autonomyArgs: [],
        timeoutSeconds: 30,
        workflowVersion: CYCLE_WORKFLOW_VERSION,
        baseBranch: CYCLE_BASE_BRANCH_DEFAULT,
      })({
        runId: 'story-7',
        card: '7',
        pr: PR,
        budgets: { autoRecoveryRounds: 0, maxFixRounds: 4 },
      }),
    )
    expect(JSON.parse(resolveCalls()[0]!['policy']!)).toMatchObject({
      autoRecoveryRounds: 0,
      maxFixRounds: 4,
    })
    expect(gatePrompts()).toHaveLength(1)
    expect(outcome).toContain('stub-fix-stage')
  }, 60_000)
})
