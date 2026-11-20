import type { KindName } from '../grammar'
import { generic } from './generic'
import { implement } from './implement'
import type { StepKind } from './kind'
import { review } from './review'

export { COMMON_RESULT, STEP_STATUSES, type StepKind, type StepStatus } from './kind'

/** Every kind of grammar v1, by name. */
export const kindByName: Readonly<Record<KindName, StepKind>> = { implement, review, generic }

/** The names of the fields a kind declares in `inputs` or `outputs`. */
export const fieldsOf = (schema: StepKind['inputs']): readonly string[] =>
  Object.keys(schema.properties ?? {})

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim())

/**
 * The Custom Gate Registry of `way-of-working.md`: gate key → command.
 * A registry with no `Key` column, or no registry at all, has no keys.
 */
export function readGateRegistry(text: string): Readonly<Record<string, string>> {
  const lines = text.split('\n')
  const start = lines.findIndex(line => /^#+\s+Custom Gate Registry\s*$/.test(line))
  if (start < 0) return {}
  const rest = lines.slice(start + 1)
  const next = rest.findIndex(line => /^#+\s/.test(line))
  const table = (next < 0 ? rest : rest.slice(0, next)).filter(line => line.trim().startsWith('|'))
  const header = cells(table[0] ?? '')
  const [key, command] = [header.indexOf('Key'), header.indexOf('Command')]
  if (key < 0 || command < 0) return {}
  return Object.fromEntries(
    table
      .slice(2)
      .map(cells)
      .filter(row => row[key])
      .map(row => [row[key], (row[command] ?? '').replace(/^`|`$/g, '')]),
  ) as Record<string, string>
}
