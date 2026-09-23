import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { POLICY_PATH } from './automation-policy'
import { isDorFallbackReason } from './card-entry'
import { handleRunCommand } from './handler'
import { buildCardProcessArgs, type CardProcessRunner } from './parallel'
import { parseRunCommand } from './parser'
import { computeRootPlan } from './root-plan'
import { parseCandidates } from './root-select'

/**
 * US-491 review r0-2 — the plan and the child must agree on `## Eligibility`.
 *
 * The plan filters on the candidate's `tier` field; the child `run --card` gates on the labels it is
 * forwarded as `--card-tags` (`isDorFallbackReason` / `decideDispatch`: the eligibility label must be
 * among the tags). A candidate whose `tier` satisfies `## Eligibility` while its labels do not is
 * planned and printed as Run, spawned, refused by its own child, and reported completed.
 *
 * The oracle runs the real chain: `parseCandidates` (the marker payload) → `computeRootPlan` →
 * `buildCardProcessArgs` → the child's own `parseRunCommand` + `isDorFallbackReason`. It accepts any
 * fix that keeps them in agreement: the card refused at parse naming it, or excluded from the plan
 * with a reason — never planned with an argv whose child gate refuses it.
 */

const payload = (candidate: Record<string, unknown>): string =>
  JSON.stringify({
    candidates: [
      {
        id: '7',
        title: 't',
        branch: 'feature/US-7-x',
        mutexResources: [],
        prerequisites: [],
        ...candidate,
      },
    ],
  })

const operator = (extra: Record<string, unknown> = {}) =>
  parseRunCommand({ root: '66', parallel: '2', autonomous: true, ...extra })

/** The child's own gate over the argv the pool would spawn it with. */
function childAdmits(args: readonly string[], eligibility: string | undefined): boolean {
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name)
    return at < 0 ? undefined : args[at + 1]
  }
  const child = parseRunCommand({
    card: flag('--card')!,
    autonomous: args.includes('--autonomous'),
    approveIneligible: args.includes('--approve-ineligible'),
    iterationTimeout: flag('--iteration-timeout')!,
    ...(flag('--card-tags') !== undefined && { cardTags: flag('--card-tags')! }),
  })
  return isDorFallbackReason({
    reason: 'no-mapping-declared',
    policy: { eligibility } as never,
    tags: child.dispatch!.tags,
    autonomous: child.autonomous,
    approveIneligible: child.approveIneligible === true,
  })
}

type Verdict =
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'excluded'; readonly reason: string }
  | { readonly kind: 'planned'; readonly args: string[]; readonly childAdmits: boolean }

function verdict(json: string, eligibility: string | undefined, extra = {}): Verdict {
  let candidates
  try {
    candidates = parseCandidates(json)
  } catch (error) {
    return { kind: 'refused', message: (error as Error).message }
  }
  const plan = computeRootPlan({
    candidates,
    eligibility,
    maxParallelism: { global: 3, perTier: {} },
    requested: 2,
  })
  const planned = plan.run.find(c => c.id === '7')
  if (planned === undefined) {
    const entry = plan.excluded.find(e => e.id === '7')
    return { kind: 'excluded', reason: entry?.reason ?? '' }
  }
  const args = buildCardProcessArgs(operator(extra), planned, '/p')
  return { kind: 'planned', args, childAdmits: childAdmits(args, eligibility) }
}

/** The finding's ASSERT: refused naming the card, or excluded with a reason — never a doomed Run. */
function expectRefusedOrExcluded(v: Verdict): void {
  if (v.kind === 'planned') {
    expect.fail(
      `#7 planned as Run with argv ${JSON.stringify(v.args)} (child gate admits: ${String(v.childAdmits)})`,
    )
  }
  if (v.kind === 'refused') expect(v.message).toMatch(/\b7\b/)
  else expect(v.reason.trim().length).toBeGreaterThan(0)
}

