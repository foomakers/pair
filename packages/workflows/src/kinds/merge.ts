import type { StepKind } from './kind'

export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const

export const merge: StepKind = {
  name: 'merge',
  defaultInteractive: false,
  host: true,
  inputs: {
    type: 'object',
    required: ['card', 'pr', 'head'],
    properties: {
      card: { type: 'string', description: 'The card, closed after the merge.' },
      pr: { type: 'integer', description: 'The pull request to merge.' },
      head: { type: 'string', description: 'The head the PR must still have.' },
      reviewedHead: { type: 'string', description: 'The head verified by the review step.' },
      gatedHead: { type: 'string', description: 'The head that passed the gate.' },
      approvedHead: { type: 'string', description: 'The head authorized by the approval step.' },
      approvedPr: { type: 'integer', description: 'The PR authorized by the approval step.' },
      approvedBy: { type: 'string', description: 'The authorized approver.' },
    },
  },
  outputs: {
    type: 'object',
    required: ['merged', 'mergeCommit'],
    properties: {
      merged: { type: 'boolean', description: 'Whether the PR is merged.' },
      mergeCommit: { type: 'string', description: 'The merge commit sha.' },
    },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: {
      method: { enum: MERGE_METHODS, description: 'Merge method. Default `squash`.' },
    },
  },
  returns: {},
}
