import type { EngineDefinition } from './engines'
import { buildPromptText } from './invocation'
import { isSafeId, isSafePromptText } from './prompt-safety'
import type { RootCandidate } from './root-plan'
import { spawnIteration, type SpawnIterationInput } from './spawn'
import type { IterationResult } from './stream-reader'

/**
 * The `--root --parallel` selection (US-491 AC7) — `pair-next`'s, never this module's.
 *
 * `pair-loop`'s Select phase asks an agent to run `/pair-next --filter <## Eligibility> --root <id>`
 * and to return, per candidate, its prerequisites (with merged status), its touched surface as
 * mutex-resource strings, its `risk:*` label, title and branch. The portable realization is the
 * same request made to ONE fresh engine process, with the answer printed on a single marker line —
 * the `CONTINUE-TOKEN:` idiom, anchored the same way. The answer is untrusted data: every field is
 * validated by type and content before it reaches a plan, an argv or a lock path.
 */

export const CANDIDATES_MARKER = 'PAIR-ROOT-CANDIDATES:'

const MARKER_LINE = /^[ \t]*PAIR-ROOT-CANDIDATES:[ \t]*(\{[^\n\r]*\})[ \t]*$/gm
const MAX_EVENT_DEPTH = 6

export interface SelectionScope {
  readonly root: string
  /** `## Eligibility`, verbatim — passed as `pair-next --filter` exactly as `pair-loop` does. */
  readonly eligibility?: string | undefined
}

/** The prompt: `pair-next`'s own invocation, then the data request `pair-loop`'s Select phase makes. */
export function buildSelectionPrompt(engine: EngineDefinition, scope: SelectionScope): string {
  const invocation = buildPromptText(
    engine,
    { kind: 'skill', name: 'pair-next', source: 'cascade' },
    { root: scope.root, ...(scope.eligibility !== undefined && { filter: scope.eligibility }) },
  )
  return [
    invocation,
    '',
    'This is a READ-ONLY selection for `pair-cli run --root --parallel`: report the candidate set ' +
      'pair-next resolves for this scope and do not invoke the skill it recommends — change no ' +
      'file, no issue, no pull request, no board state.',
    'For every candidate issue also determine: its declared `**Prerequisite Stories**` (with each ' +
      "prerequisite's MERGED status, checked on the code host, never assumed), its declared " +
      'touched-surface (Technical Analysis "Key Components" / task list) rendered as a flat list of ' +
      'mutex-resource strings (skill names, file paths, module names), its `risk:*` label (or ' +
      "'untagged'), every label it carries, its title and its branch name (feature/US-<id>-* " +
      'convention; empty if none exists yet).',
    `Then print, as the LAST line of your answer and on a line of its own, exactly one line: ` +
      `${CANDIDATES_MARKER} {"candidates":[{"id":"<id>","title":"<title>","branch":"<branch>",` +
      `"tier":"<risk:* or untagged>","labels":["<label>"],"mutexResources":["<resource>"],` +
      `"prerequisites":[{"id":"<id>","merged":true}]}]} — single-line JSON, {"candidates":[]} ` +
      'when the scope selects nothing.',
  ].join('\n')
}

function fail(detail: string): never {
  throw new Error(`pair-next selection for --root --parallel is unusable: ${detail}`)
}

function stringArray(value: unknown, field: string, id: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
    fail(`candidate ${id}: \`${field}\` must be a string array`)
  }
  return value as string[]
}

function parseLabels(value: unknown, id: string): string[] {
  const labels = stringArray(value, 'labels', id)
  for (const label of labels) {
    // Forwarded as `--card-tags`, which splits on commas and content-checks each entry: refuse
    // here what the child would refuse, naming the card, rather than failing its process later.
    if (label.includes(',') || !isSafePromptText(label)) {
      fail(`candidate ${id}: label \`${label}\` cannot be forwarded as --card-tags`)
    }
  }
  return labels
}

function parsePrerequisites(value: unknown, id: string): RootCandidate['prerequisites'] {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`candidate ${id}: \`prerequisites\` must be an array`)
  return value.map(entry => {
    const p = entry as { id?: unknown; merged?: unknown }
    if (typeof p?.id !== 'string' || typeof p.merged !== 'boolean') {
      fail(`candidate ${id}: every prerequisite needs a string id and a boolean merged status`)
    }
    return { id: p.id, merged: p.merged }
  })
}

function parseCandidate(entry: unknown): RootCandidate {
  const c = (entry ?? {}) as Record<string, unknown>
  const id = c['id']
  // The id becomes an argv element and a lock-directory name: the `--root` rule, not free text.
  if (typeof id !== 'string' || !isSafeId(id))
    fail(`candidate id ${JSON.stringify(id)} is not a safe id`)
  const text = (field: string): string => {
    const value = c[field] ?? ''
    if (typeof value !== 'string') fail(`candidate ${id}: \`${field}\` must be a string`)
    return value
  }
  return {
    id,
    title: text('title'),
    branch: text('branch'),
    tier: text('tier'),
    labels: parseLabels(c['labels'], id),
    mutexResources: stringArray(c['mutexResources'], 'mutexResources', id),
    prerequisites: parsePrerequisites(c['prerequisites'], id),
  }
}

/** The marker's JSON payload, validated; throws naming what is wrong. */
export function parseCandidates(json: string): RootCandidate[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    fail('the candidates line is not valid JSON')
  }
  const list = (parsed as { candidates?: unknown })?.candidates
  if (!Array.isArray(list)) fail('the candidates line carries no `candidates` array')
  return list.map(parseCandidate)
}

function markerIn(text: string): string | undefined {
  const matches = [...text.matchAll(MARKER_LINE)]
  return matches.at(-1)?.[1]
}

function markerInPayload(payload: unknown, depth: number): string | undefined {
  if (depth > MAX_EVENT_DEPTH) return undefined
  if (typeof payload === 'string') return markerIn(payload)
  const values = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null
      ? Object.values(payload)
      : []
  for (const value of [...values].reverse()) {
    const found = markerInPayload(value, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

/** The candidates one decoded event carries, if any (most recent marker wins, as for the token). */
export function candidatesInEvent(payload: unknown): RootCandidate[] | undefined {
  const json = markerInPayload(payload, 0)
  return json === undefined ? undefined : parseCandidates(json)
}

export interface SelectRootInput extends SelectionScope {
  readonly engine: EngineDefinition
  readonly cwd: string
  readonly autonomyArgs: readonly string[]
  readonly model?: string | undefined
  readonly timeoutSeconds: number
  readonly runIteration?: (input: SpawnIterationInput) => Promise<IterationResult>
}

/** Runs the selection in ONE fresh engine process and returns its candidate set — or throws. */
export async function selectRootCandidates(input: SelectRootInput): Promise<RootCandidate[]> {
  let candidates: RootCandidate[] | undefined
  let invalid: unknown
  const run = input.runIteration ?? spawnIteration
  const result = await run({
    engine: input.engine,
    promptText: buildSelectionPrompt(input.engine, input),
    cwd: input.cwd,
    autonomyArgs: input.autonomyArgs,
    ...(input.model !== undefined && { model: input.model }),
    timeoutSeconds: input.timeoutSeconds,
    onEvent: payload => {
      try {
        candidates = candidatesInEvent(payload) ?? candidates
      } catch (error) {
        invalid = error
      }
    },
  })
  if (result.outcome !== 'success') fail(`the selection process failed (${result.detail})`)
  if (candidates !== undefined) return candidates
  if (invalid !== undefined) throw invalid
  return fail(`the stream carried no ${CANDIDATES_MARKER} line`)
}
