import { CHECK_NAMES } from '../checks'
import type { StepKind } from './kind'

export const gate: StepKind = {
  name: 'gate',
  host: true,
  inputs: {
    type: 'object',
    required: ['card'],
    properties: {
      card: { type: 'string', description: 'The card.' },
      pr: { type: 'integer', description: 'The pull request, for the checks that read it.' },
      head: { type: 'string', description: 'The head the earlier steps produced.' },
    },
  },
  outputs: { type: 'object', description: 'The common fields only.' },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: {
      gates: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Keys of the Custom Gate Registry: their commands run in the card worktree, in order. Never a shell line.',
      },
      checks: {
        type: 'array',
        items: { enum: CHECK_NAMES },
        description: `Ready-made checks: ${CHECK_NAMES.join(', ')}.`,
      },
      'timeout-minutes': {
        type: 'integer',
        minimum: 1,
        description: 'How long `ci-green` waits. Default 30.',
      },
    },
  },
  escalations: [],
}
