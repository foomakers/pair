import type { StepKind } from './kind'

export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const

export const merge: StepKind = {
  name: 'merge',
  host: true,
  inputs: {
    type: 'object',
    required: ['card', 'pr', 'head'],
    properties: {
      card: { type: 'string', description: 'The card, closed after the merge.' },
      pr: { type: 'integer', description: 'The pull request to merge.' },
      head: { type: 'string', description: 'The head the PR must still have.' },
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
  escalations: [],
}
