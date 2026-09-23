import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  handleRunCommand,
  ineligibleOverrideApplied,
  isDorFallbackReason,
  type DorFallbackGate,
} from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { LockAcquirer } from './card-lock'
import type { AutomationPolicy } from './automation-policy'
import type { DispatchSkipReason } from './dispatch'

/**
 * AC14's fallback must not walk around the eligibility gate (AC15).
 *
 * `decideDispatch` answers `no-mapping-declared` BEFORE it ever reads `## Eligibility` (the
 * `mapping === undefined` branch returns above the eligibility branch), so a fallback engaging on
 * that reason would reach the delivery cycle for cards the label exists to keep out. AC15 as written
 * on the card (maintainer decisions 2026-09-22): with `## Eligibility` declared and no `## Workflows`,
 * an `--autonomous` run on a card that does NOT carry the label is skipped as ineligible and the
 * delivery cycle never starts. The gate bounds UNATTENDED runs: a supervised run (no `--autonomous`,
 * confirmations active) is not held back and proceeds per AC14. `--approve-ineligible` is the
 * per-run human override for the unattended case: THAT one run passes the gate, and the command
 * announces the override it applied. Nothing is persisted.
 */

const gate = (
  over: Partial<DorFallbackGate> & { reason: DispatchSkipReason },
): DorFallbackGate => ({
  policy: {} as AutomationPolicy,
  tags: [],
  autonomous: true,
  ...over,
})

const eligibility = (label?: string) => ({ eligibility: label }) as AutomationPolicy

/** Captures what an operator would read on the console. */
function captureLog() {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  })
  return () => lines.join('\n')
}

describe('AC14 fallback vs the eligibility gate', () => {
  it('falls back on `unmapped`: eligibility was already evaluated upstream, and passed', () => {
    for (const autonomous of [true, false]) {
      expect(
        isDorFallbackReason(
          gate({ reason: 'unmapped', policy: eligibility('risk:green'), autonomous }),
        ),
      ).toBe(true)
    }
  })

  it('falls back on `no-mapping-declared` when no `## Eligibility` is declared — supervised or autonomous', () => {
    for (const autonomous of [true, false]) {
      for (const tags of [[], ['risk:red']]) {
        expect(
          isDorFallbackReason(
            gate({
              reason: 'no-mapping-declared',
              policy: eligibility(undefined),
              tags,
              autonomous,
            }),
          ),
        ).toBe(true)
      }
    }
  })

  it('falls back on `no-mapping-declared` when the card CARRIES the declared label', () => {
    for (const autonomous of [true, false]) {
      expect(
        isDorFallbackReason(
          gate({
            reason: 'no-mapping-declared',
            policy: eligibility('risk:green'),
            tags: ['risk:green'],
            autonomous,
          }),
        ),
      ).toBe(true)
    }
  })

  it('REFUSES `no-mapping-declared` on an AUTONOMOUS run whose card lacks the declared label (AC15)', () => {
    for (const tags of [[], ['risk:red']]) {
      expect(
        isDorFallbackReason(
          gate({
            reason: 'no-mapping-declared',
            policy: eligibility('risk:green'),
            tags,
            autonomous: true,
          }),
        ),
        JSON.stringify(tags),
      ).toBe(false)
    }
  })

  it('ALLOWS a SUPERVISED run on that same label-less card — the gate bounds unattended runs (AC15)', () => {
    for (const tags of [[], ['risk:red']]) {
      expect(
        isDorFallbackReason(
          gate({
            reason: 'no-mapping-declared',
            policy: eligibility('risk:green'),
            tags,
            autonomous: false,
          }),
        ),
        JSON.stringify(tags),
      ).toBe(true)
    }
  })

  it('--approve-ineligible lets THAT autonomous run through for this one invocation', () => {
    expect(
      isDorFallbackReason(
        gate({
          reason: 'no-mapping-declared',
          policy: eligibility('risk:green'),
          tags: ['risk:red'],
          autonomous: true,
          approveIneligible: true,
        }),
      ),
    ).toBe(true)
  })

  it('never reaches the fallback for the skip reasons that are not about routing', () => {
    for (const reason of ['automation-off', 'ineligible', 'run-in-progress'] as const) {
      expect(isDorFallbackReason(gate({ reason })), reason).toBe(false)
      expect(isDorFallbackReason(gate({ reason, autonomous: false })), reason).toBe(false)
      expect(isDorFallbackReason(gate({ reason, approveIneligible: true })), reason).toBe(false)
    }
  })
})

