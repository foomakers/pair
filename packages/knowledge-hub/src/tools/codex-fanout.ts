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

/** A realization is confirmed only when BOTH required handles are exposed under its namespace. */
function matchRealization(
  def: RealizationDefinition,
  exposed: ReadonlySet<string>,
  namespaceOverride?: string,
): { spawn: string; wait: string } | null {
  const ns = typeof namespaceOverride === 'string' ? namespaceOverride : def.namespace
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

/**
 * Paths a blind packet may never carry.
 *
 * The authoring chain's working area is the whole of it: the checkpoint, the handoff and the
 * per-run working log all live there, and a reviewer that reads any of them is reviewing the
 * author's own account of the work instead of the work. The in-harness reviewer definition
 * states the same prohibition in prose; here it is a check that runs BEFORE the spawn, so a
 * packet that would carry the material is rejected rather than discouraged.
 */
export const BLIND_DENY_PREFIXES: readonly string[] = Object.freeze(['.pair/working/'])

const WORKTREE_ROOT_DEFAULT = '../pair-worktrees'

/** Thrown before any spawn happens. Its message names the offending entry. */
export class PacketRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PacketRejected'
  }
}

function normalizeAttachment(entry: string): string {
  if (typeof entry !== 'string' || entry.trim() === '')
    throw new PacketRejected('codex-fanout: an attachment must be a non-empty path')
  if (isAbsolute(entry))
    throw new PacketRejected(
      `codex-fanout: attachment \`${entry}\` is absolute; a packet references project-relative paths only`,
    )
  return normalize(entry).replace(/\\/g, '/')
}

/**
 * The pre-spawn rejection. Named separately from packet assembly because it is the invariant,
 * not a detail of the assembly: it is asserted directly by the suite and would survive a
 * rewrite of everything around it.
 */
export function assertBlind(attachments: readonly string[], phase: Phase): void {
  for (const raw of attachments) {
    const entry = normalizeAttachment(raw)
    for (const denied of BLIND_DENY_PREFIXES)
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
  if (contract.blind) assertBlind(attachments, request.phase)
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

/** A minimal structural JSON-Schema check: enough to say whether the contract was honoured. */
export function schemaViolations(value: unknown, schema: JsonSchema, path = 'value'): string[] {
  if (schema.type === 'object') return objectViolations(value, schema, path)
  if (schema.type === 'array') return arrayViolations(value, schema, path)
  const actual = typeof value
  return actual === schema.type ? [] : [`${path} must be ${schema.type}, got ${actual}`]
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

export function collectOutcome(
  phase: Phase,
  result: DispatchResult | null | undefined,
  schemaOverride?: JsonSchema,
): CollectedOutcome {
  if (!result || typeof result !== 'object')
    return failClosed('not-started', 'the harness returned nothing for this dispatch')
  const nonTerminal = classifyWait(result)
  if (nonTerminal) return nonTerminal
  if (result.value === undefined || result.value === null)
    return failClosed('failed-validation', 'the dispatch completed with no return value')
  const errs = schemaViolations(result.value, schemaOverride ?? PHASE_CONTRACTS[phase].schema)
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
// 7. AUDIT — on disk, verified, or the run fails loudly
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditRecord {
  readonly iteration: number
  readonly id: string
  readonly phase?: Phase
  readonly outcome?: TerminalOutcome
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
// 8. RESUME — reconstruct from the audit, re-dispatch only what is unfinished
// ═══════════════════════════════════════════════════════════════════════════

export interface CardState {
  /** Phases already recorded complete. Never re-dispatched. */
  readonly completed: Phase[]
  /** The PR this story already carries, when the audit recorded one. */
  prNumber: number | null
  /** True once the audit recorded a terminal outcome that stops the card. */
  halted: boolean
  reason: string | null
}

function emptyState(): CardState {
  return { completed: [], prNumber: null, halted: false, reason: null }
}

function applyRecord(state: CardState, record: AuditRecord): void {
  if (typeof record.prNumber === 'number') state.prNumber = record.prNumber
  if (record.excluded === true) {
    state.halted = true
    state.reason = record.reason ?? 'excluded by a previous iteration'
    return
  }
  if (!isPhase(record.phase) || !record.outcome) return
  if (record.outcome === 'completed') {
    if (!state.completed.includes(record.phase)) state.completed.push(record.phase)
    return
  }
  state.halted = true
  state.reason = record.reason ?? `${record.phase} ended \`${record.outcome}\``
}

/**
 * Rebuilds per-card phase state from the audit alone. The audit is the loop's own
 * append-only record and therefore the one store that already knows what a killed run had
 * decided; nothing here invents a second one.
 *
 * A line that does not parse is SKIPPED rather than fatal: a run killed mid-append can leave
 * a truncated last line, and refusing to resume because of it would strand the very run this
 * function exists to recover.
 */
export function reconstructState(auditText: string): Record<string, CardState> {
  const states: Record<string, CardState> = {}
  for (const line of auditText.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let record: AuditRecord
    try {
      record = JSON.parse(trimmed) as AuditRecord
    } catch {
      continue
    }
    if (!record || typeof record.id !== 'string') continue
    const state = states[record.id] ?? emptyState()
    states[record.id] = state
    applyRecord(state, record)
  }
  return states
}

export interface ResumePlan {
  readonly id: string
  readonly redispatch: Phase[]
  readonly skipped: Phase[]
  readonly halted: boolean
  readonly prNumber: number | null
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
  const redispatch = s.halted ? [] : PHASES.filter(p => !done.has(p))
  const note = s.halted
    ? `halted by a previous iteration: ${s.reason ?? 'no reason recorded'} — not re-driven`
    : s.prNumber !== null
      ? `story already carries PR #${s.prNumber} — continued on it, never a second PR`
      : 'no prior state recorded — full pipeline'
  return {
    id,
    redispatch,
    skipped: PHASES.filter(p => done.has(p)),
    halted: s.halted,
    prNumber: s.prNumber,
    note,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CLI — JSON in on stdin, JSON out on stdout
// ═══════════════════════════════════════════════════════════════════════════

export const COMMANDS = ['bind', 'cap', 'packet', 'collect', 'audit', 'resume'] as const
export type Command = (typeof COMMANDS)[number]

interface CommandRequest {
  probe?: ProbeObservation
  ceilings?: Ceilings
  packet?: PacketRequest
  phase?: Phase
  result?: DispatchResult
  schema?: JsonSchema
  path?: string
  records?: AuditRecord[]
  audit?: string
  id?: string
}

function runCommand(command: Command, req: CommandRequest): unknown {
  if (command === 'bind') return resolveRealization(req.probe ?? {})
  if (command === 'cap') return effectiveParallelism(req.ceilings as Ceilings)
  if (command === 'packet') return buildPacket(req.packet as PacketRequest)
  if (command === 'collect') return collectOutcome(req.phase as Phase, req.result, req.schema)
  if (command === 'audit') return appendAudit(req.path as string, req.records ?? [])
  const states = reconstructState(req.audit ?? '')
  if (typeof req.id === 'string') return resumePlan(req.id, states[req.id])
  return Object.keys(states).map(id => resumePlan(id, states[id]))
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
