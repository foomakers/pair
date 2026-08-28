/**
 * The deterministic half of the Codex in-harness fan-out realization (US-441).
 *
 * WHY A MODULE AND NOT PROSE. Claude Code's tier-1 realization is a JS workflow: its
 * arithmetic, its packet assembly and its result validation are executed, not narrated.
 * Codex has no workflow runtime — its orchestrator is the model itself — so the same
 * determinism has to come from somewhere else. It comes from here: everything in a fan-out
 * iteration that is a RULE rather than a judgement lives in this file, is unit-tested, and
 * is invoked by the `pair-loop` skill as a command. What stays with the model is exactly
 * the part only the model can do — calling the harness's own `spawn`/`wait` tools.
 *
 * The split follows the precedent this repo already set for gate tooling
 * (ADL 2026-07-13 + ADR-023): ONE tested source, shipped as a GENERATED KB asset
 * (`.pair/knowledge/assets/codex-fanout.cjs`) rather than as a second CLI command. The
 * module therefore imports node builtins only — a single-file transpile is a complete
 * program, and no bundler enters the dependency tree.
 *
 * WHAT IT IS NOT. It selects no card, classifies nothing, and owns no policy knob.
 * Eligibility, dependency and mutex analysis, the stop predicate and auto-advance stay with
 * `pair-loop`; this file is handed their results and does arithmetic on them.
 *
 * CLI (one JSON request on stdin, one JSON response on stdout; exit 1 on a rejection):
 *   bind    — probe result in, bound realization + announcement out
 *   cap     — the three ceilings in, the effective cap + the binding one out
 *   packet  — a role + one card in, the spawn packet out (or a pre-spawn rejection)
 *   collect — a raw subagent return in, a terminal phase outcome out
 *   converge— a review's return in, out: converged | one fix round then a RE-review | escalate
 *   audit   — records in, appended to disk, read back, confirmed (or a loud failure)
 *   resume  — an audit file in, the per-card phase state out
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, normalize } from 'node:path'

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE HARNESS SURFACE MAP — data, and the only place a vendor name appears
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The capability's tiers, in preference order. Named here so the cascade below reads them
 * rather than restating them, and so a caller that degrades can say WHICH tier it took.
 */
export const REALIZATION_TIERS = Object.freeze({
  IN_HARNESS: 1,
  EXTERNAL_DRIVER: 2,
  DEGRADED: 3,
} as const)

/** What a fan-out realization must be able to do, in the capability's own vocabulary. */
export interface RealizationHandles {
  /** Starts one subagent from an explicit packet. Required — no spawn, no realization. */
  readonly spawn: string
  /** Blocks for a started subagent's result, under a timeout. Required. */
  readonly wait: string
  /** Ends a subagent the orchestrator no longer waits for. Optional. */
  readonly cancel?: string
  /** Re-attaches to a subagent after an interruption. Optional. */
  readonly resume?: string
}

export interface RealizationDefinition {
  readonly id: string
  readonly tier: number
  /** Harness the entry belongs to — printed in the announcement, never probed for. */
  readonly harness: string
  /**
   * Tool-name prefix the handles live under, when the harness namespaces them. An EMPTY
   * string means un-namespaced. A harness whose namespace is itself configurable is probed
   * through `namespaceKey`, never through this default.
   */
  readonly namespace: string
  /** Config key that can rename `namespace` at runtime, when the harness has one. */
  readonly namespaceKey?: string
  readonly handles: RealizationHandles
  /** Feature key that gates the mechanism, and whether the harness ships it on. */
  readonly gating: { readonly featureKey: string; readonly defaultOn: boolean }
  /** Ceilings the harness imposes. Composed with policy — never replacing it. */
  readonly bounding: {
    readonly concurrencyKey: string
    readonly waitTimeoutKeys: {
      readonly min: string
      readonly max: string
      readonly default: string
    }
  }
  /** Which product build this entry was read off, and when. Read by the next maintainer. */
  readonly verifiedAgainst: string
}

/**
 * Codex's second-generation multi-agent toolset. Higher preference than the first because
 * its namespace and its bounds are configurable, so a session that exposes it exposes the
 * knobs the cap arithmetic and the wait bounds want.
 */
const CODEX_MULTI_AGENT_V2: RealizationDefinition = {
  id: 'codex-multi-agent-v2',
  tier: REALIZATION_TIERS.IN_HARNESS,
  harness: 'codex',
  namespace: '',
  namespaceKey: 'features.multi_agent_v2.tool_namespace',
  handles: { spawn: 'spawn', wait: 'wait', cancel: 'interrupt_agent' },
  gating: { featureKey: 'features.multi_agent_v2', defaultOn: false },
  bounding: {
    concurrencyKey: 'features.multi_agent_v2.max_concurrent_threads_per_session',
    waitTimeoutKeys: {
      min: 'features.multi_agent_v2.min_wait_timeout_ms',
      max: 'features.multi_agent_v2.max_wait_timeout_ms',
      default: 'features.multi_agent_v2.default_wait_timeout_ms',
    },
  },
  verifiedAgainst: 'codex-cli 0.149.0 — `codex features list` (stable, default off), 2026-08-22',
}

/**
 * Codex's first-generation multi-agent toolset: stable and on by default at the build this
 * entry was verified against, which is why it is the one a bare session is expected to bind.
 */
const CODEX_MULTI_AGENT_V1: RealizationDefinition = {
  id: 'codex-multi-agent-v1',
  tier: REALIZATION_TIERS.IN_HARNESS,
  harness: 'codex',
  namespace: '',
  handles: {
    spawn: 'spawn_agent',
    wait: 'wait_agent',
    cancel: 'close_agent',
    resume: 'resume_agent',
  },
  gating: { featureKey: 'features.multi_agent', defaultOn: true },
  bounding: {
    concurrencyKey: 'agents.max_concurrent_threads_per_session',
    waitTimeoutKeys: {
      min: 'features.multi_agent_v2.min_wait_timeout_ms',
      max: 'features.multi_agent_v2.max_wait_timeout_ms',
      default: 'features.multi_agent_v2.default_wait_timeout_ms',
    },
  },
  verifiedAgainst: 'codex-cli 0.149.0 — `codex features list` (stable, default on), 2026-08-22',
}

