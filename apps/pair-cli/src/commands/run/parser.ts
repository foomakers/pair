import { ENGINE_IDS, isEngineId, type EngineId } from './engines'
import { idSafetyFailure, isSafeId, isSafePromptText, promptSafetyFailure } from './prompt-safety'

/**
 * The perimeter's scope components, expressed with `pair-next`'s OWN frozen parameter names
 * (ADR-017 §1). The driver adds no scoping concept of its own (AC8).
 */
export interface RunScopeOptions {
  root?: string
  filter?: string
}

/**
 * What the engine is asked to run: a skill (named, or resolved by the cascade in T-4) or a
 * verbatim prompt. Discriminated, never an optional bag — a run is one or the other.
 */
export type RunInvocationRequest =
  | { kind: 'skill'; name?: string }
  | { kind: 'prompt'; text: string }

/**
 * The default per-iteration wall-clock bound, in seconds.
 *
 * A MECHANICAL hang guard, not a policy parameter (AC8): the edge-case table forbids an
 * unbounded wait when a headless engine asks for input it can never receive. Policy
 * (eligibility, stop predicate, parallelism, audit) is read from `tech/automation.md` and
 * nothing here duplicates it.
 */
export const DEFAULT_ITERATION_TIMEOUT_SECONDS = 1800

/**
 * What a trigger observed, and the whole of what the dispatcher (US-217) is told about the card.
 *
 * Two facts, both DATA: which card fired, and the labels it carried at that moment. The driver never
 * reads them from a tracker — it holds no host credentials — so the trigger's own thin adapter is
 * what supplies them, and that is what keeps the routing core host-agnostic.
 */
export interface RunDispatchRequest {
  readonly card: string
  /** Empty when the trigger observed no labels: an untagged card routes to nothing, by design. */
  readonly tags: readonly string[]
}

export interface RunCommandConfig {
  command: 'run'
  /** Present only when `--engine` was passed; resolution precedence lives in T-2. */
  engine?: EngineId
  invocation: RunInvocationRequest
  scope: RunScopeOptions
  /** Present only when `--cwd` was passed; otherwise the process working directory. */
  cwd?: string
  /** Present only when `--max-iterations` was passed; the policy supplies the cap otherwise. */
  maxIterations?: number
  /** Explicit opt-in — never inferable from configuration (AC6). */
  autonomous: boolean
  /** Explicit operator authorization to run in a project the engine does not trust (AC6). */
  approveProjectTrust: boolean
  iterationTimeoutSeconds: number
  /** Present only when `--card` was passed: the run is a tag-driven dispatch (US-217). */
  dispatch?: RunDispatchRequest
  /** Resolve, print and exit without spawning anything. */
  dryRun: boolean
}

interface ParseRunOptions {
  engine?: string
  skill?: string
  prompt?: string
  root?: string
  filter?: string
  cwd?: string
  maxIterations?: string | number
  autonomous?: boolean
  approveProjectTrust?: boolean
  iterationTimeout?: string | number
  card?: string
  cardTags?: string
  dryRun?: boolean
}

function parsePositiveInteger(flag: string, raw: string | number): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer (received: ${String(raw)})`)
  }
  return value
}

function optionalText(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`${flag} was passed with an empty value`)
  return trimmed
}

/**
 * An identifier the driver splices into a prompt (`--root`).
 *
 * Content-checked at PARSE time (round 6, Major): `--root` and `--filter` reach `buildPromptText`
 * exactly as the policy-read values do, and were the only two of the five arriving unchecked. Tier 1
 * HALTs on `args.root` failing `isSafeId` for the same reason, and its own `whenToUse` calls these
 * "untrusted adoption/argument data" — the expected caller here is CI/cron, where the value is
 * routinely interpolated from somewhere else.
 */
function identifierText(value: string | undefined, flag: string): string | undefined {
  const trimmed = optionalText(value, flag)
  if (trimmed === undefined) return undefined
  if (!isSafeId(trimmed)) throw new Error(idSafetyFailure(flag, trimmed))
  return trimmed
}

/** Free text the driver splices into a prompt (`--filter`): characters bounded, shape untouched. */
function promptSafeText(value: string | undefined, flag: string): string | undefined {
  const trimmed = optionalText(value, flag)
  if (trimmed === undefined) return undefined
  if (!isSafePromptText(trimmed)) throw new Error(promptSafetyFailure(flag, trimmed))
  return trimmed
}

/** `--skill` and `--prompt` are one choice, not two independent flags. */
function resolveInvocation(options: ParseRunOptions): RunInvocationRequest {
  // The SIXTH prompt-bound value (round 7, Major): a skill name is an identifier the driver
  // splices into the invocation line, and it is also used as a PATH SEGMENT by the probe — so it
  // gets `--root`'s rule, which rejects both the injection payload and the traversal.
  const skill = identifierText(options.skill, '--skill')
  const { prompt } = options
  if (skill !== undefined && prompt !== undefined) {
    throw new Error('--skill and --prompt are mutually exclusive: pass one, not both')
  }
  if (prompt === undefined) return { kind: 'skill', ...(skill && { name: skill }) }
  if (prompt.trim().length === 0) throw new Error('--prompt was passed with an empty value')
  return { kind: 'prompt', text: prompt }
}

function resolveEngineFlag(engine: string | undefined): EngineId | undefined {
  if (engine === undefined) return undefined
  if (!isEngineId(engine)) {
    throw new Error(`Unknown engine '${engine}'. Supported engines: ${ENGINE_IDS.join(', ')}`)
  }
  return engine
}

/**
 * `--card` + `--card-tags` — the dispatch request, or nothing (US-217).
 *
 * `--card-tags` is comma-separated because a trigger renders a label LIST into one argument; a tag
 * may carry spaces (`good first issue`), so the split is on commas alone and each entry is only
 * trimmed. A label carrying a comma is out of support here for the same reason `## Eligibility`
 * HALTs on one: the schema's separator wins, and the fix is to rename or re-project the label.
 *
 * `--skill`, `--prompt` and `--root` alongside `--card` are REFUSED rather than silently ranked: a
 * dispatched card is the WHOLE answer to what the run is about — the mapping says which workflow,
 * and the card itself is the scope that workflow receives (ADR-024 item 7). A second answer to
 * either half is the ambiguity the mapping exists to remove.
 *
 * `--root` is the more dangerous of the three and was the one missing: `--card 217 --root 300`
 * used to parse, and the run then drove the agent over subtree 300 while the audit trail, the
 * on-issue `DISPATCH-RECORD:` comment and the exclusive per-card lock all named 217 — card 300
 * unguarded (its own lock still free, so a second trigger on it starts a second agent on the same
 * branch) and card 217 credited with work nothing did on it. `--filter` is deliberately NOT
 * refused: it narrows which cards a selector picks up *within* the run, it does not name a subject.
 */
