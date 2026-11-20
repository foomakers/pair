import published from '../../../knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-kinds.md?raw'
import { renderKindReference } from './reference'

describe('kind reference page (AC-8)', () => {
  it('is what the kind objects generate — stale: run `pnpm --filter @pair/workflows kinds:reference`', () => {
    expect(published).toBe(renderKindReference())
  })

  it.each(['implement', 'review', 'generic'])('documents the %s kind', kind => {
    expect(renderKindReference()).toContain(`\n## ${kind}\n`)
  })
})
