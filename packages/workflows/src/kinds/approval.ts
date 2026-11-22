import type { StepKind } from './kind'

export const approval: StepKind = {
  name: 'approval',
  host: true,
  inputs: {
    type: 'object',
    required: ['card'],
    properties: {
      card: { type: 'string', description: 'The card.' },
      pr: { type: 'integer', description: 'The pull request, whose native reviews count.' },
    },
  },
  outputs: {
    type: 'object',
    properties: { approvedBy: { type: 'string', description: 'The login that approved.' } },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: { question: { type: 'string', description: 'What is asked of the approver.' } },
  },
  escalations: ['Always, until an authorized login approves or rejects.'],
}
