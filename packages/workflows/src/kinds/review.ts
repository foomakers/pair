import type { StepKind } from './kind'

/** The severities of the review template, most severe first. */
export const SEVERITIES = ['Critical', 'Major', 'Minor'] as const

export const review: StepKind = {
  name: 'review',
  defaultSkill: 'pair-process-review',
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
      reportPath: { type: 'string', description: 'Local report for this PR and reviewed head.' },
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
      publication: {
        enum: ['always', 'first-and-approved', 'never'],
        description:
          'Publish every review, the first and approved reviews, or none. Default: always.',
      },
      blocking: {
        enum: SEVERITIES,
        description:
          "The lowest severity that makes a finding blocking. Default: the review template's blocking floor.",
      },
    },
  },
  returns: {
    failed:
      'A finding is blocking, the verdict is changes-requested, or a required review check fails.',
    blocked:
      'The pull request head moved during review or required review evidence is unavailable.',
    'needs-decision': 'The verdict needs a decision only a person can take.',
  },
  rule: {
    text: 'The status is "failed", never "ok", when at least one finding is blocking or the verdict is "changes-requested".',
    broken: ({ verdict, findings }) => {
      const blocking = (findings as readonly { blocking: boolean }[]).filter(one => one.blocking)
      const found = [
        ...(blocking.length > 0 ? [`${blocking.length} blocking finding(s)`] : []),
        ...(verdict === 'changes-requested' ? ['verdict "changes-requested"'] : []),
      ]
      return found.length === 0
        ? undefined
        : `status: "ok" with ${found.join(' and ')}, expected "failed"`
    },
  },
}
