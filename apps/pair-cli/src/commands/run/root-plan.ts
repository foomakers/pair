/**
 * The `--root --parallel` plan (US-491 T-2) — `pair-loop`'s dependency + mutex analysis, ported.
 *
 * `.claude/workflows/pair-loop.js` is a Workflow script: its pure helpers sit above top-level
 * orchestration statements (`agent()`, `workflow()`), so it cannot be imported as a module by an
 * installed CLI. The helpers are therefore PORTED here verbatim in behaviour and held to tier 1 by a
 * parity test that evaluates tier 1's own source over a shared corpus (`root-plan.test.ts`, the
 * `tier-parity.test.ts` pattern — ADR-021 tier 2). No rule is added: every branch below reads
 * tags/prerequisites/resources verbatim (D18).
 *
 * The one difference is the POOL, not the policy: tier 1 excludes an over-cap card "for a later
 * iteration"; a process pool queues it and starts it when a slot frees, so `--parallel 1` runs the
 * plan sequentially instead of running one card and stopping.
 */

export interface RootPrerequisite {
  readonly id: string
  readonly merged: boolean
}

/** One card `pair-next --root` selected, with the fields tier 1's Select phase returns. */
export interface RootCandidate {
  readonly id: string
  readonly title: string
  readonly branch: string
  /** The card's `risk:*` label, `untagged` or empty when it carries none. */
  readonly tier: string
  /** Every label on the card, forwarded to its `run --card` process as `--card-tags`. */
  readonly labels?: readonly string[]
  readonly mutexResources: readonly string[]
  readonly prerequisites: readonly RootPrerequisite[]
}

export interface AuditEntry {
  readonly id: string
  readonly excluded: boolean
  readonly reason?: string
  readonly mutexResources?: readonly string[]
}

export interface MaxParallelismPolicy {
  readonly global: number
  readonly perTier: Readonly<Record<string, number>>
}

/** Tier 1's fail-safe for an untagged card (quality-model §3.2). */
const FAIL_SAFE_TIER = 'risk:red'

// ── tier 1 ports (pair-loop.js), parity-tested ────────────────────────────────────────────────

export function resolveCards(cards: readonly RootCandidate[]): {
  resolved: RootCandidate[]
  audit: AuditEntry[]
} {
  const seen = new Set<string>()
  const resolved: RootCandidate[] = []
  const audit: AuditEntry[] = []
  for (const card of cards) {
    if (seen.has(card.id)) {
      audit.push({ id: card.id, excluded: true, reason: 'duplicate card in candidate set' })
      continue
    }
    seen.add(card.id)
    if (!card.title || !card.branch) {
      audit.push({ id: card.id, excluded: true, reason: 'branch/title could not be resolved' })
      continue
    }
    resolved.push(card)
  }
  return { resolved, audit }
}

export function dependencyFilter(cards: readonly RootCandidate[]): {
  allowed: RootCandidate[]
  audit: AuditEntry[]
} {
  const allowed: RootCandidate[] = []
  const audit: AuditEntry[] = []
  for (const card of cards) {
    const unmerged = (card.prerequisites ?? []).find(p => !p.merged)
    if (unmerged) {
      audit.push({ id: card.id, excluded: true, reason: `blocked by #${unmerged.id} (not merged)` })
    } else {
      allowed.push(card)
    }
  }
  return { allowed, audit }
}

/** Tier 1's `computeMutexBatch` with no overrides (this mode takes none): first claimant wins. */
export function computeMutexBatch(cards: readonly RootCandidate[]): {
  batch: RootCandidate[]
  audit: AuditEntry[]
} {
  const batch: RootCandidate[] = []
  const audit: AuditEntry[] = []
  const seen = new Set<string>()
  for (const card of cards) {
    const resources = card.mutexResources ?? []
    const conflicts = resources.filter(r => seen.has(r))
    if (conflicts.length > 0) {
      audit.push({
        id: card.id,
        excluded: true,
        reason: `mutex conflict on ${conflicts.join(', ')} — waits for a later iteration`,
      })
      continue
    }
    batch.push(card)
    resources.forEach(r => seen.add(r))
    audit.push({ id: card.id, excluded: false, mutexResources: resources })
  }
  return { batch, audit }
}

export function resolveMaxParallelism(
  policy: MaxParallelismPolicy,
  batchTiers: readonly string[],
): number {
  const unique = [...new Set(batchTiers)]
  if (unique.length === 1 && policy.perTier[unique[0]!] !== undefined) {
    return policy.perTier[unique[0]!]!
  }
  return policy.global
}

// ── the pool's limit ───────────────────────────────────────────────────────────────────────────

export type LimitName = 'dependency-allowed' | '## Max Parallelism' | '--parallel'

