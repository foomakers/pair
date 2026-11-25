import published from '../../../knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-kinds.md?raw'
import { renderKindReference } from './reference'

describe('kind reference page (AC-8)', () => {
  it('is what the kind objects generate — stale: run `pnpm --filter @pair/workflows kinds:reference`', () => {
    expect(published).toBe(renderKindReference())
  })

  it.each(['implement', 'review', 'generic'])('documents the %s kind', kind => {
    expect(renderKindReference()).toContain(`\n## ${kind}\n`)
  })

  it('puts the implement decision case beside its declared status (#728 AC 18)', () => {
    const section = renderKindReference()
      .split('\n## ')
      .find(text => text.startsWith('implement\n'))
    expect(section).toMatch(
      /needs-decision[^\n]*A decision the card does not record blocks every remaining task\./,
    )
  })

  it.each(['gate', 'merge'])('documents no agent return cases for %s (#728 T-3)', kind => {
    const section = renderKindReference()
      .split('\n## ')
      .find(text => text.startsWith(`${kind}\n`))
    expect(section).not.toMatch(/^[ \t]+- [`"]?(failed|blocked|needs-decision)[`"]?:/m)
  })
})