describe('r0-2: a candidate whose tier meets ## Eligibility but whose labels omit it', () => {
  it('r1-g2-W-nolabels: tier risk:green, no `labels` field, ## Eligibility risk:green ⇒ refused (naming #7) or excluded with a reason', () => {
    expectRefusedOrExcluded(verdict(payload({ tier: 'risk:green' }), 'risk:green'))
  })

  it('r1-g2-W-emptylabels: tier risk:green, labels [] ⇒ refused or excluded', () => {
    expectRefusedOrExcluded(verdict(payload({ tier: 'risk:green', labels: [] }), 'risk:green'))
  })

  it('r1-g2-W-otherlabels: tier risk:green, labels [bug, auto-dev] (no risk label) ⇒ refused or excluded', () => {
    expectRefusedOrExcluded(
      verdict(payload({ tier: 'risk:green', labels: ['bug', 'auto-dev'] }), 'risk:green'),
    )
  })

  it('r1-g2-W-conflict: tier risk:green, labels [risk:yellow] ⇒ refused or excluded', () => {
    expectRefusedOrExcluded(
      verdict(payload({ tier: 'risk:green', labels: ['risk:yellow'] }), 'risk:green'),
    )
  })

  it('r1-g2-I-failsafe: tier untagged, labels [] with ## Eligibility risk:red (the fail-safe tier) ⇒ refused or excluded', () => {
    expectRefusedOrExcluded(verdict(payload({ tier: 'untagged', labels: [] }), 'risk:red'))
  })

  it('r1-g2-C-agree: tier risk:green, labels [risk:green, bug] ⇒ planned, argv forwards risk:green, the child admits it', () => {
    const v = verdict(payload({ tier: 'risk:green', labels: ['risk:green', 'bug'] }), 'risk:green')
    expect(v.kind).toBe('planned')
    if (v.kind !== 'planned') return
    expect(v.args).toContain('--card-tags')
    expect(v.childAdmits).toBe(true)
  })

  it('r1-g2-C-noeligibility: no ## Eligibility, tier risk:green, labels [] ⇒ never a Run the child refuses (no tier guard on either side)', () => {
    const v = verdict(payload({ tier: 'risk:green', labels: [] }), undefined)
    // Refusing it (the finding's "tier not among its labels") is allowed; a doomed Run is not.
    if (v.kind === 'planned') expect(v.childAdmits).toBe(true)
    else if (v.kind === 'refused') expect(v.message).toMatch(/\b7\b/)
    else expect(v.reason.trim().length).toBeGreaterThan(0)
  })

  it('r1-g2-C-ineligible: tier risk:yellow, labels [risk:yellow], ## Eligibility risk:green ⇒ excluded as not eligible (unchanged)', () => {
    const v = verdict(payload({ tier: 'risk:yellow', labels: ['risk:yellow'] }), 'risk:green')
    expect(v).toEqual({
      kind: 'excluded',
      reason: 'not eligible (tier risk:yellow !== risk:green)',
    })
  })

  it('r1-g2-C-untagged: no ## Eligibility, tier untagged / empty with no risk label ⇒ accepted at parse and planned (tier and labels agree: none)', () => {
    for (const tier of ['untagged', '']) {
      const v = verdict(payload({ tier, labels: ['bug'] }), undefined)
      expect(v.kind, `tier ${JSON.stringify(tier)}`).toBe('planned')
      if (v.kind === 'planned') expect(v.childAdmits).toBe(true)
    }
  })

  it('r1-g2-C-approve: --approve-ineligible, tier risk:green, labels [] ⇒ never planned with an argv the child refuses', () => {
    const v = verdict(payload({ tier: 'risk:green', labels: [] }), 'risk:green', {
      approveIneligible: true,
    })
    if (v.kind === 'planned') expect(v.childAdmits).toBe(true)
    else if (v.kind === 'refused') expect(v.message).toMatch(/\b7\b/)
    else expect(v.reason.trim().length).toBeGreaterThan(0)
  })
})

// ── the batch report, end to end through the real handler ──────────────────────────────────────

const cwd = '/project'
const PATH_BEFORE = process.env['PATH']

afterEach(() => {
  vi.restoreAllMocks()
  process.env['PATH'] = PATH_BEFORE
})

describe('r0-2: the batch never reports a card its child refused as completed', () => {
  it('r1-g2-I-report: tier risk:green, no labels, through handleRunCommand ⇒ no spawn whose child gate refuses #7, no "#7: completed" line', async () => {
    process.env['PATH'] = '/bin'
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const spawned: string[][] = []
    const runCardProcess = vi.fn<CardProcessRunner>(async ({ args }) => {
      spawned.push([...args])
      // A child that refuses the card skips cleanly: exit 0, exactly like a completed card.
      return { exitCode: 0, signal: null }
    })
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/config.json`]: JSON.stringify({ asset_registries: {} }),
        '/bin/claude': '',
        [`${cwd}/${POLICY_PATH}`]: '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3\n',
      },
      cwd,
      cwd,
    )

    await handleRunCommand(operator(), fs, {
      selectCandidates: async () => parseCandidates(payload({ tier: 'risk:green' })),
      runCardProcess,
      acquireLock: ({ card: id }) => ({
        kind: 'acquired',
        lock: { path: `/locks/${id}`, release: () => {} },
      }),
      appendAudit: () => {},
    }).catch(() => undefined)

    const doomed = spawned.filter(args => !childAdmits(args, 'risk:green'))
    expect(doomed, 'spawned a child whose own gate refuses the card').toEqual([])
    expect(lines.join('\n')).not.toMatch(/#7: completed/)
  })
})
