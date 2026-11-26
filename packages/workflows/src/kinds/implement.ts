import type { StepKind } from './kind'

export const implement: StepKind = {
  name: 'implement',
  defaultInteractive: false,
  defaultSkill: 'pair-process-implement',
  handoff: 'published-pr',
  inputs: {
    type: 'object',
    required: ['card'],
    properties: { card: { type: 'string', description: 'The card to implement.' } },
  },
  outputs: {
    type: 'object',
    required: ['branch', 'pr', 'head'],
    properties: {
      branch: {
        type: 'string',
        pattern: '^[A-Za-z0-9][A-Za-z0-9._/-]*$',
        description: 'The branch the work is on.',
      },
      pr: { type: 'integer', description: 'The number of the pull request.' },
      head: {
        type: 'string',
        pattern: '^[0-9a-f]{40}$',
        description: 'The pushed head, a 40-hex sha.',
      },
    },
  },
  with: { type: 'object', additionalProperties: false, properties: {} },
  returns: {
    failed:
      'Implementation or verification fails, including a red quality gate whose fix is outside the card.',
    blocked: 'A required fact, permission or resource is unavailable.',
    'needs-decision': 'A decision the card does not record blocks every remaining task.',
  },
}