describe('ineligibleOverrideApplied — announced, never silent', () => {
  it('is true exactly when the flag is what let an AUTONOMOUS run on a label-less card through', () => {
    expect(
      ineligibleOverrideApplied(
        gate({
          reason: 'no-mapping-declared',
          policy: eligibility('risk:green'),
          tags: [],
          autonomous: true,
          approveIneligible: true,
        }),
      ),
    ).toBe(true)
  })

  it('stays quiet when the flag changed nothing — supervised, no label declared, the label carried, or no flag', () => {
    const quiet: DorFallbackGate[] = [
      gate({
        reason: 'no-mapping-declared',
        policy: eligibility('risk:green'),
        tags: [],
        autonomous: false,
        approveIneligible: true,
      }),
      gate({
        reason: 'no-mapping-declared',
        policy: eligibility(undefined),
        approveIneligible: true,
      }),
      gate({
        reason: 'no-mapping-declared',
        policy: eligibility('risk:green'),
        tags: ['risk:green'],
        approveIneligible: true,
      }),
      gate({ reason: 'no-mapping-declared', policy: eligibility('risk:green'), tags: [] }),
      gate({ reason: 'unmapped', policy: eligibility('risk:green'), approveIneligible: true }),
    ]
    for (const candidate of quiet) {
      expect(ineligibleOverrideApplied(candidate), JSON.stringify(candidate)).toBe(false)
    }
  })
})

/**
 * AC15 through the real entry: `handleRunCommand` on a project declaring `## Eligibility` (with and
 * without `## Workflows`) for a card that does NOT carry the label. The cycle never starts.
 */