/**
 * THE surface map. Ordered: the cascade binds the first entry the probe confirms.
 *
 * A rename on the vendor's side is an edit to this array and to nothing else — the rule the
 * harness-realization convention states, and the reason the far side's observed churn (two
 * coexisting toolsets, one default-off, a third mechanism already withdrawn) does not reach
 * the logic below.
 */
export const HARNESS_SURFACE_MAP: readonly RealizationDefinition[] = Object.freeze([
  CODEX_MULTI_AGENT_V2,
  CODEX_MULTI_AGENT_V1,
])

// ═══════════════════════════════════════════════════════════════════════════
// 2. PROBE → BIND → ANNOUNCE → DEGRADE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What the orchestrator observed in ITS OWN session, and nothing else.
 *
 * `tools` is the list of tool names actually exposed to the running model. It is the only
 * admissible evidence: a product name, a version string and a config key that merely COULD
 * enable the mechanism are all inadmissible, and none of them has a field here to be passed
 * in — the shape is the rule.
 */
export interface ProbeObservation {
  readonly tools?: readonly string[]
  /** A resolved namespace override, when the session reports one. */
  readonly namespace?: string
  /** Concurrency ceiling the session reports, when it reports one. */
  readonly harnessCeiling?: number
  /** Whether an external driver (tier 2) is available to this caller. */
  readonly externalDriverAvailable?: boolean
}

export interface Binding {
  readonly tier: number
  readonly realization: string
  /** The primitive pair actually bound to — the spawn handle, fully qualified. */
  readonly primitive: string | null
  readonly reason: string
  readonly announcement: string
  /** Harness ceiling the binding contributes to the cap arithmetic, when observed. */
  readonly harnessCeiling: number | null
}

function qualify(namespace: string, handle: string): string {
  return namespace === '' ? handle : `${namespace}.${handle}`
}

/**
 * A realization is confirmed only when BOTH required handles are exposed under its namespace.
 *
 * The probe's `namespace` is a report about the entry that HAS a renameable namespace, so it
 * is applied only to entries declaring `namespaceKey`. Applying it to every entry made a
 * session exposing the default-on, un-namespaced toolset while reporting the other one's
 * configured namespace match nothing at all — a false-negative degradation that cost the whole
 * tier-1 fan-out on a session that had it.
 */
function matchRealization(
  def: RealizationDefinition,
  exposed: ReadonlySet<string>,
  namespaceOverride?: string,
): { spawn: string; wait: string } | null {
  const renameable = typeof def.namespaceKey === 'string' && def.namespaceKey !== ''
  const ns = renameable && typeof namespaceOverride === 'string' ? namespaceOverride : def.namespace
  const spawn = qualify(ns, def.handles.spawn)
  const wait = qualify(ns, def.handles.wait)
  return exposed.has(spawn) && exposed.has(wait) ? { spawn, wait } : null
}

const DEGRADED_REASON =
  'no fan-out primitive is exposed in this session — availability is established by probing ' +
  'the tools the session actually offers, never by the product name or a version'

function degrade(probe: ProbeObservation): Binding {
  const external = probe.externalDriverAvailable === true
  const tier = external ? REALIZATION_TIERS.EXTERNAL_DRIVER : REALIZATION_TIERS.DEGRADED
  const realization = external ? 'external-driver' : 'degraded-one-card'
  const next = external
    ? 'degrading to the external driver: one fresh process per iteration, re-invoked on the continue-token'
    : 'degrading to the one-card path: exactly one eligible card driven to its gate, then a continue-token'
  return {
    tier,
    realization,
    primitive: null,
    reason: `${DEGRADED_REASON}; ${next}`,
    announcement: `fan-out realization: ${realization} (tier ${tier}) — ${next}`,
    harnessCeiling: null,
  }
}

/**
 * The cascade. Positive evidence only: an unrecognised or absent probe reads as ABSENT, and
 * the run degrades in the declared order rather than iterating several cards in one context —
 * a degradation that dropped that invariant would be the defect the tiers exist to prevent.
 */
