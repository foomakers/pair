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
    'Do RED, GREEN and REFACTOR in this session, with one commit per task, all on one branch and in one pull request. Attempt every task, in order: never judge the card too big and stop before trying. A task that needs a person (manual, interactive, a real run with human approval) is skipped; a task you attempted and could not finish is parked, left unticked with its reason. Neither is a reason to stop: finish all the others, publish the PR and list the skipped and parked tasks in the result. Return status "ok" when every task that can be automated is done. Return status "failed" only once every task has been attempted and the rest is confirmed not completable, naming each with its reason, after publishing the PR with the finished work. Do not end your turn while a task is not yet attempted. Review findings still open after the PR is published are not a failure: return status "ok", list them in the summary, and leave them to the review and fix steps.',
  escalations: [
    'A decision the card does not record blocks every remaining task.',
    'A quality gate stays red and the fix is outside the card.',
  ],
}
