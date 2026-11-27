import type { StepKind } from './kind'

export const approval: StepKind = {
  name: 'approval',
  defaultInteractive: false,
  defaultContext: 'handoff',
  host: true,
  inputs: {
    type: 'object',
    required: ['card'],
    properties: {
      card: { type: 'string', description: 'The card.' },
      reviewedHead: { type: 'string', description: 'The head verified by a preceding review.' },
      gatedHead: { type: 'string', description: 'The head verified by a preceding gate.' },
      pr: { type: 'integer', description: 'The pull request, whose native reviews count.' },
    },
  },
  outputs: {
    type: 'object',
    properties: {
      approvedBy: { type: 'string', description: 'The login that approved.' },
      approvedHead: {
        type: 'string',
        pattern: '^[0-9a-f]{40}$',
        description: 'The head that was approved.',
      },
      approvedPr: { type: 'integer', description: 'The PR that was approved.' },
    },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: { question: { type: 'string', description: 'What is asked of the approver.' } },
  },
  returns: {
    failed: 'An authorized login rejects the request.',
    'needs-decision': 'An authorized login has yet to approve or reject.',
  },
}
