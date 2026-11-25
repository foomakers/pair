import { parseConfiguration } from '../configuration'
import { parseWorkflow } from '../grammar'
import { effectiveSelection, orderCards } from './'

describe('workflow selection (#678 AC-2 and AC-3)', () => {
  it('replaces selection per key and intersects the command-line filter', () => {
    const workflow = parseWorkflow(
      `version: 1
name: refinement
select:
  filter: { status: [Draft] }
  order: [number]
steps:
  tasks: { kind: plan-tasks }
`,
      'refinement.yaml',
    ).workflow!
    const configuration = parseConfiguration(
      `version: 1
name: local
defaults: { engine: codex }
select:
  filter: { has: [user story], assignee: rucka }
parallel: 3
`,
      'local.yaml',
    ).configuration!
    const selection = effectiveSelection(workflow.select, configuration.select, {
      has: ['team:cli'],
    })
    expect(configuration.parallel).toBe(3)
    expect(selection.order).toEqual(['number'])
    const card = { labels: ['user story', 'team:cli'], assignee: 'rucka', status: 'Ready' }
    expect(selection.accepts(card)).toBe(true)
    expect(selection.accepts({ ...card, labels: ['team:cli'] })).toBe(false)
    expect(selection.accepts({ ...card, labels: ['user story'] })).toBe(false)
  })

  it('ranks priority first and compares card numbers numerically', () => {
    const cards = [
      { id: '2', priority: 2 },
      { id: '34', priority: 1 },
      { id: '9', priority: 1 },
    ]
    expect(orderCards(cards, ['priority', 'number']).map(card => card.id)).toEqual(['9', '34', '2'])
  })
})
