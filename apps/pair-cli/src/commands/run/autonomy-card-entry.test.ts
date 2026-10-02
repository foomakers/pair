import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner, type RunHandlerDependencies } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import type { AutonomyResolver } from './autonomy-policy'
import type { AutonomyResolution, CardReadiness } from './cycle-scripts'
import type { DriveCycleInput, DriveCycleResult } from './run-context'
import { CardOutOfScopeError } from './card-readiness'
import { CardUnreadableError } from './cycle-wiring'

/**
 * US-521 remediation r1-g1, finding r0-2 — `pair-cli run --card` resolves (and prints) the autonomy
 * policy ONCE at the `--card` entry, BEFORE the route is chosen: the DoR fallback (Draft ⇒ refine-story,
 * Ready-without-breakdown ⇒ plan-tasks), `--dry-run`, `--pr`, a mapped `## Workflows` route, the
 * unattended skips. A malformed policy HALTs naming the key on every one of them, before anything runs;
 * a well-formed one is printed with its sources on every one of them. Same declared policy, same
 * decision, whichever route the card takes.
 *
 * Hermetic: in-memory project rooted at a real temp dir (so the one row that spawns the REAL
 * `autonomy-policy.mjs` finds it on disk), injected readiness / engine runner / cycle driver / lock /
 * audit, PATH holding only `node` (no `gh`, no engine directory).
 */

const SCRIPT_SRC = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/autonomy-policy.mjs',
)
const HEADER = 'Autonomy (argument > adoption > KB default):'
const MAPPED_POLICY = '## Eligibility\n\nrisk:green\n\n## Workflows\n\nauto-dev ⇒ pair-loop\n'
const ELIGIBILITY = '## Eligibility\n\nrisk:green\n'

