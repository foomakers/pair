import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeMutexBatch, computeRootPlan, parseStateOrder, dependencyFilter, resolveCards, resolveMaxParallelism, type RootCandidate } from './root-plan'

/**
 * US-491 AC1/AC3/AC7 — the `--root --parallel` plan is `pair-loop`'s OWN dependency + mutex
 * analysis, never re-derived. Tier 1's helpers are evaluated from its source (the same extraction
 * `tier-parity.test.ts` uses) and run over the same corpus as the TS port: a divergence fails here.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..')
const WORKFLOW = join(REPO_ROOT, '.claude/workflows/pair-loop.js')
const ORCH_MARKER = '// ORCHESTRATION — the unattended fan-out path'

interface Tier1 {
  resolveCards: (cards: unknown[]) => unknown
  dependencyFilter: (cards: unknown[]) => unknown
  computeMutexBatch: (cards: unknown[]) => unknown
  resolveMaxParallelism: (policy: unknown, tiers: string[]) => number
  resolveRunParallelism: (policy: unknown, tiers: string[], requested?: number) => number
}

function tier1(): Tier1 {
  const source = readFileSync(WORKFLOW, 'utf-8').replace(/^export /gm, '')
  if (!source.includes(ORCH_MARKER)) throw new Error(`marker moved in ${WORKFLOW}`)
  const helpers = source.slice(0, source.indexOf(ORCH_MARKER))
  return new Function(
    `${helpers}\nreturn { resolveCards, dependencyFilter, computeMutexBatch, resolveMaxParallelism, resolveRunParallelism }`,
  )() as Tier1
}

it('US-593: workflow parallel argument supersedes adopted global and per-tier limits', () => {
  const policy = { global: 3, perTier: { 'risk:green': 2 } }
  const workflow = tier1()
  expect(workflow.resolveRunParallelism(policy, ['risk:green'], 5)).toBe(5)
  expect(workflow.resolveRunParallelism(policy, ['risk:green'], 1)).toBe(1)
  expect(workflow.resolveRunParallelism(policy, ['risk:green'])).toBe(2)
})

/**
 * A candidate as `pair-next` reports it: its `tier` IS its `risk:*` label, so `labels` carries it
 * (none for an untagged card) — the child `run --card` gates `## Eligibility` on the labels (r0-2).
 */
const card = (id: string, extra: Partial<RootCandidate> = {}): RootCandidate => {
  const tier = extra.tier ?? 'risk:green'
  return {
    id,
    title: `Card ${id}`,
    branch: `feature/US-${id}-x`,
    tier,
    macrostate: 'Ready',
    labels: tier.startsWith('risk:') ? [tier] : [],
    mutexResources: [],
    prerequisites: [],
    ...extra,
  }
}

const CORPUS: Array<[string, RootCandidate[]]> = [
  ['no cards', []],
  ['independent cards', [card('1'), card('2'), card('3')]],
  [
    'unmerged prerequisite',
    [card('1'), card('2', { prerequisites: [{ id: '1', merged: false }] })],
  ],
  ['merged prerequisite', [card('1'), card('2', { prerequisites: [{ id: '9', merged: true }] })]],
  [
    'mutex conflict',
    [
      card('1', { mutexResources: ['skill:a', 'file:x'] }),
      card('2', { mutexResources: ['file:x'] }),
      card('3', { mutexResources: ['skill:b'] }),
    ],
  ],
  ['duplicate + unresolvable', [card('1'), card('1'), card('2', { branch: '' })]],
  [
    'mutex + dependency together',
    [
      card('1', { mutexResources: ['r'] }),
      card('2', { mutexResources: ['r'] }),
      card('3', { prerequisites: [{ id: '1', merged: false }] }),
    ],
  ],
]

describe('root-plan — parity with pair-loop.js (tier 1) over one corpus', () => {
  const t1 = tier1()
  for (const [name, cards] of CORPUS) {
    it(`resolveCards / dependencyFilter / computeMutexBatch agree: ${name}`, () => {
      const r1 = t1.resolveCards(cards) as { resolved: RootCandidate[] }
      const r2 = resolveCards(cards)
      expect(r2).toEqual(r1)
      const d1 = t1.dependencyFilter(r1.resolved) as { allowed: RootCandidate[] }
      const d2 = dependencyFilter(r2.resolved)
      expect(d2).toEqual(d1)
      expect(computeMutexBatch(d2.allowed)).toEqual(t1.computeMutexBatch(d1.allowed))
    })
  }

  it.each([
    [{ global: 3, perTier: {} }, ['risk:green']],
    [{ global: 3, perTier: { 'risk:green': 5 } }, ['risk:green']],
    [{ global: 3, perTier: { 'risk:green': 1 } }, ['risk:green', 'risk:yellow']],
    [{ global: 2, perTier: { 'risk:yellow': 4 } }, ['risk:green']],
    [{ global: 2, perTier: {} }, []],
  ])('resolveMaxParallelism agrees: %j over %j', (policy, tiers) => {
    expect(resolveMaxParallelism(policy, tiers)).toBe(t1.resolveMaxParallelism(policy, tiers))
  })
})

describe('computeRootPlan — AC1 plan, excluded cards reported with a reason, never dropped', () => {
  const policy = { global: 3, perTier: {} }

  it('treats an untagged card as risk:red (fail-safe, as tier 1 does)', () => {
    const plan = computeRootPlan({
      candidates: [card('1', { tier: 'untagged' }), card('2', { tier: '' })],
      eligibility: 'risk:green',
      maxParallelism: policy,
      requested: 3,
    })
    expect(plan.run).toEqual([])
    expect(plan.excluded.map(e => e.reason)).toEqual([
      'not eligible (tier risk:red !== risk:green)',
      'not eligible (tier risk:red !== risk:green)',
    ])
  })
})

