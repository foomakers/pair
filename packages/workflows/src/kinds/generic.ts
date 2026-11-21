import type { StepKind } from './kind'

export const generic: StepKind = {
  name: 'generic',
  inputs: {
    type: 'object',
    description: 'Whatever the launch and the earlier steps produced.',
  },
  outputs: { type: 'object', description: 'The common fields only.' },
  with: { type: 'object', description: 'A free object, passed to the skill as written.' },
  escalations: ['Whatever the skill named by `uses` documents.'],
}
