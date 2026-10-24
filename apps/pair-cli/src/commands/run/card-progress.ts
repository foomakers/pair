import { stageLabel, type RunEvent } from './run-events'

/**
 * One card's live line, fed from the driver (US-573 follow-up): every dispatch, the implementer's
 * current task, the merge steps. Each event carries a plain-words `detail` for the stage it is in;
 * a new stage replaces it, so a detail never outlives its stage.
 */
export interface CardProgress {
  dispatch(next: {
    step: string
    round?: number
    mode?: string
    attempt?: number
    findings?: unknown
    pr?: unknown
  }): void
  /** The implementer's in-progress todo, from the stage's engine stream; shown only while coding. */
  task(text: string): void
  merge(detail: string): void
}

type Next = Parameters<CardProgress['dispatch']>[0]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const DETAIL: Readonly<Record<string, (next: Next) => string>> = {
  prepare: next => `writing tests${tryOf(next)}`,
  validate: next => `checking tests${tryOf(next)}`,
  implement: () => 'coding',
  green: next => {
    const n = Array.isArray(next.findings) ? next.findings.length : 0
    return n > 0 ? `fixing ${plural(n, 'issue')}` : 'fixing'
  },
  verify: next => ((next.round ?? 0) > 0 ? `reviewing · round ${next.round}` : 'reviewing'),
}

const tryOf = (next: Next) => ((next.attempt ?? 1) > 1 ? ` · try ${next.attempt}` : '')

/** The plain-words detail for a dispatched step — no internal stage names. */
export function stageDetail(next: Next): string {
  return DETAIL[next.step]?.(next) ?? next.step
}

export function cardProgress(input: {
  readonly card: string
  readonly title?: string | undefined
  readonly maxFixRounds?: unknown
  readonly onRunEvent: (event: RunEvent) => void
}): CardProgress {
  const { card, title, onRunEvent } = input
  let opened = false
  let stage: string | undefined
  let detail: string | undefined
  let pr: number | undefined
  const send = () => {
    if (!opened) onRunEvent({ event: 'card-start', card, ...(title && { title }) })
    opened = true
    onRunEvent({
      event: 'stage',
      card,
      stage: stage!,
      ...(detail && { detail }),
      ...(pr && { pr }),
    })
  }
  return {
    dispatch: next => {
      if (Number.isInteger(next.pr)) pr = next.pr as number
      stage = stageLabel(next, input.maxFixRounds)
      detail = stageDetail(next)
      send()
    },
    task: text => {
      if (detail === undefined || !detail.startsWith('coding')) return
      const next = `coding · ${text}`
      if (next === detail) return
      detail = next
      send()
    },
    merge: text => {
      stage = 'merge'
      detail = text
      send()
    },
  }
}

/**
 * The in-progress item of a Claude Code `TodoWrite` call in one decoded stream event, or `undefined`.
 * Stream content is untrusted: only a string field is taken, and the renderer sanitizes it.
 */
/** The todo list of one `TodoWrite` tool-use part, or `[]`. */
function todosOf(part: Record<string, unknown> | null): Array<Record<string, unknown> | null> {
  if (part?.['type'] !== 'tool_use' || part['name'] !== 'TodoWrite') return []
  const todos = (part['input'] as { todos?: unknown } | undefined)?.todos
  return Array.isArray(todos) ? (todos as Array<Record<string, unknown> | null>) : []
}

/** The `in_progress` item's text of one `TodoWrite` tool-use part, when the part is one. */
function todoText(part: Record<string, unknown> | null): string | undefined {
  const current = todosOf(part).find(t => t?.['status'] === 'in_progress')
  const text = current?.['activeForm'] ?? current?.['content']
  return typeof text === 'string' && text.trim() ? text.trim() : undefined
}

export function todoInProgress(payload: unknown): string | undefined {
  const content = (payload as { message?: { content?: unknown } } | null)?.message?.content
  if (!Array.isArray(content)) return undefined
  for (const part of content as Array<Record<string, unknown> | null>) {
    const text = todoText(part)
    if (text !== undefined) return text
  }
  return undefined
}