describe('computeRootPlan — serial runs ignore mutex (US-590)', () => {
  const shared = [
    card('1', { mutexResources: ['r'] }),
    card('2', { mutexResources: ['r'] }),
    card('3', { mutexResources: ['r'] }),
  ]
  const run = (over: Partial<Parameters<typeof computeRootPlan>[0]>) =>
    computeRootPlan({
      candidates: shared,
      eligibility: 'risk:green',
      maxParallelism: { global: 3, perTier: {} },
      requested: 3,
      ...over,
    })

  it('requested 1 runs every shared-resource card once, in order', () => {
    const plan = run({ requested: 1 })
    expect(plan.run.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(plan.excluded).toEqual([])
    expect(plan.limit.effective).toBe(1)
  })

  it.each([
    { global: 1, perTier: {} },
    { global: 3, perTier: { 'risk:green': 1 } },
  ])('adopted 1 cannot force serial execution of explicit 3', maxParallelism => {
    const plan = run({ maxParallelism })
    expect(plan.run.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(plan.excluded).toEqual([])
  })

  it('concurrency > 1 queues overlapping cards', () => {
    const plan = run({})
    expect(plan.run.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(plan.excluded).toEqual([])
  })

  it('serial never admits a dependency-blocked card sharing resources', () => {
    const plan = run({
      requested: 1,
      candidates: [
        card('1', { mutexResources: ['r'] }),
        card('2', { mutexResources: ['r'], prerequisites: [{ id: '9', merged: false }] }),
      ],
    })
    expect(plan.run.map(c => c.id)).toEqual(['1'])
    expect(plan.excluded[0]!.reason).toContain('blocked by #9')
  })

  it('edge: empty queue', () => {
    expect(run({ requested: 1, candidates: [] }).run).toEqual([])
  })
})

describe('zero merit logic (D18) — the module reads values, it defines no eligibility literal', () => {
  it('carries no risk tier, state name or label literal outside the fail-safe tier', () => {
    const source = readFileSync(join(__dirname, 'root-plan.ts'), 'utf-8')
    const literals = source.match(/'risk:[a-z]+'/g) ?? []
    expect(literals).toEqual(["'risk:red'"])
    expect(source).not.toMatch(/'risk:(green|yellow)'/)
  })
})

it('US-611: prioritizes Review and retains mutex-conflicting cards for a finite run', () => {
  const ready = {
    ...card('598', { mutexResources: ['pair-capability-publish-pr'] }),
    macrostate: 'Ready',
  }
  const review = {
    ...card('589', { mutexResources: ['pair-capability-publish-pr'] }),
    macrostate: 'Review',
  }
  const plan = computeRootPlan({
    candidates: [ready, review],
    eligibility: undefined,
    maxParallelism: { global: 2, perTier: {} },
    requested: 2,
  })
  expect(plan.run.map(c => c.id)).toEqual(['589', '598'])
  expect(plan.excluded).toEqual([])
})

describe('US-611 delivery order and state boundaries', () => {
  const policy = { global: 2, perTier: {} }
  const plan = (candidates: RootCandidate[], stateOrder?: readonly string[]) =>
    computeRootPlan({
      candidates,
      eligibility: undefined,
      maxParallelism: policy,
      requested: 2,
      stateOrder,
    })

  it('keeps input order within each state and puts Draft last', () => {
    expect(
      plan([
        card('1', { macrostate: 'Ready' }),
        card('2', { macrostate: 'Review' }),
        card('3', { macrostate: 'In Progress' }),
        card('4', { macrostate: 'Review' }),
        card('5', { macrostate: 'Draft' }),
        card('6', { macrostate: 'Ready' }),
      ]).run.map(c => c.id),
    ).toEqual(['2', '4', '3', '1', '6', '5'])
  })

  it('honors a complete explicit permutation', () => {
    expect(
      plan(
        [card('1', { macrostate: 'Review' }), card('2', { macrostate: 'Ready' })],
        parseStateOrder('Ready,Review,In Progress'),
      ).run.map(c => c.id),
    ).toEqual(['2', '1'])
  })

  it.each(['Ready', 'Ready,Ready,Review', 'Ready,Review,Done', 'Ready,Review,In progress', ''])(
    'rejects unsupported order %j',
    raw => {
      expect(() => parseStateOrder(raw)).toThrow(/received:/)
    },
  )

  it('excludes unreadable, unmapped and terminal states with actual values', () => {
    const unreadable: RootCandidate = {
      id: '1',
      title: 'Card 1',
      branch: 'feature/US-1-x',
      tier: 'risk:green',
      labels: ['risk:green'],
      mutexResources: [],
      prerequisites: [],
    }
    const result = plan([
      unreadable,
      card('2', { macrostate: 'Unplanned' }),
      card('3', { macrostate: 'Done' }),
      card('4', { macrostate: 'Review' }),
    ])
    expect(result.run.map(c => c.id)).toEqual(['4'])
    expect(result.excluded).toEqual([
      { id: '1', reason: 'state "(unreadable)" is not a runnable mapped macrostate' },
      { id: '2', reason: 'state "Unplanned" is not a runnable mapped macrostate' },
      { id: '3', reason: 'state "Done" is not a runnable mapped macrostate' },
    ])
  })
})