describe('AC15 through handleRunCommand', () => {
  const cwd = '/project'
  const fs = (policy = '## Eligibility\n\nrisk:green\n') =>
    new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'overwrite',
              description: 'skills',
              prefix: 'pair',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        [`${cwd}/${POLICY_PATH}`]: policy,
        [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
        [`${cwd}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
        '/bin/claude': '',
      },
      cwd,
      cwd,
    )
  const deps = () => {
    const driveCycle = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 1 }))
    const cardReadiness = vi.fn(async () => 'ready' as const)
    const acquireLock = (({ card }: { card: string }) => ({
      kind: 'acquired' as const,
      lock: { path: `/locks/${card}`, release: () => {} },
    })) as LockAcquirer
    return {
      driveCycle,
      cardReadiness,
      handler: {
        runIteration: vi.fn(async () => ({ outcome: 'success' as const, detail: 'done' })),
        acquireLock,
        appendAudit: () => {},
        cardReadiness,
        driveCycle,
      },
    }
  }

  beforeEach(() => {
    vi.stubEnv('PATH', '/bin')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('an AUTONOMOUS run on a card without the label never starts the delivery cycle', async () => {
    captureLog()
    const { handler, driveCycle } = deps()

    await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:red', autonomous: true }),
      fs(),
      handler,
    )

    expect(driveCycle).not.toHaveBeenCalled()
  })

  it('a SUPERVISED run on that same card is NOT held back: the fallback reads it and the Ready card enters the cycle, no override announced (AC15: the gate bounds unattended runs)', async () => {
    const output = captureLog()
    const { handler, driveCycle, cardReadiness } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:red' }),
      fs(),
      handler,
    )

    expect(code).toBe(0)
    expect(cardReadiness).toHaveBeenCalledWith('218')
    expect(driveCycle).toHaveBeenCalledTimes(1)
    expect(output()).not.toMatch(/overrid/i)
  })

  it('without the flag the autonomous skip is SAID: it prints ineligible, never routes the card (AC15)', async () => {
    const output = captureLog()
    const { handler, driveCycle, cardReadiness } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: '', autonomous: true }),
      fs(),
      handler,
    )

    expect(code).toBe(0)
    expect(output()).toContain('ineligible')
    expect(driveCycle).not.toHaveBeenCalled()
    expect(cardReadiness).not.toHaveBeenCalled()
  })

  it('--approve-ineligible lets THIS autonomous run through the gate — the override is announced, the Ready card enters the cycle (AC15 per-run override)', async () => {
    const output = captureLog()
    const { handler, driveCycle, cardReadiness } = deps()

    const code = await handleRunCommand(
      parseRunCommand({
        card: '218',
        cardTags: 'risk:red',
        autonomous: true,
        approveIneligible: true,
      }),
      fs(),
      handler,
    )

    expect(code).toBe(0)
    // Announced, never silent: the flag, the card and the label it overrode are on the console.
    expect(output()).toMatch(/overrid/i)
    expect(output()).toContain('--approve-ineligible')
    expect(output()).toContain('risk:green')
    expect(cardReadiness).toHaveBeenCalledWith('218')
    expect(driveCycle).toHaveBeenCalledTimes(1)
  })

  it('--approve-ineligible is never persisted: the policy and the card are untouched, and the NEXT unflagged autonomous run on the same fs is skipped ineligible (AC15 "never a standing change")', async () => {
    const output = captureLog()
    // Any tracker write this CLI could make goes through `gh` (the card's labels, a comment, the
    // body): a recording `gh` FIRST on PATH turns such a write into evidence, and exits non-zero so
    // nothing ever reaches a real tracker.
    const bin = mkdtempSync(join(tmpdir(), 'pair-ac15-override-'))
    const ghLog = join(bin, 'gh.log')
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(ghLog)}\nexit 1\n`)
    chmodSync(join(bin, 'gh'), 0o755)
    vi.stubEnv('PATH', `${bin}:/bin`)
    vi.stubEnv('PAIR_GH_BIN', join(bin, 'gh'))
    try {
      const project = fs()
      const policyPath = `${cwd}/${POLICY_PATH}`
      const policyBefore = project.getContent(policyPath)
      const writes: string[] = []
      for (const method of [
        'writeFile',
        'writeFileBinary',
        'rename',
        'unlink',
        'rm',
        'copy',
      ] as const) {
        const original = project[method].bind(project) as (...a: unknown[]) => Promise<void>
        vi.spyOn(project, method).mockImplementation((async (...a: unknown[]) => {
          writes.push(
            `${method} ${String(a[0])}${a[1] === undefined ? '' : ` → ${String(a[1]).slice(0, 40)}`}`,
          )
          return original(...a)
        }) as never)
      }

      const flagged = deps()
      const first = await handleRunCommand(
        parseRunCommand({
          card: '218',
          cardTags: 'risk:red',
          autonomous: true,
          approveIneligible: true,
        }),
        project,
        flagged.handler,
      )
      expect(first).toBe(0)
      expect(flagged.driveCycle).toHaveBeenCalledTimes(1)
      // Nothing persisted by the flagged run: the policy file is byte-identical and nothing wrote
      // to it; no card write went out through the tracker transport.
      expect(project.getContent(policyPath)).toBe(policyBefore)
      expect(writes.filter(w => w.includes(POLICY_PATH))).toEqual([])
      expect(existsSync(ghLog) ? readFileSync(ghLog, 'utf8') : '').toBe('')

      // The SAME card, the SAME fs, the same labels, the flag NOT repeated: the override is gone.
      const lines = output().length
      const unflagged = deps()
      const second = await handleRunCommand(
        parseRunCommand({ card: '218', cardTags: 'risk:red', autonomous: true }),
        project,
        unflagged.handler,
      )
      expect(second).toBe(0)
      expect(unflagged.driveCycle).not.toHaveBeenCalled()
      expect(unflagged.cardReadiness).not.toHaveBeenCalled()
      expect(flagged.driveCycle).toHaveBeenCalledTimes(1)
      expect(project.getContent(policyPath)).toBe(policyBefore)
      expect(existsSync(ghLog) ? readFileSync(ghLog, 'utf8') : '').toBe('')
      // …and the skip is SAID as what it is (AC15 "skips it as ineligible").
      expect(output().slice(lines)).toContain('ineligible')
    } finally {
      rmSync(bin, { recursive: true, force: true })
    }
  })

  it('--approve-ineligible on a SUPERVISED run changes nothing, so nothing is announced — the run proceeds as it would without it', async () => {
    const output = captureLog()
    const { handler, driveCycle } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:red', approveIneligible: true }),
      fs(),
      handler,
    )

    expect(code).toBe(0)
    expect(driveCycle).toHaveBeenCalledTimes(1)
    expect(output()).not.toMatch(/overrid/i)
  })

  it('a card that CARRIES the label is not held back: the fallback reads it and the Ready card enters the cycle, no override announced', async () => {
    const output = captureLog()
    const { handler, driveCycle, cardReadiness } = deps()

    const code = await handleRunCommand(
      parseRunCommand({ card: '218', cardTags: 'risk:green' }),
      fs(),
      handler,
    )

    expect(code).toBe(0)
    expect(cardReadiness).toHaveBeenCalledWith('218')
    expect(driveCycle).toHaveBeenCalledTimes(1)
    expect(output()).not.toMatch(/overrid/i)
  })

  it('with `## Workflows` ALSO declared, a card without the label is skipped `ineligible` before routing — supervised or autonomous, the cycle never starts (BR3)', async () => {
    captureLog()
    for (const autonomous of [false, true]) {
      const { handler, driveCycle, cardReadiness } = deps()

      const code = await handleRunCommand(
        parseRunCommand({ card: '218', cardTags: 'risk:red', autonomous }),
        fs('## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n'),
        handler,
      )

      expect(code).toBe(0)
      expect(driveCycle).not.toHaveBeenCalled()
      expect(cardReadiness).not.toHaveBeenCalled()
    }
  })
})
