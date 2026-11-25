import type { KindName } from '../grammar'
import type { StepResult } from '../kinds'
import { matches } from '../select'

export interface ResultFacts {
  readonly head?: string
  readonly card?: {
    readonly boardStatus: string | null
    readonly labels: readonly string[]
    readonly body: string
  }
}

export const hasResultFacts = (kind: KindName) =>
  kind === 'implement' || kind === 'refine-story' || kind === 'plan-tasks'

export const unconfirmed = (detail: string): StepResult => ({
  status: 'failed',
  reason: 'result-not-confirmed',
  summary: 'The workflow host could not confirm the step result.',
  detail,
})

export function confirmResult(kind: KindName, result: StepResult, facts: ResultFacts): StepResult {
  if (result.status !== 'ok' || !hasResultFacts(kind)) return result
  const mismatch = (field: string, expected: unknown, actual: unknown) =>
    unconfirmed(
      `${field}: declared ${JSON.stringify(expected)}, observed ${JSON.stringify(actual) ?? 'unavailable'}`,
    )
  if (kind === 'implement') {
    return facts.head !== undefined && facts.head === result['head']
      ? result
      : mismatch('PR head', result['head'], facts.head)
  }
  const card = facts.card
  if (card === undefined || card.boardStatus !== result['boardStatus'])
    return mismatch('boardStatus', result['boardStatus'], card?.boardStatus)
  const body = card.body
    .replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[^\n]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  if (kind === 'refine-story') {
    const risk = result['riskTag']
    if (typeof risk !== 'string' || !matches({ has: [risk] }, card))
      return mismatch('riskTag', risk, card.labels)
    const required = ['Acceptance Criteria', 'Technical Analysis', 'Assumptions']
    const missing = required.find(
      section => !body.split('\n').some(line => line.trimEnd() === `## ${section}`),
    )
    if (missing) return mismatch(missing, 'present', 'missing')
    return result
  }
  const taskSection = /^## Task Breakdown[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1]
  if (taskSection === undefined) return mismatch('Task Breakdown', 'present', 'missing')
  const tasks = new Set(
    [...taskSection.matchAll(/^\s*- \[[ xX]\]\s+\*\*(T-\d+)\*\*:/gm)].map(match => match[1]),
  )
  return tasks.size === result['tasks'] ? result : mismatch('tasks', result['tasks'], tasks.size)
}
