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
  /** US-487: entry `--pr` — present only when passed; the cycle enters at `{verify, first, r0}`. */
  readonly pr?: number
  /**
   * US-487: the cycle coordinator's own run identity, `story-<card>` unless `--run-id` overrides it.
   *
   * Defined as a NON-ENUMERABLE own property (see `withRunId` below) so it never appears in a
   * `toEqual` comparison against US-217's original `{ card, tags }` shape — every pre-existing
   * dispatch assertion stays byte-identical — while `dispatch.runId` (property access) still reads
   * it, exactly as `handler.ts` and every new US-487 test do.
   */
  readonly runId: string
  /** US-487: `--rounds` — a positive integer bound, or the literal `'max'` (never widened). */
  readonly rounds?: number | 'max'
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
  /** US-487: `--pr` — meaningful only with `--card` (the cycle coordinator's own entry). */
  pr?: string | number
  /** US-487: `--run-id` — meaningful only with `--card`; defaults to `story-<card>`. */
  runId?: string
  /** US-487: `--rounds` — meaningful only with `--card`. */
  rounds?: string
  /** Reserved until #488 ships per-stage engine/model/effort/timeout overrides. */
  profile?: string
  /** Reserved until #488 ships per-stage engine/model/effort/timeout overrides. */
  workflowConfig?: string
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

/**
 * `runId` is attached as a NON-ENUMERABLE own property, deliberately.
 *
 * `RunDispatchRequest.runId` always defaults to `story-<card>` — even when `--run-id` was never
 * passed (US-487) — but US-217's own pre-existing tests assert the dispatch object `toEqual`s the
 * bare `{ card, tags }` shape for a call that passes neither flag. `toEqual` ignores `undefined`
 * properties, never ABSENT-vs-DEFINED ones, so an enumerable `runId: 'story-217'` would fail every
 * one of those byte-identical assertions. A non-enumerable property is invisible to `toEqual`'s
 * (and `Object.keys`'s) enumeration, while `dispatch.runId` — plain property access, exactly how
 * `handler.ts` and every new US-487 test read it — still returns it.
 */
function withRunId<T extends object>(dispatch: T, runId: string): T & { readonly runId: string } {
  return Object.defineProperty(dispatch, 'runId', {
    value: runId,
    enumerable: false,
    configurable: true,
    writable: false,
  }) as T & { readonly runId: string }
}

/** `--rounds` — a positive integer bound, or the literal `max` (never widened past policy). */
function resolveRounds(raw: string | undefined): number | 'max' | undefined {
  if (raw === undefined) return undefined
  if (raw === 'max') return 'max'
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--rounds must be a positive integer or the literal "max" (received: ${raw})`)
  }
  return value
}

/**
 * `--card-tags`/`--pr`/`--run-id`/`--rounds` are meaningful only once a card is dispatched (T-1,
 * edge case): the card is the unit, and there is nothing for any of them to act on without one.
 */
function assertNoDispatchFlagsWithoutCard(options: ParseRunOptions): void {
  if (options.cardTags !== undefined) {
    throw new Error('--card-tags was passed without --card: there is no card to dispatch')
  }
  if (options.pr !== undefined) {
    throw new Error('--pr was passed without --card: the card is the unit (US-487 edge case)')
  }
  if (options.runId !== undefined) {
    throw new Error('--run-id was passed without --card: there is nothing to run a cycle on')
  }
  if (options.rounds !== undefined) {
    throw new Error('--rounds was passed without --card: the card is the unit (US-487)')
  }
}

function resolveDispatch(options: ParseRunOptions): RunDispatchRequest | undefined {
  const card = identifierText(options.card, '--card')
  if (card === undefined) {
    assertNoDispatchFlagsWithoutCard(options)
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

  const pr = options.pr === undefined ? undefined : parsePositiveInteger('--pr', options.pr)
  const runId =
    options.runId === undefined ? `story-${card}` : identifierText(options.runId, '--run-id')!
  const rounds = resolveRounds(options.rounds)

  const dispatch = {
    card,
    tags: resolveCardTags(options.cardTags),
    ...(pr !== undefined && { pr }),
    ...(rounds !== undefined && { rounds }),
  }
  return withRunId(dispatch, runId)
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
  const trimmed = raw.trim()
  const tags = parseCardTags(trimmed)
  validateTags(tags, raw.trim())
  return tags
}

function parseCardTags(trimmed: string): string[] {
  const looksLikeJson = trimmed.startsWith('[') || trimmed.startsWith('{')
  if (looksLikeJson) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('--card-tags contains invalid JSON')
    }
    if (Array.isArray(parsed) && parsed.every(t => typeof t === 'string')) {
      return parsed
    }
    throw new Error('--card-tags JSON must be a string array')
  }
  return trimmed.split(',').map(tag => tag.trim())
}

function validateTags(tags: string[], rawTrimmed: string): void {
  for (const tag of tags) {
    if (tag.length === 0) {
      throw new Error(`--card-tags contains an empty tag: ${rawTrimmed}`)
    }
    if (!isSafePromptText(tag)) throw new Error(promptSafetyFailure('--card-tags', tag))
  }
}

function resolveScope(options: ParseRunOptions): RunScopeOptions {
  const root = identifierText(options.root, '--root')
  const filter = promptSafeText(options.filter, '--filter')
  return { ...(root && { root }), ...(filter && { filter }) }
}

/**
 * Parses `pair-cli run` options into a typed config. PURE — no filesystem, no PATH probe, no
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

  // Reserved (Assumption 9, US-487): parsed — so `--help` and a caller seeing the flag both make
  // sense — but refused with a pointer, never silently accepted and ignored, until #488 ships
  // per-stage engine/model/effort/timeout overrides.
  if (options.profile !== undefined) {
    throw new Error(
      '--profile is reserved until #488 ships per-stage engine/model/effort/timeout overrides',
    )
  }
  if (options.workflowConfig !== undefined) {
    throw new Error(
      '--workflow-config is reserved until #488 ships per-stage engine/model/effort/timeout overrides',
    )
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
