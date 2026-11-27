import type { StepKind } from './kind'

export const generic: StepKind = {
  name: 'generic',
  defaultInteractive: false,
  defaultContext: 'handoff',
  inputs: {
    type: 'object',
    description: 'Whatever the launch and the earlier steps produced.',
  },
  outputs: { type: 'object', description: 'The common fields only.' },
  with: { type: 'object', description: 'A free object, passed to the skill as written.' },
  returns: {
    failed: 'The named skill reports unsuccessful work.',
    blocked: 'The named skill lacks a fact, permission or resource it needs.',
    'needs-decision': 'The named skill needs a human to make a choice.',
  },
}
