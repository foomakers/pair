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
  with: { type: 'object', additionalProperties: false, properties: {} },
  guidance:
    'Do RED, GREEN and REFACTOR in this session, with one commit unless the card asks for more. Do every task that can be automated. A task that needs a person (manual, interactive, a real run with human approval) is skipped, never a reason to stop: finish all the others, publish the PR and list the skipped tasks in the result. Do not end your turn while any automatable task is left: one turn does the whole card, and a partial result is a failure, not a report. Review findings still open after the PR is published are not a failure: return status "ok", list them in the summary, and leave them to the review and fix steps.',
  escalations: [
    'A decision the card does not record blocks every remaining task.',
    'A quality gate stays red and the fix is outside the card.',
  ],
}