export function resolveRealization(probe: ProbeObservation): Binding {
  const exposed = new Set((probe.tools ?? []).filter(t => typeof t === 'string'))
  for (const def of HARNESS_SURFACE_MAP) {
    const hit = matchRealization(def, exposed, probe.namespace)
    if (!hit) continue
    const ceiling = Number.isInteger(probe.harnessCeiling) ? (probe.harnessCeiling as number) : null
    const reason =
      `probed this session: \`${hit.spawn}\` and \`${hit.wait}\` are both exposed ` +
      `(gated by \`${def.gating.featureKey}\`, default ${def.gating.defaultOn ? 'on' : 'off'}; ` +
      `verified against ${def.verifiedAgainst})`
    return {
      tier: def.tier,
      realization: def.id,
      primitive: hit.spawn,
      reason,
      announcement: `fan-out realization: ${def.id} (tier ${def.tier}, ${def.harness}) — bound to \`${hit.spawn}\`/\`${hit.wait}\`; ${reason}`,
      harnessCeiling: ceiling,
    }
  }
  return degrade(probe)
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CAP ARITHMETIC — three ceilings compose, this file adds none
// ═══════════════════════════════════════════════════════════════════════════

export interface Ceilings {
  /** How many cards the dependency + mutex analysis allows to run together. */
  readonly dependencyAllowed: number
  /** `## Max Parallelism` from the policy, already resolved by the loop. */
  readonly policyMax: number
  /** The harness's own concurrency ceiling, when the probe observed one. */
  readonly harnessCeiling?: number | null
}

export interface EffectiveCap {
  readonly cap: number
  readonly boundBy: 'dependency' | 'policy' | 'harness'
  readonly line: string
}

interface Ceiling {
  readonly source: EffectiveCap['boundBy']
  readonly value: number
}

function ceilingEntries(c: Ceilings): readonly Ceiling[] {
  const entries: Ceiling[] = [
    { source: 'dependency', value: c.dependencyAllowed },
    { source: 'policy', value: c.policyMax },
  ]
  if (typeof c.harnessCeiling === 'number')
    entries.push({ source: 'harness', value: c.harnessCeiling })
  return entries
}

/**
 * `min(dependency-allowed, max_parallelism, harness ceiling)`, and WHICH of the three bound
 * it. A run capped by the harness and a run capped by policy are different situations for
 * whoever reads the output, so the binding limit is part of the result, not a log line.
 *
 * Ties resolve to the FIRST source in the declared order. That is deliberate rather than
 * arbitrary: the dependency analysis is the loop's own computation and the policy is the
 * team's, so a tie is attributed to the limit the reader can act on.
 */
export function effectiveParallelism(c: Ceilings): EffectiveCap {
  const entries = ceilingEntries(c)
  for (const entry of entries)
    if (!Number.isInteger(entry.value) || entry.value < 0)
      throw new Error(
        `codex-fanout: a ceiling must be a non-negative integer, got ${JSON.stringify(entry.value)}. ` +
          `A malformed ceiling is never rounded into a usable one — the run stops here.`,
      )
  let best: Ceiling = { source: 'dependency', value: c.dependencyAllowed }
  for (const entry of entries) if (entry.value < best.value) best = entry
  const detail = entries.map(e => `${e.source}=${e.value}`).join(', ')
  const suffix = best.value === 0 ? ' — nothing is dispatched this iteration' : ''
  return {
    cap: best.value,
    boundBy: best.source,
    line: `effective parallelism: ${best.value} (bound by ${best.source}; ${detail})${suffix}`,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PHASES, ROLES AND THE RESULT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

export const PHASES = ['implement', 'pr', 'review', 'fix'] as const
export type Phase = (typeof PHASES)[number]

export interface JsonSchema {
  readonly type: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly items?: JsonSchema
  readonly required?: readonly string[]
  /**
   * Closed value set, when the contract locks one. The generated review contract enum-locks
   * `verdict` and `findings[].severity` off the review template's own vocabulary, and a
   * validator that ignored the enum would accept `"looks good to me"` as a verdict.
   */
  readonly enum?: readonly unknown[]
}

export interface PhaseContract {
  /** The role the subagent plays. Mirrors the shipped agent definitions; never forks them. */
  readonly role: 'implementer' | 'reviewer'
  /** The pair skill the subagent is told to run. */
  readonly skill: string
  /**
   * The return schema. Structurally identical to the schema the in-harness workflow attaches
   * to the same phase — there is ONE result contract for both realizations, and the
   * conformance suite asserts the two copies stay identical rather than trusting prose.
   */
  readonly schema: JsonSchema
  /** True when the packet must be blind to the authoring chain's working artifacts. */
  readonly blind: boolean
}

const STEP_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    checkpointPath: { type: 'string' },
    gatesPassed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['gatesPassed'],
}

const PR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { prNumber: { type: 'number' }, url: { type: 'string' } },
  required: ['prNumber'],
}

const REVIEW_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    needsHumanDecision: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          severity: { type: 'string' },
          description: { type: 'string' },
          recommendation: { type: 'string' },
          nonActionable: { type: 'boolean' },
          disposition: { type: 'string' },
        },
      },
    },
  },
  required: ['verdict'],
}

const FIX_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { fixed: { type: 'boolean' }, needsHumanDecision: { type: 'boolean' } },
  required: ['fixed'],
}

export const PHASE_CONTRACTS: Readonly<Record<Phase, PhaseContract>> = Object.freeze({
  implement: {
    role: 'implementer',
    skill: '/pair-process-implement',
    schema: STEP_SCHEMA,
    blind: false,
  },
  pr: {
    role: 'implementer',
    skill: '/pair-capability-publish-pr',
    schema: PR_SCHEMA,
    blind: false,
  },
  review: { role: 'reviewer', skill: '/pair-process-review', schema: REVIEW_SCHEMA, blind: true },
  fix: { role: 'implementer', skill: '/pair-process-implement', schema: FIX_SCHEMA, blind: false },
})

export function isPhase(value: unknown): value is Phase {
  return typeof value === 'string' && (PHASES as readonly string[]).includes(value)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONTEXT PACKETS — one card, one role, one skill, one schema
// ═══════════════════════════════════════════════════════════════════════════

export interface Card {
  readonly id: string
  readonly title: string
  readonly branch: string
  readonly base?: string
  readonly notes?: string
  readonly prNumber?: number
}

export interface PacketRequest {
  readonly phase: Phase
  readonly card: Card
  /** Worktree root the card is isolated in. One card, one worktree. */
  readonly worktreeRoot?: string
  /** Extra material the caller wants in the packet. Every entry is checked, none is trusted. */
  readonly attachments?: readonly string[]
  /**
   * The project's resolved working area (`working_path` from `pair.config.json`, else the
   * default). Passed in rather than assumed: it is what the blindness check guards.
   */
  readonly workingPath?: string
}

export interface ContextPacket {
  readonly phase: Phase
  readonly role: PhaseContract['role']
  readonly skill: string
  readonly card: Card
  readonly worktree: string
  readonly schema: JsonSchema
  readonly attachments: readonly string[]
  /** The role text handed over IN the spawn request — never a named profile binding. */
  readonly instructions: string
  readonly blind: boolean
}

/** Thrown before any spawn happens. Its message names the offending entry. */
export class PacketRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PacketRejected'
  }
}

/**
 * Paths a blind packet may never carry.
 *
 * The authoring chain's working area is the whole of it: the checkpoint, the handoff and the
 * per-run working log all live there, and a reviewer that reads any of them is reviewing the
 * author's own account of the work instead of the work. The in-harness reviewer definition
 * states the same prohibition in prose; here it is a check that runs BEFORE the spawn, so a
 * packet that would carry the material is rejected rather than discouraged.
 */
export const WORKING_PATH_DEFAULT = '.pair/working'

export const BLIND_DENY_PREFIXES: readonly string[] = Object.freeze([`${WORKING_PATH_DEFAULT}/`])

/**
 * The denied prefixes for a project whose working area is not at the default path.
 *
 * `working_path` is a supported top-level override in `pair.config.json` (working-area.md),
 * and a hard-coded `.pair/working/` silently no-ops in every project that sets one: a review
 * packet carrying `<working_path>/checkpoints/<id>.md` would be accepted, and the reviewer
 * would review the author's own account of the work. The resolved path is therefore an INPUT,
 * defaulting to the documented default rather than being fixed at it.
 */