export interface EffectiveLimit {
  readonly effective: number
  /** Every limit equal to the minimum — the one(s) that bound it, named (AC1). */
  readonly boundBy: readonly LimitName[]
  readonly dependencyAllowed: number
  readonly maxParallelism: number
  readonly requested: number
}

export function resolveEffectiveLimit(input: {
  dependencyAllowed: number
  maxParallelism: number
  requested: number
}): EffectiveLimit {
  const { dependencyAllowed, maxParallelism, requested } = input
  const limits: Array<[LimitName, number]> = [
    ['dependency-allowed', dependencyAllowed],
    ['## Max Parallelism', maxParallelism],
    ['--parallel', requested],
  ]
  const effective = Math.min(dependencyAllowed, maxParallelism, requested)
  return {
    effective,
    boundBy: limits.filter(([, value]) => value === effective).map(([name]) => name),
    dependencyAllowed,
    maxParallelism,
    requested,
  }
}

// ── the plan ───────────────────────────────────────────────────────────────────────────────────

export interface RootPlan {
  /** Mutex-safe, dependency-allowed cards, in selection order; the pool runs at most `limit.effective` at once. */
  readonly run: readonly RootCandidate[]
  /** Every card NOT run, with tier 1's own reason — never silently dropped (AC1). */
  readonly excluded: ReadonlyArray<{ readonly id: string; readonly reason: string }>
  readonly limit: EffectiveLimit
}

export interface RootPlanInput {
  readonly candidates: readonly RootCandidate[]
  /** `## Eligibility`, verbatim; absent ⇒ no tier guard (the selection is `pair-next --root`'s alone). */
  readonly eligibility: string | undefined
  readonly maxParallelism: MaxParallelismPolicy
  /** `--parallel N`. */
  readonly requested: number
}

/** Tier 1's Select → resolve → dependency → mutex pipeline, then the pool's limit. */
export function computeRootPlan(input: RootPlanInput): RootPlan {
  const excluded: Array<{ id: string; reason: string }> = []
  const tiered = input.candidates.map(c => ({
    ...c,
    tier: c.tier === 'untagged' || !c.tier ? FAIL_SAFE_TIER : c.tier,
  }))
  // The child `run --card` gates `## Eligibility` on the labels it is forwarded, not on this tier:
  // a card whose tier passes only through the fail-safe (untagged ⇒ risk:red) carries no label its
  // child could admit it on, so it is excluded here rather than planned, spawned and refused (r0-2).
  const notEligible = (c: (typeof tiered)[number]): string | undefined => {
    if (input.eligibility === undefined) return undefined
    if (c.tier !== input.eligibility) return `not eligible (tier ${c.tier} !== ${input.eligibility})`
    if (!(c.labels ?? []).includes(input.eligibility))
      return `not eligible (label ${input.eligibility} absent: its run --card gate reads the labels, tier ${c.tier} is the untagged fail-safe)`
    return undefined
  }
  const eligible: typeof tiered = []
  for (const c of tiered) {
    const reason = notEligible(c)
    if (reason === undefined) eligible.push(c)
    else excluded.push({ id: c.id, reason })
  }

  const { resolved, audit: resolveAudit } = resolveCards(eligible)
  const { allowed, audit: depAudit } = dependencyFilter(resolved)
  const { batch, audit: mutexAudit } = computeMutexBatch(allowed)
  for (const entry of [...resolveAudit, ...depAudit, ...mutexAudit]) {
    if (entry.excluded) excluded.push({ id: entry.id, reason: entry.reason ?? 'excluded' })
  }

  const maxParallelism = resolveMaxParallelism(
    input.maxParallelism,
    batch.map(c => c.tier),
  )
  const limit = resolveEffectiveLimit({
    dependencyAllowed: batch.length,
    maxParallelism,
    requested: input.requested,
  })
  return { run: batch, excluded, limit }
}

/** The plan, as printed before any `run --card` process starts (AC1). */
export function describeRootPlan(plan: RootPlan): string[] {
  const { limit } = plan
  const lines: string[] = []
  lines.push(
    plan.run.length === 0
      ? 'Plan: Nothing eligible to run concurrently'
      : `Plan: Run (${plan.run.length}): ${plan.run.map(c => `#${c.id}`).join(', ')}`,
  )
  for (const entry of plan.excluded) lines.push(`  Excluded #${entry.id}: ${entry.reason}`)
  lines.push(
    `Effective parallelism: ${limit.effective} = min(dependency-allowed ${limit.dependencyAllowed}, ` +
      `## Max Parallelism ${limit.maxParallelism}, --parallel ${limit.requested}) — bound by ` +
      limit.boundBy.join(' and '),
  )
  return lines
}
