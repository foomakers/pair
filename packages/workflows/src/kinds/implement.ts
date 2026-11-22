import type { StepKind } from './kind'

export const implement: StepKind = {
  name: 'implement',
  defaultSkill: 'pair-process-implement',
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
  with: {
    type: 'object',
    additionalProperties: false,
    properties: {
      gates: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Keys of the Custom Gate Registry, run before the push. Absent or `[]` = none.',
      },
    },
  },
  guidance: 'Do RED, GREEN and REFACTOR in this session, with one commit unless the card asks for more.',
  escalations: [
    'A task is incomplete or needs a decision the card does not record.',
    'A quality gate stays red and the fix is outside the card.',
  ],
}