export function blindDenyPrefixes(workingPath?: string): readonly string[] {
  const raw = typeof workingPath === 'string' ? workingPath.trim() : ''
  if (raw === '') return BLIND_DENY_PREFIXES
  const resolved = normalize(raw).replace(/\\/g, '/').replace(/\/+$/, '')
  if (resolved === '' || resolved === '.' || isAbsolute(raw) || resolved.startsWith('..'))
    throw new PacketRejected(
      `codex-fanout: working path \`${workingPath}\` is not a project-relative directory; ` +
        `\`working_path\` must be project-relative (working-area.md) and an unresolvable one is ` +
        `never silently replaced by the default — the blindness check would then guard the wrong path`,
    )
  const denied = [`${resolved}/`]
  // The default stays denied even under an override: a project that MOVED its working area
  // usually still carries the old one on disk, and re-admitting it would be a regression the
  // override silently bought.
  if (denied[0] !== BLIND_DENY_PREFIXES[0]) denied.push(...BLIND_DENY_PREFIXES)
  return Object.freeze(denied)
}

const WORKTREE_ROOT_DEFAULT = '../pair-worktrees'

/**
 * Normalizes one attachment, or rejects it.
 *
 * A parent-relative spelling is REJECTED rather than normalized, because prefix-matching a
 * string that starts with `..` cannot decide what it points at: `../../<repo>/.pair/working/
 * checkpoints/<id>.md` is the same checkpoint a `.pair/working/…` entry names, and worktrees
 * genuinely live at `../pair-worktrees/<id>`, so a dispatched subagent's cwd makes that
 * spelling the natural one rather than a contrived one. The type already declares packets
 * reference project-relative paths only; this is that declaration enforced.
 */
function normalizeAttachment(entry: string): string {
  if (typeof entry !== 'string' || entry.trim() === '')
    throw new PacketRejected('codex-fanout: an attachment must be a non-empty path')
  if (isAbsolute(entry))
    throw new PacketRejected(
      `codex-fanout: attachment \`${entry}\` is absolute; a packet references project-relative paths only`,
    )
  const normalized = normalize(entry).replace(/\\/g, '/')
  if (normalized === '..' || normalized.startsWith('../'))
    throw new PacketRejected(
      `codex-fanout: attachment \`${entry}\` escapes the project (\`${normalized}\`); a packet ` +
        `references project-relative paths only, and a path that leaves the project can spell any ` +
        `denied path from outside it`,
    )
  return normalized
}

/**
 * The pre-spawn rejection. Named separately from packet assembly because it is the invariant,
 * not a detail of the assembly: it is asserted directly by the suite and would survive a
 * rewrite of everything around it.
 */
export function assertBlind(
  attachments: readonly string[],
  phase: Phase,
  workingPath?: string,
): void {
  const prefixes = blindDenyPrefixes(workingPath)
  for (const raw of attachments) {
    const entry = normalizeAttachment(raw)
    for (const denied of prefixes)
      if (entry === denied.replace(/\/$/, '') || entry.startsWith(denied))
        throw new PacketRejected(
          `codex-fanout: the ${phase} packet would carry \`${entry}\`, which is under \`${denied}\` — ` +
            `the ${phase} role is blind to the authoring chain's working artifacts. Rejected before spawn.`,
        )
  }
}

function assertSingleCard(card: Card): void {
  const missing = (['id', 'title', 'branch'] as const).filter(
    k => typeof card?.[k] !== 'string' || card[k].trim() === '',
  )
  if (missing.length > 0)
    throw new PacketRejected(
      `codex-fanout: a packet describes exactly one card and needs ${missing.join(', ')}; ` +
        `a packet assembled from an incomplete card would spawn a subagent that has to guess its scope`,
    )
}

const ROLE_INSTRUCTIONS: Readonly<Record<PhaseContract['role'], string>> = Object.freeze({
  implementer:
    'You are the authoring chain for ONE story: implement, open or update its single PR, and apply review fixes. ' +
    'You NEVER merge, never close the story and never delete branches. Work only inside the worktree named below. ' +
    'Return the declared schema and nothing else.',
  reviewer:
    'You are an INDEPENDENT reviewer for ONE pull request. You did not write this code and you must not act as if you had: ' +
    'review the story acceptance criteria, the PR diff and the code, and nothing else. ' +
    'You MUST NOT read the authoring chain’s working artifacts. You NEVER merge, whatever the verdict. ' +
    'Return the declared schema and nothing else.',
})

/**
 * Builds the packet a freshly spawned subagent receives. Role text travels IN the request:
 * a harness profile, where one exists, is an accelerator this path never depends on, so the
 * adapter runs unchanged with none configured.
 */
