import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  computeMutexBatch,
  computeRootPlan,
  dependencyFilter,
  describeRootPlan,
  resolveCards,
  resolveEffectiveLimit,
  resolveMaxParallelism,
  type RootCandidate,
} from './root-plan'

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
}

function tier1(): Tier1 {
  const source = readFileSync(WORKFLOW, 'utf-8').replace(/^export /gm, '')
  if (!source.includes(ORCH_MARKER)) throw new Error(`marker moved in ${WORKFLOW}`)
  const helpers = source.slice(0, source.indexOf(ORCH_MARKER))
  return new Function(
    `${helpers}\nreturn { resolveCards, dependencyFilter, computeMutexBatch, resolveMaxParallelism }`,
  )() as Tier1
}

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

describe('resolveEffectiveLimit — min(dependency-allowed, ## Max Parallelism, --parallel)', () => {
  it('names --parallel when it is the smallest', () => {
    expect(
      resolveEffectiveLimit({ dependencyAllowed: 5, maxParallelism: 4, requested: 3 }),
    ).toEqual({
      effective: 3,
      boundBy: ['--parallel'],
      dependencyAllowed: 5,
      maxParallelism: 4,
      requested: 3,
    })
  })

  it('names ## Max Parallelism when the policy is the smallest', () => {
    expect(
      resolveEffectiveLimit({ dependencyAllowed: 5, maxParallelism: 2, requested: 3 }).boundBy,
    ).toEqual(['## Max Parallelism'])
  })

  it('edge: --parallel above the dependency-allowed count resolves to that count, reported', () => {
    const limit = resolveEffectiveLimit({ dependencyAllowed: 2, maxParallelism: 5, requested: 9 })
    expect(limit.effective).toBe(2)
    expect(limit.boundBy).toEqual(['dependency-allowed'])
  })

  it('names every limit that ties at the minimum', () => {
    expect(
      resolveEffectiveLimit({ dependencyAllowed: 3, maxParallelism: 3, requested: 3 }).boundBy,
    ).toEqual(['dependency-allowed', '## Max Parallelism', '--parallel'])
  })

  it('edge: --parallel 1 is not a special case — it is min() resolving to 1', () => {
    expect(
      resolveEffectiveLimit({ dependencyAllowed: 4, maxParallelism: 3, requested: 1 }).effective,
    ).toBe(1)
  })

  it('zero dependency-allowed cards resolves to 0 (nothing to run)', () => {
    expect(
      resolveEffectiveLimit({ dependencyAllowed: 0, maxParallelism: 3, requested: 3 }).effective,
    ).toBe(0)
  })
})

describe('computeRootPlan — AC1 plan, excluded cards reported with a reason, never dropped', () => {
  const policy = { global: 3, perTier: {} }

  it('runs the mutex-safe, dependency-allowed cards and reports each exclusion', () => {
    const plan = computeRootPlan({
      candidates: [
        card('10', { mutexResources: ['skill:a'] }),
        card('11', { mutexResources: ['skill:a'] }),
        card('12', { prerequisites: [{ id: '10', merged: false }] }),
        card('13'),
        card('14', { tier: 'risk:red' }),
      ],
      eligibility: 'risk:green',
      maxParallelism: policy,
      requested: 2,
    })

    expect(plan.run.map(c => c.id)).toEqual(['10', '13'])
    expect(plan.excluded).toEqual([
      { id: '14', reason: 'not eligible (tier risk:red !== risk:green)' },
      { id: '12', reason: 'blocked by #10 (not merged)' },
      { id: '11', reason: 'mutex conflict on skill:a — waits for a later iteration' },
    ])
    expect(plan.limit).toMatchObject({
      effective: 2,
      boundBy: ['dependency-allowed', '--parallel'],
    })
  })

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

  it('AC7: with no ## Eligibility declared it adds no tier filter of its own', () => {
    const plan = computeRootPlan({
      candidates: [card('1', { tier: 'risk:red' }), card('2', { tier: 'risk:yellow' })],
      eligibility: undefined,
      maxParallelism: policy,
      requested: 3,
    })
    expect(plan.run.map(c => c.id)).toEqual(['1', '2'])
  })

  it('applies a per-tier ## Max Parallelism override exactly as tier 1 does', () => {
    const plan = computeRootPlan({
      candidates: [card('1'), card('2'), card('3')],
      eligibility: 'risk:green',
      maxParallelism: { global: 3, perTier: { 'risk:green': 1 } },
      requested: 3,
    })
    expect(plan.limit).toMatchObject({
      effective: 1,
      maxParallelism: 1,
      boundBy: ['## Max Parallelism'],
    })
    // Over-cap cards are QUEUED in the pool, never excluded: --parallel 1 runs them one at a time.
    expect(plan.run.map(c => c.id)).toEqual(['1', '2', '3'])
  })
})

describe('describeRootPlan — printed before any process starts', () => {
  it('names the concurrent set, every exclusion and the binding limit', () => {
    const plan = computeRootPlan({
      candidates: [
        card('1', { mutexResources: ['r'] }),
        card('2', { mutexResources: ['r'] }),
        card('3'),
      ],
      eligibility: 'risk:green',
      maxParallelism: { global: 3, perTier: {} },
      requested: 1,
    })
    const text = describeRootPlan(plan).join('\n')
    expect(text).toContain('Run (2): #1, #3')
    expect(text).toContain('Excluded #2: mutex conflict on r — waits for a later iteration')
    expect(text).toContain(
      'Effective parallelism: 1 = min(dependency-allowed 2, ## Max Parallelism 3, --parallel 1) — bound by --parallel',
    )
  })

  it('edge: every card excluded ⇒ "nothing eligible to run concurrently"', () => {
    const plan = computeRootPlan({
      candidates: [card('1', { prerequisites: [{ id: '0', merged: false }] })],
      eligibility: 'risk:green',
      maxParallelism: { global: 3, perTier: {} },
      requested: 3,
    })
    expect(describeRootPlan(plan).join('\n')).toContain('Nothing eligible to run concurrently')
  })
})

describe('zero merit logic (D18) — the module reads values, it defines no eligibility literal', () => {
  it('carries no risk tier, state name or label literal outside the fail-safe tier', () => {
    const source = readFileSync(join(__dirname, 'root-plan.ts'), 'utf-8')
    const literals = source.match(/'risk:[a-z]+'/g) ?? []
    expect(literals).toEqual(["'risk:red'"])
    expect(source).not.toMatch(/'(Ready|Draft|In Progress|Done)'/)
  })
})
