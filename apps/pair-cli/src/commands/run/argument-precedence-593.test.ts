import { describe, expect, it } from 'vitest'
import { createPerimeter } from './perimeter'
import { computeRootPlan, resolveEffectiveLimit, type RootCandidate } from './root-plan'
import { resolveLoopValues } from './loop-report'
import { readAutomationPolicy } from './automation-policy'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { parseRunCommand } from './parser'
import { resolveSelection } from './loop-report'
import { buildPromptText, filterDeliveryFor, selectionDeliveredBy } from './invocation'
import { ENGINES } from './engines'
import type { AutonomyResolution } from './cycle-scripts'

const cards: RootCandidate[] = Array.from({ length: 5 }, (_, i) => ({
  id: String(i + 1),
  title: `Card ${i + 1}`,
  branch: `feature/US-${i + 1}-card`,
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
}))

describe('US-593 argument precedence', () => {
  it.each([1, 5])('uses explicit parallel %i over adopted 3', requested => {
    const plan = computeRootPlan({
      candidates: cards,
      eligibility: 'risk:green',
      maxParallelism: { global: 3, perTier: { 'risk:green': 2 } },
      requested,
    })
    expect(plan.limit.effective).toBe(requested)
    expect(plan.run).toHaveLength(5)
  })

  it('reports the argument as the effective source even when wider than adoption', () => {
    expect(resolveEffectiveLimit({ dependencyAllowed: 5, maxParallelism: 3, requested: 5 })).toMatchObject({
      effective: 5,
      boundBy: ['dependency-allowed', '--parallel'],
    })
    expect(createPerimeter({
      root: '593', cwd: '/tmp', cwdDeclared: false, policyCap: 3, requestedCap: 5,
      invocationKind: 'skill', filterDelivery: 'argument',
    })).toMatchObject({ maxIterations: 5, capSource: '--max-iterations' })
  })

  it('uses explicit iteration limit over adopted stop predicate budget', () => {
    const fs = new InMemoryFileSystemService({
      '/project/.pair/adoption/tech/automation.md': '## Stop Predicate\n\nmax-iterations: 3\n',
    }, '/project', '/project')
    const policy = readAutomationPolicy(fs, '/project')
    const config = parseRunCommand({ root: '593', parallel: '5', maxIterations: '5' })
    expect(resolveLoopValues(config, policy).cap).toEqual({ value: 5, bound: '--max-iterations 5' })
  })

  it('relays argument preset and adopted selectors with their real sources', () => {
    const resolution = { effective: {
      root: { value: '42', source: 'preset full' },
      filter: { value: ['*'], source: 'preset full' },
      assignee: { value: 'rucka', source: 'adoption' },
      status: { value: ['Ready'], source: 'adoption' },
    } } as unknown as AutonomyResolution
    const config = parseRunCommand({ parallel: '5', assignee: 'other' })
    const policy = readAutomationPolicy(new InMemoryFileSystemService({}, '/project', '/project'), '/project')
    expect(resolveSelection(config, policy, resolution)).toEqual({
      root: { value: '42', source: 'preset full' },
      filter: { value: '*', source: 'preset full' },
      assignee: { value: 'other', source: '--assignee' },
      status: { value: 'Ready', source: 'adoption' },
    })
    const invocation = { kind: 'skill' as const, name: 'pair-loop', source: '--skill' as const }
    expect(filterDeliveryFor(invocation)).toBe('argument')
    expect(selectionDeliveredBy(invocation)).toBe(true)
    expect(buildPromptText(ENGINES.claude, invocation, {
      root: '42', filter: '*', assignee: 'other', status: 'Ready',
    })).toContain('--root 42 --filter * --assignee other --status Ready')
  })
})