export function buildPacket(request: PacketRequest): ContextPacket {
  if (!isPhase(request?.phase))
    throw new PacketRejected(
      `codex-fanout: unknown phase ${JSON.stringify(request?.phase)}; expected one of ${PHASES.join(', ')}`,
    )
  const contract = PHASE_CONTRACTS[request.phase]
  assertSingleCard(request.card)
  const attachments = (request.attachments ?? []).map(normalizeAttachment)
  if (contract.blind) assertBlind(attachments, request.phase, request.workingPath)
  const root = request.worktreeRoot ?? WORKTREE_ROOT_DEFAULT
  return {
    phase: request.phase,
    role: contract.role,
    skill: contract.skill,
    card: request.card,
    worktree: `${root}/${request.card.id}`,
    schema: contract.schema,
    attachments,
    instructions: ROLE_INSTRUCTIONS[contract.role],
    blind: contract.blind,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. TERMINAL PHASE OUTCOMES — every way a dispatch can end, named
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `completed` is the ONLY outcome that lets a card advance. The other five are the ways a
 * dispatch ends without a usable result, kept distinct because they need different human
 * responses — a timeout is a bound worth raising, a rejected return is a contract violation.
 */
export const TERMINAL_OUTCOMES = [
  'completed',
  'failed-validation',
  'timed-out',
  'cancelled',
  'died',
  'not-started',
] as const
export type TerminalOutcome = (typeof TERMINAL_OUTCOMES)[number]

export interface DispatchResult {
  /** How the harness said the wait ended. Anything unrecognised fails closed. */
  readonly status?: string
  /** The subagent's structured return value, when there was one. */
  readonly value?: unknown
  readonly detail?: string
}

export interface CollectedOutcome {
  readonly outcome: TerminalOutcome
  readonly advances: boolean
  readonly reason: string
  readonly value: unknown
}

/**
 * How a harness-reported wait status maps onto the taxonomy. Data, like the surface map: a
 * vendor that renames a status is a row here.
 */
const STATUS_MAP: Readonly<Record<string, TerminalOutcome>> = Object.freeze({
  completed: 'completed',
  succeeded: 'completed',
  ok: 'completed',
  timeout: 'timed-out',
  'timed-out': 'timed-out',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  interrupted: 'cancelled',
  failed: 'died',
  error: 'died',
  died: 'died',
  'not-started': 'not-started',
  'spawn-failed': 'not-started',
})

function failClosed(outcome: TerminalOutcome, reason: string): CollectedOutcome {
  return { outcome, advances: false, reason, value: null }
}

function objectViolations(value: unknown, schema: JsonSchema, path: string): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return [`${path} must be an object`]
  const record = value as Record<string, unknown>
  const errs: string[] = []
  for (const key of schema.required ?? [])
    if (record[key] === undefined) errs.push(`${path}.${key} is required and absent`)
  for (const [key, sub] of Object.entries(schema.properties ?? {}))
    if (record[key] !== undefined)
      errs.push(...schemaViolations(record[key], sub, `${path}.${key}`))
  return errs
}

function arrayViolations(value: unknown, schema: JsonSchema, path: string): string[] {
  if (!Array.isArray(value)) return [`${path} must be an array`]
  const items = schema.items
  if (!items) return []
  return value.flatMap((item, i) => schemaViolations(item, items, `${path}[${i}]`))
}

function enumViolations(value: unknown, schema: JsonSchema, path: string): string[] {
  if (!Array.isArray(schema.enum)) return []
  return schema.enum.includes(value)
    ? []
    : [`${path} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`]
}

/** A minimal structural JSON-Schema check: enough to say whether the contract was honoured. */
export function schemaViolations(value: unknown, schema: JsonSchema, path = 'value'): string[] {
  if (schema.type === 'object') return objectViolations(value, schema, path)
  if (schema.type === 'array') return arrayViolations(value, schema, path)
  const actual = typeof value
  if (actual !== schema.type) return [`${path} must be ${schema.type}, got ${actual}`]
  return enumViolations(value, schema, path)
}

/**
 * Reads one dispatch's ending. An absent, unparseable or schema-invalid return counts as a
 * FAILED phase and stops that card advancing — a missing result is never read as success,
 * which is the one reading that would let an unattended run report work it never did.
 */
function classifyWait(result: DispatchResult): CollectedOutcome | null {
  const mapped = STATUS_MAP[String(result.status ?? '').toLowerCase()]
  if (!mapped)
    return failClosed(
      'failed-validation',
      `unrecognised wait status ${JSON.stringify(result.status)} — an outcome this file cannot name is never read as success`,
    )
  if (mapped !== 'completed')
    return failClosed(mapped, result.detail ?? `the harness reported \`${result.status}\``)
  return null
}

/**
 * Reads one dispatch's ending against the phase contract, and against a stricter contract when
 * the caller resolved one.
 *
 * The override TIGHTENS, it never REPLACES. The party composing the request is the model
 * itself, so an override that replaced the contract turned this validation into whatever the
 * model happened to type: `{"phase":"review","schema":{"type":"object"}}` accepted an EMPTY
 * review return as `completed`/`advances`, at precisely the seam where the non-deterministic
 * actor sits, and under `## Auto-Advance` that merges a card on a review that returned
 * nothing. The built-in contract is therefore always applied; the override is applied AS WELL.
 */
export function collectOutcome(
  phase: Phase,
  result: DispatchResult | null | undefined,
  schemaOverride?: JsonSchema,
): CollectedOutcome {
  if (!isPhase(phase))
    return failClosed(
      'failed-validation',
      `unknown phase ${JSON.stringify(phase)}; expected one of ${PHASES.join(', ')} — ` +
        `an outcome this file cannot name is never read as success`,
    )
  if (!result || typeof result !== 'object')
    return failClosed('not-started', 'the harness returned nothing for this dispatch')
  const nonTerminal = classifyWait(result)
  if (nonTerminal) return nonTerminal
  if (result.value === undefined || result.value === null)
    return failClosed('failed-validation', 'the dispatch completed with no return value')
  const errs = [
    ...new Set([
      ...schemaViolations(result.value, PHASE_CONTRACTS[phase].schema),
      ...(schemaOverride ? schemaViolations(result.value, schemaOverride) : []),
    ]),
  ]
  if (errs.length > 0)
    return failClosed(
      'failed-validation',
      `return value violates the ${phase} contract: ${errs.join('; ')}`,
    )
  return {
    outcome: 'completed',
    advances: true,
    reason: `${phase} returned a contract-valid result`,
    value: result.value,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. REVIEW ↔ FIX CONVERGENCE — a fix is owed by findings, never by a pipeline
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One finding as the review contract carries it. Only the two control-flow fields are named;
 * everything else travels through untouched, because the control flow is value-agnostic —
 * it counts findings, it never reads what one says.
 */
export interface Finding {
  readonly severity?: string
  readonly nonActionable?: boolean
  readonly disposition?: string
  readonly [key: string]: unknown
}

/**
 * Rounds of autonomous fix ↔ re-review before escalating to a human. The same 3 the in-harness
 * workflow defaults to, for the same measured reason: an escalation costs a human round-trip,
 * which is more expensive than one more fix round, and beyond 3 the loop is usually not
 * converging for a reason a fourth round will not fix either. It is a bound on THIS loop, not
 * a merit criterion: it decides nothing about what to work on or whether a card may proceed.
 */
export const MAX_FIX_ROUNDS_DEFAULT = 3

export interface ConvergeRequest {
  /** The review phase's returned value, exactly as `collect` accepted it. */
  readonly review?: unknown
  /** Fix rounds already spent on this PR. 0 at the first review. */
  readonly round?: number
  readonly maxFixRounds?: number
  /** Severity at or above which a finding blocks. Absent ⇒ every actionable finding blocks. */
  readonly severityFloor?: string
  /** Explicit rank per severity, higher = more severe. Never inferred from an array's order. */
  readonly severityRanks?: Readonly<Record<string, number>>
  /** True once a previous round already deferred a `needsHumanDecision` request. */
  readonly humanDecisionPending?: boolean
}

export interface ConvergeDecision {
  /** `converged` — nothing actionable remains. `fix` — dispatch one fix round, then RE-REVIEW. */
  readonly action: 'converged' | 'fix' | 'escalate'
  /** Fix rounds spent once this decision is enacted. */
  readonly round: number
  readonly actionable: readonly Finding[]
  readonly belowFloor: readonly Finding[]
  readonly nonActionable: readonly Finding[]
  readonly humanDecisionPending: boolean
  readonly reason: string
  readonly line: string
}

function normSeverity(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

/** Resolves the blocking floor's rank, or throws. A floor nobody can rank is never guessed. */
function floorRank(req: ConvergeRequest): number | null {
  if (typeof req.severityFloor !== 'string' || req.severityFloor.trim() === '') return null
  const ranks = req.severityRanks
  if (!ranks || typeof ranks !== 'object' || Array.isArray(ranks))
    throw new Error(
      `codex-fanout: severityFloor \`${req.severityFloor}\` was given with no severityRanks. ` +
        `Rank is NEVER inferred from the order severities happen to appear in — pass the contract's ` +
        `\`severityRanks\`, or omit the floor so every actionable finding blocks.`,
    )
  const entry = Object.entries(ranks).find(
    ([name]) => normSeverity(name) === normSeverity(req.severityFloor),
  )
  if (!entry || !Number.isInteger(entry[1]))
    throw new Error(
      `codex-fanout: severityFloor \`${req.severityFloor}\` is not ranked by severityRanks ` +
        `(${Object.keys(ranks).join(', ') || 'empty'}); omit the floor so every actionable finding blocks.`,
    )
  return entry[1]
}

function hasVerdict(review: unknown): review is { verdict: string } {
  const v = (review as { verdict?: unknown } | null | undefined)?.verdict
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * Decides what a review's return owes next: nothing, one fix round, or a human.
 *
 * WHY THIS EXISTS. A pipeline that dispatches `implement → pr → review → fix` unconditionally
 * is wrong in BOTH directions, and both were reachable: an APPROVED review with zero findings
 * still spawned a fixer with nothing to fix, and a CHANGES-REQUESTED review with five findings
 * got exactly ONE fix round whose result was never re-reviewed — under `## Auto-Advance` that
 * merges a PR whose fixes nobody looked at. The in-harness workflow does the opposite: it
 * partitions the findings, converges on zero actionable ones, re-reviews after every fix and
 * escalates at the cap. Same lane, so the same rule, executed rather than narrated.
 *
 * Partitioning is on ONE predicate, not two filters: anything the below-floor test cannot
 * answer YES for blocks. A finding whose severity is unranked is therefore actionable — the
 * safe direction, and the reason no finding can fall out of both buckets and be recorded
 * nowhere.
 */
type Partition = Pick<ConvergeDecision, 'actionable' | 'belowFloor' | 'nonActionable'>

const NO_FINDINGS: Partition = { actionable: [], belowFloor: [], nonActionable: [] }

/**
 * Splits a review's findings into the by-design ones, the ones below a declared blocking
 * threshold and the ones that block — on ONE predicate, so the blocking set is the complement
 * by construction and no finding can fall out of both and be recorded nowhere.
 */
function partition(review: unknown, req: ConvergeRequest): Partition {
  const raw = (review as { findings?: unknown } | null)?.findings
  const findings: Finding[] = Array.isArray(raw) ? (raw as Finding[]) : []
  const floor = floorRank(req)
  const ranks = Object.entries(req.severityRanks ?? {})
  const rankOf = (f: Finding): number => {
    const hit = ranks.find(([name]) => normSeverity(name) === normSeverity(f?.severity))
    return hit && Number.isInteger(hit[1]) ? hit[1] : Number.NaN
  }
  const belowFloor: Finding[] = []
  const actionable: Finding[] = []
  for (const f of findings)
    if (f?.nonActionable !== true)
      (floor !== null && rankOf(f) < floor ? belowFloor : actionable).push(f)
  return { actionable, belowFloor, nonActionable: findings.filter(f => f?.nonActionable === true) }
}

interface Bounds {
  readonly round: number
  readonly max: number
  readonly pending: boolean
}

/** The loop's bounds, normalized once so the decisions below are pure branching. */
function convergeBounds(req: ConvergeRequest): Bounds {
  return {
    round: Number.isInteger(req.round) ? (req.round as number) : 0,
    max: Number.isInteger(req.maxFixRounds) ? (req.maxFixRounds as number) : MAX_FIX_ROUNDS_DEFAULT,
    pending: req.humanDecisionPending === true,
  }
}

function decide(
  b: Bounds,
  d: {
    action: ConvergeDecision['action']
    reason: string
    parts: Partition
    round?: number
    pending?: boolean
  },
): ConvergeDecision {
  return {
    action: d.action,
    round: d.round ?? b.round,
    ...d.parts,
    humanDecisionPending: d.pending ?? b.pending,
    reason: d.reason,
    line: `review convergence: ${d.action} after ${b.round} fix round(s) of at most ${b.max} — ${d.reason}`,
  }
}

/** What to do when findings remain: one more round, or a human. */
function decideOpen(review: unknown, b: Bounds, parts: Partition): ConvergeDecision {
  const open = parts.actionable.length
  const wantsHuman = (review as { needsHumanDecision?: unknown }).needsHumanDecision === true
  // A reviewer raising the flag says "one of these needs a human", not "none can be fixed": one
  // fix round is spent first, and the request is REMEMBERED so the escalation still happens.
  if (wantsHuman && !b.pending && b.round < b.max)
    return decide(b, {
      action: 'fix',
      reason:
        `the reviewer asked for a human decision — spending one fix round on the ${open} ` +
        `actionable finding(s) first, then escalating if it still stands`,
      parts,
      round: b.round + 1,
      pending: true,
    })
  if (b.round >= b.max || wantsHuman)
    return decide(b, {
      action: 'escalate',
      reason: wantsHuman
        ? 'the reviewer asked for a human decision again after a fix round — a genuine disagreement'
        : `${open} actionable finding(s) still open after ${b.round} fix round(s)`,
      parts,
    })
  return decide(b, {
    action: 'fix',
    reason: `${open} actionable finding(s) — one fix round, then RE-REVIEW`,
    parts,
    round: b.round + 1,
  })
}

export function converge(req: ConvergeRequest): ConvergeDecision {
  const bounds = convergeBounds(req)
  // A dead or contentless reviewer yields zero findings, which a naive count reads as "nothing
  // actionable remains" — the worst possible direction: a PR nobody reviewed, reported as
  // review-approved. Absence of findings is not evidence a review happened; a verdict is.
  if (!hasVerdict(req.review))
    return decide(bounds, {
      action: 'escalate',
      reason:
        'the review returned no verdict — absence of findings is not evidence that a review happened',
      parts: NO_FINDINGS,
    })
  const parts = partition(req.review, req)
  if (parts.actionable.length === 0)
    return decide(bounds, {
      action: 'converged',
      reason: 'no actionable finding remains — the PR is review-approved',
      parts,
    })
  return decideOpen(req.review, bounds, parts)
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. AUDIT — on disk, verified, or the run fails loudly
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditRecord {
  readonly iteration: number
  readonly id: string
  /**
   * The pair-loop invocation that wrote the line. The audit is ONE append-only project file
   * that outlives every run, so without this a run cannot tell its own halts from a halt
   * another run recorded weeks ago — and reading the file whole made a card halted once halted
   * forever. Stamped by the caller on every record it writes.
   */
  readonly run?: string
  readonly phase?: Phase
  readonly outcome?: TerminalOutcome
  /** For a `review` record: what `converge` decided. A cycle still owing a fix is not done. */
  readonly action?: ConvergeDecision['action']
  /** Fix rounds spent on this card when the record was written. */
  readonly round?: number
  readonly realization?: string
  readonly excluded?: boolean
  readonly reason?: string
  readonly prNumber?: number
}

/** Minimal filesystem surface, injected so the suite runs against an in-memory double. */
export interface AuditFs {
  mkdirSync(path: string, options: { recursive: true }): void
  appendFileSync(path: string, data: string): void
  readFileSync(path: string, encoding: 'utf8'): string
}

const NODE_AUDIT_FS: AuditFs = { mkdirSync, appendFileSync, readFileSync }

export function auditLine(record: AuditRecord): string {
  return `${JSON.stringify(record)}\n`
}

/**
 * Appends and READS BACK. An unattended run with no audit trail is not an acceptable
 * degraded mode, so a write that cannot be confirmed throws instead of returning a flag the
 * caller might not read.
 */
export function appendAudit(
  path: string,
  records: readonly AuditRecord[],
  fs: AuditFs = NODE_AUDIT_FS,
): { written: number; path: string } {
  const payload = records.map(auditLine).join('')
  try {
    fs.mkdirSync(dirname(path), { recursive: true })
    fs.appendFileSync(path, payload)
    const back = fs.readFileSync(path, 'utf8')
    if (!back.endsWith(payload))
      throw new Error('the file does not end with what was just appended')
    return { written: records.length, path }
  } catch (err) {
    throw new Error(
      `codex-fanout: the audit at \`${path}\` could not be written and read back ` +
        `(${err instanceof Error ? err.message : String(err)}). An unattended run with no audit ` +
        `trail is not an acceptable degraded mode — stopping.`,
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. RESUME — reconstruct from the audit, re-dispatch only what is unfinished
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The phases a resume plan can OWE, in order.
 *
 * `fix` is deliberately absent: a fix is owed by a review that returned actionable findings
 * (`converge`), never by a pipeline listing it. A card resumed mid-cycle re-enters at `review`
 * — the same re-entry the in-harness workflow uses for a story that already carries a PR — so
 * the findings are re-derived from the PR rather than replayed from a plan.
 */
export const OWED_PHASES = ['implement', 'pr', 'review'] as const

export interface CardState {
  /** Phases already recorded complete. Never re-dispatched. */
  readonly completed: Phase[]
  /** The PR this story already carries, when the audit recorded one. */
  prNumber: number | null
  /** True once an IN-SCOPE record stopped the card. Cleared by a later success of that phase. */
  halted: boolean
  /** Which phase's failure halted the card, when a phase caused it. */
  haltedBy: Phase | null
  reason: string | null
  /** Fix rounds the audit records for this card. */
  round: number
  /** True when the last review round recorded that a fix was still owed. */
  cycleOpen: boolean
}

/**
 * Which records may HALT this run.
 *
 * The audit is one persistent, project-relative, append-only file, so a run that treated every
 * halt in it as its own refused a card forever: a review that timed out on Monday made every
 * later invocation skip that card, and only hand-editing an append-only file unblocked it.
 * That is stricter than the in-harness workflow, whose exclusion is scoped to "every later
 * iteration in the SAME run". So halts are scoped: to the run the caller names, else to the
 * iteration boundary it names, else to the last run the audit itself records. Completed phases
 * and the PR number are NOT scoped — work that finished stays finished.
 */
export interface ResumeScope {
  /** The run this invocation is driving. Halts stamped with another run are history. */
  readonly run?: string
  /** Lower iteration bound of the current run, for a caller that counts iterations instead. */
  readonly sinceIteration?: number
}

function emptyState(): CardState {
  return {
    completed: [],
    prNumber: null,
    halted: false,
    haltedBy: null,
    reason: null,
    round: 0,
    cycleOpen: false,
  }
}

function complete(state: CardState, phase: Phase): void {
  if (!state.completed.includes(phase)) state.completed.push(phase)
}

function clearHalt(state: CardState, phase: Phase): void {
  // A later success for the SAME phase retires its earlier failure: an `implement` that timed
  // out at iteration 1 and completed at iteration 2 is a completed implement, not a halt.
  if (state.haltedBy === phase) {
    state.halted = false
    state.haltedBy = null
    state.reason = null
  }
}

function halt(state: CardState, by: Phase | null, reason: string): void {
  state.halted = true
  state.haltedBy = by
  state.reason = reason
}

/**
 * A completed `review` finishes the cycle only when `converge` said it did. A round that still
 * owes a fix leaves the cycle OPEN, so the card re-enters at `review` and its fixes are
 * re-reviewed rather than assumed good; an escalated round stops the card for a human.
 */
function applyReviewRecord(state: CardState, record: AuditRecord, canHalt: boolean): void {
  state.cycleOpen = record.action === 'fix'
  if (record.action === 'escalate') {
    if (canHalt) halt(state, 'review', record.reason ?? 'the review cycle escalated to a human')
    return
  }
  if (!state.cycleOpen) complete(state, 'review')
}

function applyCompleted(state: CardState, record: AuditRecord, canHalt: boolean): void {
  const phase = record.phase as Phase
  clearHalt(state, phase)
  if (phase === 'review') return applyReviewRecord(state, record, canHalt)
  complete(state, phase)
}

/** Facts a record carries about the card regardless of how the phase ended. */
function carryForward(state: CardState, record: AuditRecord): void {
  if (typeof record.prNumber === 'number') state.prNumber = record.prNumber
  if (Number.isInteger(record.round)) state.round = record.round as number
}

function haltReason(record: AuditRecord): string {
  if (typeof record.reason === 'string' && record.reason !== '') return record.reason
  if (record.excluded === true) return 'excluded by a previous iteration'
  return `${record.phase} ended \`${record.outcome}\``
}

function applyRecord(state: CardState, record: AuditRecord, canHalt: boolean): void {
  carryForward(state, record)
  if (record.excluded === true) {
    if (canHalt) halt(state, null, haltReason(record))
    return
  }
  if (!isPhase(record.phase) || !record.outcome) return
  if (record.outcome === 'completed') return applyCompleted(state, record, canHalt)
  if (canHalt) halt(state, record.phase, haltReason(record))
}

function parseAudit(auditText: string): AuditRecord[] {
  const records: AuditRecord[] = []
  for (const line of auditText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let record: AuditRecord
    try {
      record = JSON.parse(trimmed) as AuditRecord
    } catch {
      // A run killed mid-append leaves a truncated last line; refusing to resume because of it
      // would strand the very run this function exists to recover.
      continue
    }
    if (!record || typeof record.id !== 'string') continue
    records.push(record)
  }
  return records
}

/**
 * Rebuilds per-card phase state from the audit alone. The audit is the loop's own
 * append-only record and therefore the one store that already knows what a killed run had
 * decided; nothing here invents a second one.
 */
export function reconstructState(
  auditText: string,
  scope: ResumeScope = {},
): Record<string, CardState> {
  const records = parseAudit(auditText)
  const lastRun = records.at(-1)?.run
  const canHalt = (record: AuditRecord): boolean => {
    if (typeof scope.run === 'string') return record.run === scope.run
    if (Number.isInteger(scope.sinceIteration))
      return Number(record.iteration) >= (scope.sinceIteration as number)
    return record.run === lastRun
  }
  const states: Record<string, CardState> = {}
  for (const record of records) {
    const state = states[record.id] ?? emptyState()
    states[record.id] = state
    applyRecord(state, record, canHalt(record))
  }
  return states
}

export interface ResumePlan {
  readonly id: string
  readonly redispatch: Phase[]
  readonly skipped: Phase[]
  readonly halted: boolean
  readonly prNumber: number | null
  /** Fix rounds already spent — passed straight back to `converge` so the cap survives a resume. */
  readonly round: number
  readonly note: string
}

/**
 * What is left to do for one card. A story that already carries a PR re-enters through the
 * existing-PR path: `pr` is never re-dispatched, so the run cannot open a second PR for a
 * story that already has one.
 */
export function resumePlan(id: string, state: CardState | undefined): ResumePlan {
  const s = state ?? emptyState()
  const done = new Set<Phase>(s.completed)
  if (s.prNumber !== null) done.add('pr')
  const redispatch = s.halted ? [] : OWED_PHASES.filter(p => !done.has(p))
  const note = s.halted
    ? `halted in this run: ${s.reason ?? 'no reason recorded'} — not re-driven`
    : s.cycleOpen
      ? `review cycle open after ${s.round} fix round(s) — re-enters at \`review\`, never at a replayed \`fix\``
      : s.prNumber !== null
        ? `story already carries PR #${s.prNumber} — continued on it, never a second PR`
        : s.completed.length > 0
          ? `resuming: ${s.completed.join(', ')} already recorded complete`
          : 'no prior state recorded — full pipeline'
  return {
    id,
    redispatch,
    skipped: PHASES.filter(p => done.has(p)),
    halted: s.halted,
    prNumber: s.prNumber,
    round: s.round,
    note,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. CLI — JSON in on stdin, JSON out on stdout
// ═══════════════════════════════════════════════════════════════════════════

export const COMMANDS = ['bind', 'cap', 'packet', 'collect', 'converge', 'audit', 'resume'] as const
export type Command = (typeof COMMANDS)[number]

interface CommandRequest extends ConvergeRequest, ResumeScope {
  probe?: ProbeObservation
  ceilings?: Ceilings
  packet?: PacketRequest
  phase?: Phase
  result?: DispatchResult
  /** A stricter contract to validate the return against IN ADDITION to the phase contract. */
  schema?: JsonSchema
  path?: string
  records?: AuditRecord[]
  audit?: string
  id?: string
}

function runResume(req: CommandRequest): unknown {
  const states = reconstructState(req.audit ?? '', req)
  if (typeof req.id === 'string') return resumePlan(req.id, states[req.id])
  return Object.keys(states).map(id => resumePlan(id, states[id]))
}

/** One handler per command — a table rather than a chain, so adding one adds a row. */
const HANDLERS: Readonly<Record<Command, (req: CommandRequest) => unknown>> = Object.freeze({
  bind: req => resolveRealization(req.probe ?? {}),
  cap: req => effectiveParallelism(req.ceilings as Ceilings),
  packet: req => buildPacket(req.packet as PacketRequest),
  collect: req => collectOutcome(req.phase as Phase, req.result, req.schema),
  converge: req => converge(req),
  audit: req => appendAudit(req.path as string, req.records ?? []),
  resume: runResume,
})

function runCommand(command: Command, req: CommandRequest): unknown {
  return HANDLERS[command](req)
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

export function main(argv: readonly string[], stdin: string): { code: number; out: string } {
  const command = argv[0] as Command
  if (!(COMMANDS as readonly string[]).includes(command))
    return {
      code: 1,
      out: JSON.stringify({
        error: `unknown command ${JSON.stringify(argv[0])}; expected one of ${COMMANDS.join(', ')}`,
      }),
    }
  let req: CommandRequest
  try {
    req = stdin.trim() === '' ? {} : (JSON.parse(stdin) as CommandRequest)
  } catch {
    return {
      code: 1,
      out: JSON.stringify({
        error: 'stdin is not JSON; this tool takes one JSON request on stdin',
      }),
    }
  }
  try {
    return { code: 0, out: JSON.stringify(runCommand(command, req)) }
  } catch (err) {
    return {
      code: 1,
      out: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    }
  }
}

/* istanbul ignore next -- the executable edge; behaviour is covered through `main` */
if (require.main === module) {
  const { code, out } = main(process.argv.slice(2), readStdin())
  process.stdout.write(`${out}\n`)
  process.exitCode = code
}
