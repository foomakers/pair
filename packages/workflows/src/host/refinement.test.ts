import { runSteps, type WorkflowHost } from '.'
import { start } from '../engine'
import { createMemoryFiles } from '../engine/memory-files'
import { cardStateOf } from '../grammar'

const dir = '/runs/refinement-12'
const source = (options: string) => ({
  file: 'refinement.yaml',
  text: `version: 1
name: refinement
steps:
  refine: { kind: refine-story${options} }
  tasks: { kind: plan-tasks }
`,
})

describe('refinement kinds (#678 AC-1 and AC-9)', () => {
  it.each([
    ['', 'parked'],
    [', with: { mode: autonomous }', 'done'],
    [', with: { mode: autonomous }', 'parked', 'Which users should see this?'],
  ] as const)('runs %s as %s', async (options, outcome, question?: string) => {
    const files = createMemoryFiles()
    const messages: string[] = []
    await start({ dir, files }, source(options), { card: '12' })
    const result = await runSteps(
      {
        files,
        style: 'instruction',
        isSafeText: () => true,
        async launch(step, message) {
          messages.push(message)
          const output =
            step.kind === 'refine-story'
              ? question === undefined
                ? {
                    status: 'ok',
                    summary: 'Refined',
                    boardStatus: 'Draft',
                    riskTag: 'risk:green',
                    openQuestions: [],
                  }
                : { status: 'needs-human', summary: question }
              : { status: 'ok', summary: 'Planned', boardStatus: 'Draft', tasks: 2 }
          return '```json\n' + JSON.stringify(output) + '\n```'
        },
      },
      dir,
    )
    expect(result.run).toBe(outcome)
    expect(messages).toHaveLength(options === '' ? 0 : question === undefined ? 2 : 1)
    if (options !== '') expect(messages[0]).toContain('$prepare: hold-never')
    if (outcome === 'done') expect(messages[1]).toContain('Copy the exact value into boardStatus')
    if (question !== undefined) expect(result.last?.summary).toBe(question)
  })

  it('sets Ready on successful refinement by default and respects overrides', () => {
    expect(cardStateOf({ kind: 'refine-story' })).toEqual({ state: 'Ready', when: 'end' })
    expect(cardStateOf({ kind: 'refine-story', state: 'Review' })).toEqual({
      state: 'Review',
      when: 'end',
    })
    expect(cardStateOf({ kind: 'refine-story', state: 'none' })).toBeUndefined()
  })

  it.each([true, false])(
    'R744-17: resumes task planning with risk label present: %s',
    async present => {
      const files = createMemoryFiles()
      const run = { dir, files }
      const workflow = source(', state: none, with: { mode: autonomous }')
      const steps: string[] = []
      const riskTag = 'risk:green'
      let labels = [riskTag]
      let boardStatus = 'Draft'
      let timedOut = true
      const host: WorkflowHost = {
        files,
        style: 'instruction',
        isSafeText: () => true,
        async launch(step) {
          steps.push(step.id)
          if (step.kind === 'plan-tasks' && timedOut) return undefined
          const outputs =
            step.kind === 'refine-story' ? { riskTag, openQuestions: [] } : { tasks: 1 }
          return (
            '```json\n' +
            JSON.stringify({ status: 'ok', summary: 'Prepared', boardStatus, ...outputs }) +
            '\n```'
          )
        },
        async readResultFacts() {
          return {
            card: {
              boardStatus,
              labels,
              body: '## Acceptance Criteria\n\n## Technical Analysis\n\n## Assumptions\n\n## Task Breakdown\n\n- [ ] **T-1**: Add a test',
            },
          }
        },
        async confirmReady() {
          boardStatus = 'Ready'
        },
      }
      await start(run, workflow, { card: '12' })
      expect((await runSteps(host, dir)).last?.reason).toBe('no-result')
      expect(boardStatus).toBe('Draft')

      timedOut = false
      if (!present) labels = []
      await start(run, workflow, { card: '12' })
      const result = await runSteps(host, dir)
      expect(steps).toEqual(['refine', 'tasks', 'tasks'])
      expect(result.run).toBe(present ? 'done' : 'failed')
      expect(boardStatus).toBe(present ? 'Ready' : 'Draft')
      if (!present) {
        expect(result.last?.reason).toBe('result-not-confirmed')
        expect(result.last?.detail).toContain('riskTag')
      }
    },
  )
})
