import { describe, expect, it } from 'vitest'
import { parseRunCommand } from './parser'

describe('workflow scope (#678 AC-2)', () => {
  it('parses a card list and narrowing flags', () => {
    const run = parseRunCommand(
      { card: '12,15,12', filter: 'team:cli', status: 'Draft', parallel: '2' },
      ['refinement'],
    )
    expect(run.workflowBatch).toEqual({
      name: 'refinement',
      cards: ['12', '15'],
      filter: 'team:cli',
      status: 'Draft',
      parallel: 2,
      restart: false,
    })
  })

  it('uses filter to narrow the children of the root', () => {
    const run = parseRunCommand({ root: '641', filter: 'user story' }, ['refinement'])
    expect(run.workflowBatch).toMatchObject({
      name: 'refinement',
      root: '641',
      filter: 'user story',
    })
  })

  it('refuses a card list and root together', () => {
    expect(() => parseRunCommand({ root: '641', card: '12,15' }, ['refinement'])).toThrow(
      /--card.*--root/,
    )
  })
})
