import type { StepKind } from './kind'

const inputs = {
  type: 'object',
  required: ['card'],
  properties: { card: { type: 'string', description: 'The card to prepare.' } },
} as const

const boardStatus = {
  type: 'string',
  description:
    'The current literal board status read from the card before the host transitions it.',
} as const

export const refineStory: StepKind = {
  name: 'refine-story',
  defaultSkill: 'pair-process-refine-story',
  inputs,
  outputs: {
    type: 'object',
    required: ['boardStatus', 'riskTag', 'openQuestions'],
    properties: {
      boardStatus,
      riskTag: { type: 'string', description: 'The risk label on the card.' },
      openQuestions: { type: 'array', items: { type: 'string' } },
    },
  },
  with: {
    type: 'object',
    additionalProperties: false,
    properties: { mode: { enum: ['interactive', 'autonomous'] } },
  },
  guidance:
    'Pass the card input as $story and $approval: auto and $prepare: hold-never to the skill. Record evidence-backed answers in ## Assumptions. Leave the board transition to the host. Return open product questions in the summary of a needs-human result.',
  escalations: ['A question requires a product decision.'],
}

export const planTasks: StepKind = {
  name: 'plan-tasks',
  defaultSkill: 'pair-process-plan-tasks',
  inputs,
  outputs: {
    type: 'object',
    required: ['boardStatus', 'tasks'],
    properties: { boardStatus, tasks: { type: 'integer', minimum: 1 } },
  },
  with: { type: 'object', additionalProperties: false, properties: {} },
  guidance:
    'Pass the card input as $story and $approval: auto. Write the Task Breakdown and leave the board transition to the host.',
  escalations: ['The task breakdown needs a product decision.'],
}