const FLAGS_CONFLICTING_WITH_CARD = [
  ['skill', '--skill'],
  ['prompt', '--prompt'],
  ['root', '--root'],
] as const

function resolveDispatch(options: ParseRunOptions): RunDispatchRequest | undefined {
  const card = identifierText(options.card, '--card')
  if (card === undefined) {
    if (options.cardTags !== undefined) {
      throw new Error('--card-tags was passed without --card: there is no card to dispatch')
    }
    return undefined
  }
  // EVERY conflicting flag is named, not just the first one found: an operator who fixes the flag
  // the message named and re-runs into a second refusal learns the rule one flag per attempt.
  const conflicting = FLAGS_CONFLICTING_WITH_CARD.filter(([key]) => options[key] !== undefined).map(
    ([, flag]) => flag,
  )
  if (conflicting.length > 0) {
    throw new Error(
      `--card cannot be combined with ${conflicting.join(' or ')}: a dispatched card is the whole ` +
        'subject of the run. The `## Workflows` mapping in .pair/adoption/tech/automation.md ' +
        'decides which workflow runs, and the card itself is the scope it runs on, passed under ' +
        "that workflow's own name for it. Drop --card to invoke a skill on a scope you choose.",
    )
  }
  return { card, tags: resolveCardTags(options.cardTags) }
}

/**
 * Each observed label, checked by content: they are reported, audited and matched, never executed.
 *
 * An **empty value is not a malformed flag** — it is the observation "this card carries no labels",
 * which is precisely the state AC2 is about and the one every host adapter produces for an
 * unlabelled card (`join(github.event.issue.labels.*.name, ',')` renders `""`). Refusing it would
 * put the opt-in boundary out of reach of the entry point: the commonest card on a board would fail
 * its trigger job instead of being skipped cleanly. It is therefore the one flag on this command
 * where empty is data rather than an error — a HOLE inside a list still is one (below), because
 * there the caller rendered a list and lost an item.
 */
function resolveCardTags(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim().length === 0) return []
  const tags = raw
    .trim()
    .split(',')
    .map(tag => tag.trim())
  for (const tag of tags) {
    // An EMPTY entry is refused rather than filtered away: `auto-dev,,risk:green` is a rendering
    // mistake in whatever built the list, and silently dropping it hides a trigger that is one
    // string-interpolation bug away from passing no tags at all.
    if (tag.length === 0) {
      throw new Error(`--card-tags contains an empty tag: ${raw.trim()}`)
    }
    if (!isSafePromptText(tag)) throw new Error(promptSafetyFailure('--card-tags', tag))
  }
  return tags
}

function resolveScope(options: ParseRunOptions): RunScopeOptions {
  const root = identifierText(options.root, '--root')
  const filter = promptSafeText(options.filter, '--filter')
  return { ...(root && { root }), ...(filter && { filter }) }
}

/**
 * Parses `pair run` options into a typed config. PURE — no filesystem, no PATH probe, no
 * spawn: every resolution (engine, skill, policy) happens later, in modules that take their
 * probes injected.
 *
 * Two defaults are load-bearing and asserted by tests: `autonomous` and
 * `approveProjectTrust` are FALSE with no flags, so the parser can never pre-empt AC6.
 */
export function parseRunCommand(options: ParseRunOptions, args: string[] = []): RunCommandConfig {
  if (args.length > 0) {
    throw new Error(`Command 'run' does not accept positional arguments: ${args.join(', ')}`)
  }

  const engine = resolveEngineFlag(options.engine)
  const cwd = optionalText(options.cwd, '--cwd')
  const dispatch = resolveDispatch(options)

  return {
    command: 'run',
    ...(engine && { engine }),
    ...(dispatch && { dispatch }),
    invocation: resolveInvocation(options),
    scope: resolveScope(options),
    ...(cwd && { cwd }),
    ...(options.maxIterations !== undefined && {
      maxIterations: parsePositiveInteger('--max-iterations', options.maxIterations),
    }),
    autonomous: options.autonomous === true,
    approveProjectTrust: options.approveProjectTrust === true,
    iterationTimeoutSeconds:
      options.iterationTimeout === undefined
        ? DEFAULT_ITERATION_TIMEOUT_SECONDS
        : parsePositiveInteger('--iteration-timeout', options.iterationTimeout),
    dryRun: options.dryRun === true,
  }
}
