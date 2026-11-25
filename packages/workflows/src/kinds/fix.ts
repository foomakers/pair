import type { StepKind } from './kind'
import { SEVERITIES } from './review'

export const fix: StepKind = {
  name: 'fix',
  defaultSkill: 'pair-process-fix',
  inputs: {
    type: 'object',
    required: ['card', 'pr', 'head', 'findings'],
    properties: {
      card: { type: 'string', description: 'The card the pull request delivers.' },
      pr: { type: 'integer', description: 'The pull request to fix.' },
      head: { type: 'string', description: 'The head the findings are about.' },
      reportPath: { type: 'string', description: 'Local review report for the reviewed head.' },
      findings: {
        type: 'array',
        description: 'The review findings: `id`, `severity`, `title`, `blocking`.',
        items: { type: 'object' },
      },
    },
  },
  outputs: {
    type: 'object',
    required: ['head', 'resolutions'],
    properties: {
      head: {
        type: 'string',
        pattern: '^[0-9a-f]{40}$',
        description: 'The head after the push, or the input head when nothing changed.',
      },
      resolutions: {
        type: 'array',
        description: 'One per finding in scope.',
        items: {
          type: 'object',
          required: ['id', 'status', 'reason'],
          properties: {
            id: { type: 'string' },
            status: { enum: ['resolved', 'not-resolved'] },
            reason: { type: 'string' },
          },
        },
      },
      gateFailures: {
        type: 'array',
        description: 'Failed gates reported when continuation is enabled.',
        items: {
          type: 'object',
          required: ['gate', 'reason'],
          properties: { gate: { type: 'string' }, reason: { type: 'string' } },
        },
      },
    },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: {
      severity: {
        enum: SEVERITIES,
        description:
          "The lowest severity to fix. Default `Minor`, the review's blocking floor. Ignored when `findings` is given.",
      },
      findings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Finding ids. When present only these are fixed.',
      },
      gates: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Keys of the Custom Gate Registry, run in order before the push. Absent or `[]` = none.',
      },
      'continue-on-gate-failure': {
        type: 'boolean',
        description: 'Report failed gates and continue to the normal push. Default: false.',
      },
    },
  },
  escalations: [
    'A remaining finding needs a human decision or action.',
    'A finding contradicts an acceptance criterion of the card.',
  ],
  rule: {
    text: 'The status is "failed", never "ok", when at least one resolution is "not-resolved".',
    broken: ({ resolutions }) => {
      const open = (resolutions as readonly { id: string; status: string }[]).filter(
        one => one.status !== 'resolved',
      )
      return open.length === 0
        ? undefined
        : `status: "ok" with unresolved finding(s) ${open.map(one => one.id).join(', ')}, expected "failed"`
    },
  },
}
