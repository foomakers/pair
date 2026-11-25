import { confirmResult } from './confirm'

const body =
  '## Acceptance Criteria\n\n## Technical Analysis\n\n## Assumptions\n\n## Task Breakdown\n\n- [ ] **T-1**: Verify'
const card = { boardStatus: 'Todo', labels: ['risk:green'], body }
const ok = { status: 'ok', summary: 'finished' } as const

describe('host result confirmation (#678 AC-7)', () => {
  it.each(['user story', 'cost:green', 'risk:blue'])(
    'rejects observed label %s as a risk tag (R744-26)',
    riskTag => {
      const result = { ...ok, boardStatus: 'Todo', riskTag, openQuestions: [] }
      const facts = { card: { ...card, labels: [riskTag] } }

      expect(confirmResult('refine-story', result, facts)).toMatchObject({
        status: 'failed',
        reason: 'result-not-confirmed',
        detail: expect.stringContaining('riskTag'),
      })
    },
  )

  it.each([
    [
      'refine-story',
      { ...ok, boardStatus: 'Todo', riskTag: 'risk:green', openQuestions: [] },
      { card },
      undefined,
    ],
    [
      'refine-story',
      { ...ok, boardStatus: 'Todo', riskTag: 'risk:red', openQuestions: [] },
      { card },
      'riskTag',
    ],
    ['plan-tasks', { ...ok, boardStatus: 'Todo', tasks: 1 }, { card }, undefined],
    ['plan-tasks', { ...ok, boardStatus: 'Refined', tasks: 1 }, { card }, 'boardStatus'],
    [
      'plan-tasks',
      { ...ok, boardStatus: 'Todo', tasks: 1 },
      { card: { ...card, body: '' } },
      'Task Breakdown',
    ],
    ['implement', { ...ok, head: 'a'.repeat(40) }, { head: 'b'.repeat(40) }, 'head'],
    ['implement', { ...ok, head: 'a'.repeat(40) }, { head: 'a'.repeat(40) }, undefined],
  ] as const)('checks the %s result against observed facts', (kind, result, facts, mismatch) => {
    const confirmed = confirmResult(kind, result, facts)
    if (mismatch === undefined) expect(confirmed).toBe(result)
    else
      expect(confirmed).toMatchObject({
        status: 'failed',
        reason: 'result-not-confirmed',
        detail: expect.stringContaining(mismatch),
      })
  })
})
