import { runSteps } from '.'
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
})
