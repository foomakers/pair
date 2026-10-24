import { describe, it, expect } from 'vitest'
import { progressRunEvents, type RunEvent } from './run-events'

// r3-g1: the claude path's progress labels (pair-implement-batch.js dispatch labels) must map the
// way the workflow's own stageLabel does on the PAIR_EVENT path.
const progress = (...labels: string[]) => ({
  type: 'system',
  subtype: 'task_progress',
  workflow_progress: labels.map((label, i) => ({
    type: 'workflow_agent',
    index: i + 1,
    label,
    agentId: `a${i}`,
  })),
})

const eventsOf = (...labels: string[]): RunEvent[] =>
  progressRunEvents(progress(...labels), new Set())

const stageOf = (label: string): string | undefined =>
  eventsOf(label).find(e => e.event === 'stage')?.stage

const FIX_1 = /^fix 1\/(\d+|\?)$/

const PREPARE_573: RunEvent[] = [
  { event: 'card-start', card: '573' },
  { event: 'stage', card: '573', stage: 'prepare' },
]

describe('progressRunEvents label grammar (r3-g1)', () => {
  it('r2-5-w1: prepare:phase #<id> opens card 573 at stage prepare, never a card named "phase"', () => {
    expect(eventsOf('prepare:phase #573')).toEqual(PREPARE_573)
  })

  it('r2-5-i1: prepare:phase then implement:#573 reuse one card — [card-start, prepare, implement]', () => {
    expect(eventsOf('prepare:phase #573', 'implement:#573')).toEqual([
      ...PREPARE_573,
      { event: 'stage', card: '573', stage: 'implement' },
    ])
  })

  it.each([
    'prepare:#573 r1-g1',
    'validate:#573 r1-g1',
    'green:#573 r1-g1',
    'green:#573 r1-g1 attempt 2',
    'prepare:#573 r1-g2 repair',
    'prepare:#573 r1-g1-rev1 revision',
  ])('r2-6-w1: round-1 label %s is fix 1/<max>', label => {
    expect(stageOf(label)).toMatch(FIX_1)
  })

  it('r2-6-b1: round n is carried — r3 is fix 3/<max>', () => {
    expect(stageOf('validate:#573 r3-g2')).toMatch(/^fix 3\/(\d+|\?)$/)
  })

  it('r2-6-b2: an unround (a0) contract stage is implement, as stageLabel round 0', () => {
    expect(stageOf('prepare:#573 a0')).toBe('implement')
    expect(stageOf('validate:#573 a0-rev1')).toBe('implement')
  })

  it.each([
    ['implement:#573', 'implement'],
    ['implement:#573 attempt 2', 'implement'],
    ['verify:#573 r1', 'review'],
    ['verify:#573 r0 reviewer 2', 'review'],
    ['merge:#573', 'merge'],
  ])('r2-6-c1: %s stays %s', (label, stage) => {
    expect(stageOf(label)).toBe(stage)
  })

  it('r2-6-w4: a retry-suffixed round label maps like its unsuffixed form', () => {
    expect(stageOf('green:#573 r1-g1 retry')).toMatch(FIX_1)
  })

  it.each([
    ['implement:#573 retry', 'implement'],
    ['verify:#573 r1 retry', 'review'],
  ])('r2-6-c2: retry-suffixed %s stays %s', (label, stage) => {
    expect(stageOf(label)).toBe(stage)
  })

  it('r2-5-w2: prepare:phase #573 retry maps like prepare:phase #573', () => {
    expect(eventsOf('prepare:phase #573 retry')).toEqual(PREPARE_573)
  })

  it.each([
    'tier:#573',
    'decide:#573 implement',
    'pr-lookup:#573',
    'escalate:#573',
    'pr-state:#573',
    'cascade:#573',
    'merge-check:#573',
    'autonomy:resolve',
  ])('r2-5-c1: relay label %s opens nothing', label => {
    expect(eventsOf(label)).toEqual([])
  })
})