let root: string
let bin: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'autonomy-card-entry-')))
  const scripts = join(root, '.claude/skills/pair-workflow-cycle/scripts')
  mkdirSync(scripts, { recursive: true })
  copyFileSync(SCRIPT_SRC, join(scripts, 'autonomy-policy.mjs'))
  bin = join(root, 'bin')
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', bin)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const project = (files: Record<string, string> = {}) =>
  new InMemoryFileSystemService(
    {
      [`${root}/config.json`]: JSON.stringify({
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
      [`${root}/.claude/skills/pair-loop/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-process-refine-story/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-process-plan-tasks/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/SKILL.md`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs`]: '',
      [`${root}/.claude/skills/pair-workflow-cycle/scripts/autonomy-policy.mjs`]: '',
      [`${bin}/claude`]: '',
      ...files,
    },
    root,
    root,
  )

const valid = (over: Partial<AutonomyResolution> = {}): AutonomyResolution => ({
  ok: true,
  active: true,
  policy: {
    until: 'merged',
    prepare: { mode: 'always', has: [], lacks: [] },
    merge: { mode: 'when', has: ['cost:red'], lacks: [] },
  },
  lines: [
    'filter: (all) (default)',
    'until: merged (argument)',
    'merge: when; has: cost:red (argument)',
    'prepare: always (default) — parsed; execution lands in #523 — treated as always',
  ],
  warnings: [],
  errors: [],
  translated: {},
  ...over,
})
/** What the script answers for `## Autonomy filter: PIPPO` and no arguments: ok, NOT active, still printed. */
const inactive = (): AutonomyResolution =>
  valid({
    active: false,
    policy: {
      until: 'pr',
      prepare: { mode: 'always', has: [], lacks: [] },
      merge: { mode: 'always', has: [], lacks: [] },
    },
    lines: [
      'filter: PIPPO (adoption)',
      'until: pr (default)',
      'prepare: always (default) — parsed; execution lands in #523 — treated as always',
      'merge: always (default)',
    ],
  })
const malformed = (): AutonomyResolution =>
  valid({
    ok: false,
    errors: [
      { key: 'merge', reason: 'argument mode "garbage" is not one of always | never | when' },
    ],
  })

interface Harness {
  readonly readiness?: CardReadiness | (() => Promise<CardReadiness>)
  readonly resolver?: AutonomyResolution | 'real'
  readonly files?: Record<string, string>
}

async function run(flags: Record<string, string | boolean>, h: Harness = {}) {
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    stdout.push(args.map(String).join(' '))
  })
  const iterations: Array<Parameters<IterationRunner>[0]> = []
  const driven: DriveCycleInput[] = []
  const resolverCalls: unknown[] = []
  const locks: string[] = []
  const audits: unknown[] = []
  const readinessCalls: string[] = []
  const resolver: AutonomyResolver | undefined =
    h.resolver === undefined || h.resolver === 'real'
      ? undefined
      : input => {
          resolverCalls.push(input.args)
          return h.resolver as AutonomyResolution
        }
  const deps: RunHandlerDependencies = {
    runIteration: async input => {
      iterations.push(input)
      return { outcome: 'success', detail: 'done' }
    },
    acquireLock: ({ card }) => {
      locks.push(card)
      return { kind: 'acquired', lock: { path: `/l/${card}`, release: () => {} } }
    },
    appendAudit: (...args: unknown[]) => {
      audits.push(args)
    },
    cardReadiness: async card => {
      readinessCalls.push(card)
      return typeof h.readiness === 'function' ? await h.readiness() : (h.readiness ?? 'ready')
    },
    driveCycle: async (input): Promise<DriveCycleResult> => {
      driven.push(input)
      return { status: 'ready-for-merge', stagesRun: 0 }
    },
    ...(resolver && { resolveAutonomy: resolver }),
  }
  const outcome = handleRunCommand(
    parseRunCommand({ card: '521', cardTags: '', ...flags }),
    project(h.files),
    deps,
  )
  return { outcome, stdout, iterations, driven, resolverCalls, locks, audits, readinessCalls }
}

/**
 * AC-1 "HALT before any card is touched": the resolution precedes the route choice — no readiness
 * probe, no per-card lock, no start/skip audit record (the `DISPATCH-RECORD:`) for a run that HALTs.
 */
function untouched(r: Awaited<ReturnType<typeof run>>): void {
  expect(r.iterations).toHaveLength(0)
  expect(r.readinessCalls).toHaveLength(0)
  expect(r.locks).toHaveLength(0)
  expect(r.audits).toHaveLength(0)
}

const headerCount = (stdout: string[]) => stdout.filter(line => line.includes(HEADER)).length

describe('r0-2: a malformed autonomy policy HALTs on every --card route, before anything runs', () => {
  it('R2-W1: Draft card (DoR fallback ⇒ refine-story) + malformed --merge ⇒ HALT naming merge, prep skill never invoked', async () => {
    const r = await run({ merge: 'garbage' }, { readiness: 'draft', resolver: malformed() })
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
    expect(r.resolverCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('R2-W2: Ready-without-breakdown (⇒ plan-tasks) + malformed --merge ⇒ HALT, prep skill never invoked', async () => {
    const r = await run(
      { merge: 'garbage' },
      { readiness: 'refined-no-breakdown', resolver: malformed() },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
  })

  it('R2-W4: Ready card --dry-run + malformed --merge ⇒ HALT naming merge (never exit 0)', async () => {
    const r = await run({ merge: 'garbage', dryRun: true }, { resolver: malformed() })
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.driven).toHaveLength(0)
  })

  it('R2-W6: --pr entry --dry-run + malformed --merge ⇒ HALT naming merge', async () => {
    const r = await run({ merge: 'garbage', dryRun: true, pr: '525' }, { resolver: malformed() })
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.driven).toHaveLength(0)
  })

  it('R2-W7: mapped `## Workflows` route + malformed --merge ⇒ HALT naming merge, mapped workflow never spawned', async () => {
    const r = await run(
      { merge: 'garbage', cardTags: 'auto-dev,risk:green' },
      { resolver: malformed(), files: { [`${root}/${POLICY_PATH}`]: MAPPED_POLICY } },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
  })

  it('R2-W10: --autonomous Draft card (unattended prep skip) + malformed --merge ⇒ HALT, not a clean skip', async () => {
    const r = await run(
      { merge: 'garbage', autonomous: true },
      { readiness: 'draft', resolver: malformed() },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
  })

  it('R2-W11: --autonomous ineligible skip (`## Eligibility` label absent) + malformed --merge ⇒ HALT, not exit 0', async () => {
    const r = await run(
      { merge: 'garbage', autonomous: true, cardTags: 'risk:red' },
      {
        readiness: 'draft',
        resolver: malformed(),
        files: { [`${root}/${POLICY_PATH}`]: ELIGIBILITY },
      },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
  })

  it('R2-W9: the REAL shared script, Draft card + --merge garbage ⇒ HALT naming merge, prep skill never invoked', async () => {
    const r = await run({ merge: 'garbage' }, { readiness: 'draft', resolver: 'real' })
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
    expect(r.iterations).toHaveLength(0)
  })

  it('R2-W13: clean skip — card out of scope (readiness probe throws CardOutOfScopeError) + malformed --merge ⇒ HALT naming merge, no skip audited', async () => {
    const r = await run(
      { merge: 'garbage' },
      {
        readiness: async () => {
          throw new CardOutOfScopeError('card 521 is Done — out of scope')
        },
        resolver: malformed(),
      },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
  })

  it('R2-W14: clean skip — no mapping declared, card unreadable (CardUnreadableError) + malformed --merge ⇒ HALT naming merge, no skip audited', async () => {
    const r = await run(
      { merge: 'garbage' },
      {
        readiness: async () => {
          throw new CardUnreadableError('gh is not authenticated')
        },
        resolver: malformed(),
      },
    )
    await expect(r.outcome).rejects.toThrow(/`merge`/)
    untouched(r)
  })
})

describe('r0-2: a well-formed policy is printed with its sources on every --card route', () => {
  it('R2-W3: Draft card ⇒ the Autonomy block is printed once, then the prep skill runs', async () => {
    const r = await run({ until: 'merged' }, { readiness: 'draft', resolver: valid() })
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.stdout.join('\n')).toMatch(/until: merged \(argument\)/)
    expect(r.iterations).toHaveLength(1)
  })

  it('R2-W5: Ready card --dry-run ⇒ the Autonomy block is printed, nothing driven', async () => {
    const r = await run({ until: 'merged', dryRun: true }, { resolver: valid() })
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.stdout.join('\n')).toMatch(/merge: when; has: cost:red \(argument\)/)
    expect(r.driven).toHaveLength(0)
  })

  it('R2-W8: mapped route --dry-run ⇒ the Autonomy block is printed', async () => {
    const r = await run(
      { until: 'merged', dryRun: true, cardTags: 'auto-dev,risk:green' },
      { resolver: valid(), files: { [`${root}/${POLICY_PATH}`]: MAPPED_POLICY } },
    )
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.stdout.join('\n')).toMatch(/until: merged \(argument\)/)
  })

  it('R2-W12: --pr entry --dry-run ⇒ the Autonomy block is printed', async () => {
    const r = await run({ until: 'merged', dryRun: true, pr: '525' }, { resolver: valid() })
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
  })

  it('R2-W15: Draft card + INACTIVE ok resolution (adoption-sourced values) ⇒ the Autonomy block is printed exactly once', async () => {
    const r = await run({}, { readiness: 'draft', resolver: inactive() })
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.stdout.join('\n')).toMatch(/filter: PIPPO \(adoption\)/)
    expect(r.iterations).toHaveLength(1)
  })

  it('R2-W16: Ready card --dry-run + INACTIVE ok resolution ⇒ the Autonomy block is printed exactly once', async () => {
    const r = await run({ dryRun: true }, { resolver: inactive() })
    expect(await r.outcome).toBe(0)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.stdout.join('\n')).toMatch(/filter: PIPPO \(adoption\)/)
  })
})

describe('r0-2 controls: resolved ONCE, the cycle route and default-off unchanged', () => {
  it('R2-C1: Ready card live ⇒ resolver called exactly once, block printed once, active policy forwarded', async () => {
    const r = await run({ until: 'merged' }, { resolver: valid() })
    expect(await r.outcome).toBe(0)
    expect(r.resolverCalls).toHaveLength(1)
    expect(headerCount(r.stdout)).toBe(1)
    expect(r.driven[0]?.autonomy).toEqual({ policy: valid().policy })
  })

  it('R2-C2: default off — Draft card, nothing declared, inactive resolution ⇒ the prep skill runs, exit 0', async () => {
    const r = await run({}, { readiness: 'draft', resolver: valid({ active: false }) })
    expect(await r.outcome).toBe(0)
    expect(r.iterations).toHaveLength(1)
  })
})
