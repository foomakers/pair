import type { KindName } from '../grammar'
import type { StepResult } from '../kinds'
import { matches } from '../select'

export interface ResultFacts {
  readonly head?: string
  /** The adopted label family. An omitted family uses the default; null disables risk tags. */
  readonly riskTagFamily?: string | null
  readonly card?: {
    readonly boardStatus: string | null
    readonly labels: readonly string[]
    readonly body: string
  }
}

export const hasResultFacts = (kind: KindName): boolean =>
  kind === 'implement' || kind === 'refine-story' || kind === 'plan-tasks'

export const unconfirmed = (detail: string): StepResult => ({
  status: 'failed',
  reason: 'result-not-confirmed',
  summary: 'The workflow host could not confirm the step result.',
  detail,
})

export function confirmResult(kind: KindName, result: StepResult, facts: ResultFacts): StepResult {
  if (result.status !== 'ok' || !hasResultFacts(kind)) return result
  if (kind === 'implement') {
    return facts.head !== undefined && facts.head === result['head']
      ? result
      : mismatch('PR head', result['head'], facts.head)
  }
  const card = facts.card
  if (card === undefined || card.boardStatus !== result['boardStatus'])
    return mismatch('boardStatus', result['boardStatus'], card?.boardStatus)
  const body = cleanBody(card.body)
  return kind === 'refine-story'
    ? confirmRefinement(result, card, body, facts.riskTagFamily)
    : confirmTasks(result, body)
}

function mismatch(field: string, expected: unknown, actual: unknown): StepResult {
  return unconfirmed(
    `${field}: declared ${JSON.stringify(expected)}, observed ${JSON.stringify(actual) ?? 'unavailable'}`,
  )
}

const cleanBody = (body: string) =>
  body.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '').replace(/<!--[\s\S]*?-->/g, '')

const RISK_TIERS = ['green', 'yellow', 'red']

function confirmRefinement(
  result: StepResult,
  card: NonNullable<ResultFacts['card']>,
  body: string,
  family: string | null = 'risk',
): StepResult {
  const risk = result['riskTag']
  const observed =
    family === null
      ? []
      : RISK_TIERS.map(tier => `${family}:${tier}`).filter(tag => matches({ has: [tag] }, card))
  if (observed.length !== 1 || risk !== observed[0]) return mismatch('riskTag', risk, card.labels)
  const required = ['Acceptance Criteria', 'Technical Analysis', 'Assumptions']
  const missing = required.find(
    section => !body.split('\n').some(line => line.trimEnd() === `## ${section}`),
  )
  if (missing) return mismatch(missing, 'present', 'missing')
  return result
}

function confirmTasks(result: StepResult, body: string): StepResult {
  const taskSection = /^## Task Breakdown[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1]
  if (taskSection === undefined) return mismatch('Task Breakdown', 'present', 'missing')
  const tasks = new Set(
    [...taskSection.matchAll(/^\s*- \[[ xX]\]\s+\*\*(T-\d+)\*\*:/gm)].map(match => match[1]),
  )
  return tasks.size === result['tasks'] ? result : mismatch('tasks', result['tasks'], tasks.size)
}
