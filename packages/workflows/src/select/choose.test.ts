import { chooseWorkflow } from './choose'
import { effectiveSelection } from '.'

describe('workflow choice (#678 AC-3)', () => {
  const workflows = [
    { name: 'refinement', selection: effectiveSelection({ filter: { status: ['Draft'] } }) },
    { name: 'quick', selection: effectiveSelection({ filter: { status: ['Ready'] } }) },
    { name: 'other', selection: effectiveSelection({ filter: { status: ['Ready'] } }) },
  ]
  it.each([
    ['Draft', 'refinement'],
    ['Ready', 'quick'],
    ['Done', undefined],
  ])('chooses the first workflow accepting a %s card', (status, name) => {
    expect(chooseWorkflow(workflows, { labels: [], status })?.name).toBe(name)
  })
})
