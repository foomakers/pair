import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import { policyHalt, sectionLines } from './policy-sections'

/**
 * US-576 AC7: `## Working Cleanup` — `cleanup: never | on-close | after <n>d|h|m` (default `after 7d`). At the start
 * of `pair run`, the run state (`runs/<run>/<card>/**`) and checkpoint of every card Done for longer than the duration
 * is removed. An open card (parked, escalated, failed, reopened) or one whose state cannot be read is never touched,
 * and nothing outside `runs/` and `checkpoints/` (the loop audit) ever is.
 */
export type WorkingCleanup =
  | { readonly mode: 'never'; readonly text: string }
  | { readonly mode: 'after'; readonly ms: number; readonly text: string }

const UNIT_MS: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000 }
export const DEFAULT_CLEANUP: WorkingCleanup = { mode: 'after', ms: 7 * UNIT_MS['d']!, text: 'after 7d' }

export function readWorkingCleanup(markdown: string | undefined): WorkingCleanup {
  const lines = markdown === undefined ? undefined : sectionLines(markdown, 'Working Cleanup')
  if (lines === undefined) return DEFAULT_CLEANUP
  const value = lines.length === 1 ? /^cleanup:\s*(.+)$/.exec(lines[0]!)?.[1]?.trim() : undefined
  if (value === 'never') return { mode: 'never', text: value }
  if (value === 'on-close') return { mode: 'after', ms: 0, text: value }
  const after = value === undefined ? null : /^after (\d+)([dhm])$/.exec(value)
  if (after) return { mode: 'after', ms: Number(after[1]) * UNIT_MS[after[2]!]!, text: value! }
  return policyHalt(
    `\`## Working Cleanup\` declares ${JSON.stringify(lines.join(' / '))}, expected one line \`cleanup: never | on-close | after <n>d|h|m\``,
  )
}

/** When the card was closed as Done; `null` = not Done (open, reopened); `undefined` = unreadable. */
export type CardClosedAt = (card: string) => Date | null | undefined

const dirs = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path).filter(name => statSync(join(path, name)).isDirectory())
    : []

/** Removes the Done cards' run state; returns the card ids removed. */
export function sweepWorkingArea(input: {
  readonly workingArea: string
  readonly policy: WorkingCleanup
  readonly closedAt: CardClosedAt
  readonly now: Date
}): string[] {
  const { policy } = input
  if (policy.mode === 'never') return []
  const runs = join(input.workingArea, 'runs')
  const removed: string[] = []
  const verdict = new Map<string, boolean>()
  const expired = (card: string): boolean => {
    if (!verdict.has(card)) {
      const at = input.closedAt(card)
      verdict.set(card, at instanceof Date && input.now.getTime() - at.getTime() >= policy.ms)
    }
    return verdict.get(card)!
  }
  for (const run of dirs(runs)) {
    for (const card of dirs(join(runs, run)).filter(expired)) {
      rmSync(join(runs, run, card), { recursive: true, force: true })
      rmSync(join(input.workingArea, 'checkpoints', `${card}.md`), { force: true })
      if (!removed.includes(card)) removed.push(card)
    }
    if (dirs(join(runs, run)).length === 0 && readdirSync(join(runs, run)).length === 0)
      rmSync(join(runs, run), { recursive: true, force: true })
  }
  return removed
}
