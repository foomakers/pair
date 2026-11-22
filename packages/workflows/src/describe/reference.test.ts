import published from '../../../knowledge-hub/dataset/.pair/knowledge/guidelines/collaboration/automation/workflow-schema.md?raw'
import { renderSchemaReference } from './reference'

describe('schema reference (AC-7)', () => {
  it('matches the validating schemas', () => {
    expect(published).toBe(renderSchemaReference())
  })
})
