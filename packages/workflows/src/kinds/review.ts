import type { StepKind } from './kind'

/** The severities of the review template, most severe first. */
export const SEVERITIES = ['Critical', 'Major', 'Minor'] as const

export const review: StepKind = {
  name: 'review',
  defaultUses: 'pair-process-review',
  inputs: {
    type: 'object',
    required: ['card', 'pr', 'head'],
    properties: {
      card: { type: 'string', description: 'The card the pull request delivers.' },
      pr: { type: 'integer', description: 'The pull request to review.' },
      head: { type: 'string', description: 'The head to review.' },
    },
  },
  outputs: {
    type: 'object',
    required: ['verdict', 'reviewedHead', 'findings'],
    properties: {
      verdict: { enum: ['approved', 'changes-requested'] },
      reviewedHead: {
        type: 'string',
        pattern: '^[0-9a-f]{40}$',
        description: 'The head the verdict is about, a 40-hex sha.',
      },
      findings: {
        type: 'array',
        description: 'Every finding. The step is `failed` when at least one is blocking.',
        items: {
          type: 'object',
          required: ['id', 'severity', 'title', 'blocking'],
          properties: {
            id: { type: 'string' },
            severity: { type: 'string' },
            title: { type: 'string' },
            blocking: { type: 'boolean' },
          },
        },
      },
    },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocking: {
        enum: SEVERITIES,
        description:
          "The lowest severity that makes a finding blocking. Default: the review template's blocking floor.",
      },
    },
  },
  escalations: [
    'The verdict needs a decision only a person can take.',
    'The pull request head moved while it was under review.',
  ],
}
