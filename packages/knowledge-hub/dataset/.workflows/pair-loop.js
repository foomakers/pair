export const meta = {
  name: 'pair-loop',
  description:
    'Unattended delivery loop: per iteration, selects eligible cards via pair-next, runs a dependency + mutex analysis, composes pair-implement-batch for a mutex-safe parallel batch (or drives one card sequentially), enacts the automation policy (auto-advance) and evaluates the stop predicate. NEVER iterates multiple cards in one context — every card is driven by implement-batch\'s own fresh-subagent fan-out.',
  whenToUse:
    'Realization path for the `pair-loop` skill in Claude Code (ADR-017 §4) — the skill delegates here when a fan-out runner is available; elsewhere it takes the degraded one-card path itself and this file is never invoked. REQUIRED args shape: {"root": "<issue-id>" | undefined, "policyText": "<raw tech/automation.md contents>"}. `policyText` is the skill\'s own Read of the adoption file, handed in so this workflow never re-implements filesystem access outside agent()/Read. Zero merit logic here (D18): every branch below reads tags/state/policy values verbatim, it classifies nothing.',
  phases: [
    { title: 'Policy' },
    { title: 'Select' },
    { title: 'Batch' },
    { title: 'Advance' },
    { title: 'Audit' },
  ],
}

// ═══════════════════════════════════════════════════════════════════════════
// PURE HELPERS — deterministic, no I/O. Every one of these is unit-tested via
// the AsyncFunction dry-run harness (pair-loop.test.mjs), per T12: "fixture-
// board runs...no live agent run is required." ADR-017 §2: control flow is
// deterministic script, never an LLM "looping" in context.
// ═══════════════════════════════════════════════════════════════════════════

// ── Section extraction — automation-policy.md's shared shape ───────────────
// A section body is the lines after its `## <Heading>` (matched at level 2
// EXACT, rendered markdown — a fenced occurrence is not a heading) up to the
// next `## ` heading. Shared by every knob below; only Eligibility layers its
// own seven-trigger validation on top (extractEligibility).
function findHeadingLine(lines, heading) {
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (!inFence && line.trim() === `## ${heading}`) return i
  }
  return -1
}

function sectionBody(text, heading) {
  const lines = text.split('\n')
  const idx = findHeadingLine(lines, heading)
  if (idx === -1) return null // absent — caller applies its own fail-safe default
  let end = lines.length
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i
      break
    }
  }
  return lines
    .slice(idx + 1, end)
    .join('\n')
    .trim()
}

// ── `## Eligibility` — the seven HALT triggers (automation-policy.md) ──────
const HALT = msg => {
  const e = new Error(`pair-loop: HALT — ${msg}`)
  e.halt = true
  throw e
}

export function extractEligibility(policyText) {
  const lines = policyText.split('\n')
  let headingCount = 0
  let inFence = false
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (!inFence && line.trim() === '## Eligibility') headingCount++
  }
  if (headingCount === 0) return { kind: 'absent' } // fail-safe: empty eligibility set
  if (headingCount > 1)
    HALT(
      `tech/automation.md declares more than one \`## Eligibility\` heading — not exactly one declaration.`,
    )

  const body = sectionBody(policyText, 'Eligibility')
  const nonEmpty = body.split('\n').filter(l => l.trim().length > 0)
  if (nonEmpty.length === 0) HALT(`\`## Eligibility\` is present but empty (half-written declaration).`)
  if (nonEmpty.length > 1)
    HALT(`\`## Eligibility\` declares more than one non-empty line — takes exactly one label.`)

  const value = nonEmpty[0].trim()
  if (value.includes(','))
    HALT(`\`## Eligibility\` declares \`${value}\`, but the declaration takes exactly one label.`)
  if (/(^|\s)(AND|OR|NOT)(\s|$)/.test(value))
    HALT(`\`## Eligibility\` declares \`${value}\` — no AND/OR/NOT grammar.`)
  if (/^[`\-*>#]/.test(value))
    HALT(`\`## Eligibility\` declares \`${value}\` — begins with a markdown block marker, likely a copied fence/list/quote.`)
  if (value.length > 50)
    HALT(`\`## Eligibility\` declares a value longer than 50 characters — cannot be a label on this host.`)
  const colonTokens = value.split(/\s+/).filter(t => t.includes(':'))
  if (colonTokens.length > 1)
    HALT(`\`## Eligibility\` declares \`${value}\` — more than one colon-carrying token on one line.`)

  return { kind: 'value', value }
}

// ── `## Auto-Advance` ───────────────────────────────────────────────────────
export function extractAutoAdvance(policyText) {
  const body = sectionBody(policyText, 'Auto-Advance')
  if (body === null || body.trim() === '' ) return { tiers: [] } // absent ⇒ off
  const trimmed = body.trim()
  if (trimmed === '(none)') return { tiers: [] }
  if (/(AND|OR|NOT)/.test(trimmed)) HALT(`\`## Auto-Advance\` carries a boolean operator — it is a set, not an expression.`)
  const tiers = trimmed.split(',').map(t => t.trim()).filter(Boolean)
  if (tiers.length === 0) HALT(`\`## Auto-Advance\` is present but names no tier and is not \`(none)\`.`)
  const seen = new Set()
  for (const t of tiers) {
    if (seen.has(t)) HALT(`\`## Auto-Advance\` names \`${t}\` more than once.`)
    seen.add(t)
    if (/yellow|red/.test(t))
      HALT(`\`## Auto-Advance\` names \`${t}\` — only the tier the quality model lets a machine self-merge may appear here.`)
  }
  return { tiers }
}

// ── `## Stop Predicate` ─────────────────────────────────────────────────────
const SELECTORS = ['root', 'tag', 'type']
const CONDITION_STATES = ['Draft', 'Ready', 'In Progress', 'Done']

export function parseStopPredicate(policyText) {
  const body = sectionBody(policyText, 'Stop Predicate')
  if (body === null || body.trim() === '') return { predicate: null, maxIterations: 1 } // fail-safe default
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  let predicate = null
  let maxIterations = null
  for (const line of lines) {
    const miMatch = /^max-iterations:\s*(-?\d+)\s*$/.exec(line)
    if (miMatch) {
      const n = Number(miMatch[1])
      if (!Number.isInteger(n) || n <= 0)
        HALT(`\`## Stop Predicate\` — max-iterations must be a positive integer, got \`${miMatch[1]}\`.`)
      maxIterations = n
      continue
    }
    const predMatch = /^(.+?)\s*⇒\s*(.+)$/.exec(line)
    if (predMatch) {
      const [, selectorRaw, conditionRaw] = predMatch
      const selectorHead = selectorRaw.split(':')[0]
      if (!SELECTORS.includes(selectorHead))
        HALT(`\`## Stop Predicate\` — unknown selector \`${selectorRaw}\`. Expected one of: root, tag:<label>, type:<issue-type>.`)
      const conditionOk = conditionRaw
        .split(/\s+and\s+/i)
        .every(c => CONDITION_STATES.includes(c.trim()) || /^has-tag:/.test(c.trim()))
      if (!conditionOk)
        HALT(`\`## Stop Predicate\` — condition \`${conditionRaw}\` is not a canonical macrostate and/or has-tag:<label>. Issue-body content is never a valid predicate.`)
      predicate = { selector: selectorRaw, condition: conditionRaw }
      continue
    }
    HALT(`\`## Stop Predicate\` — line \`${line}\` matches neither \`<selector> ⇒ <condition>\` nor \`max-iterations: <n>\`.`)
  }
  return { predicate, maxIterations: maxIterations ?? 1 }
}

export function evaluateStopPredicate(predicate, boardSnapshot) {
  // boardSnapshot: array of { id, tags: string[], macrostate: string }, already
  // scoped to the predicate's selector by the caller's board query.
  if (!predicate) return { satisfied: false, reason: 'no predicate declared' }
  if (boardSnapshot.length === 0) return { satisfied: true, reason: 'unsatisfiable selector — matches nothing' }
  const conditions = predicate.condition.split(/\s+and\s+/i).map(c => c.trim())
  const holds = card =>
    conditions.every(c =>
      c.startsWith('has-tag:') ? card.tags.includes(c.slice('has-tag:'.length)) : card.macrostate === c,
    )
  return { satisfied: boardSnapshot.every(holds), reason: null }
}

// ── `## Max Parallelism` ────────────────────────────────────────────────────
export function parseMaxParallelism(policyText) {
  const body = sectionBody(policyText, 'Max Parallelism')
  if (body === null || body.trim() === '') return { global: 1, perTier: {} } // fail-safe default: sequential
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
  const globalLine = lines[0]
  const globalVal = Number(globalLine)
  if (!Number.isInteger(globalVal) || globalVal <= 0)
    HALT(`\`## Max Parallelism\` — first line must be a positive integer, got \`${globalLine}\`.`)
  const perTier = {}
  for (const line of lines.slice(1)) {
    const m = /^(.+?):\s*(-?\d+)\s*$/.exec(line)
    if (!m) HALT(`\`## Max Parallelism\` — override line \`${line}\` is not \`<tier>: <positive integer>\`.`)
    const [, tier, nRaw] = m
    const n = Number(nRaw)
    if (!Number.isInteger(n) || n <= 0)
      HALT(`\`## Max Parallelism\` — override for \`${tier}\` must be a positive integer, got \`${nRaw}\`.`)
    perTier[tier] = n
  }
  return { global: globalVal, perTier }
}

export function resolveMaxParallelism(policy, batchTiers) {
  const uniqueTiers = [...new Set(batchTiers)]
  if (uniqueTiers.length === 1 && policy.perTier[uniqueTiers[0]] !== undefined) {
    return policy.perTier[uniqueTiers[0]]
  }
  return policy.global
}

// ── `## Audit Location` ─────────────────────────────────────────────────────
export function resolveAuditLocation(policyText) {
  const body = sectionBody(policyText, 'Audit Location')
  const rel = body === null || body.trim() === '' ? 'automation/loop-audit.md' : body.trim()
  if (rel.startsWith('/'))
    HALT(`\`## Audit Location\` declares an absolute path \`${rel}\` — must be project-relative.`)
  return rel
}

// ── Dependency analysis: ordering + mutex sets + overrides ─────────────────
// card: { id, title, branch, tags, mutexResources: string[], prerequisites: [{id, merged}] }

export function dependencyFilter(cards) {
  const allowed = []
  const audit = []
  for (const card of cards) {
    const unmergedPrereq = (card.prerequisites ?? []).find(p => !p.merged)
    if (unmergedPrereq) {
      audit.push({ id: card.id, excluded: true, reason: `blocked by #${unmergedPrereq.id} (not merged)` })
    } else {
      allowed.push(card)
    }
  }
  return { allowed, audit }
}

export function computeMutexBatch(cards, overrides = {}) {
  // overrides: { exclude?: string[], sequential?: string[] } — NARROWING ONLY.
  const audit = []
  const excluded = new Set(overrides.exclude ?? [])
  const sequential = new Set(overrides.sequential ?? [])
  const usableCards = cards.filter(c => {
    if (excluded.has(c.id)) {
      audit.push({ id: c.id, excluded: true, reason: 'excluded by override' })
      return false
    }
    return true
  })

  const batch = []
  const seenResources = new Set()
  for (const card of usableCards) {
    const resources = card.mutexResources ?? []
    const conflicts = resources.filter(r => seenResources.has(r))
    if (conflicts.length > 0) {
      audit.push({ id: card.id, excluded: true, reason: `mutex conflict on ${conflicts.join(', ')} — waits for a later iteration` })
      continue
    }
    if (sequential.has(card.id) && batch.length > 0) {
      audit.push({ id: card.id, excluded: true, reason: 'pinned sequential by override — waits for a later iteration' })
      continue
    }
    batch.push(card)
    resources.forEach(r => seenResources.add(r))
    audit.push({ id: card.id, excluded: false, mutexResources: resources })
    if (sequential.has(card.id)) break // a sequential-pinned card runs alone this iteration
  }
  return { batch, audit }
}

// ── De-duplication + unresolvable-card exclusion ────────────────────────────
export function resolveCards(cards) {
  const seen = new Set()
  const resolved = []
  const audit = []
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

// ── Batch composer: min(D, P) ────────────────────────────────────────────────
export function composeBatch(dependencyAllowedCards, maxParallelism) {
  const D = dependencyAllowedCards.length
  const n = Math.min(D, maxParallelism)
  return dependencyAllowedCards.slice(0, n)
}

// ── Continue-token (degraded / portable path) ───────────────────────────────
export function renderContinueToken({ root, predicateText, iteration }) {
  const rootPart = root ? ` --root ${root}` : ''
  const predPart = predicateText ? ` --predicate "${predicateText}"` : ''
  return `pair-loop${rootPart}${predPart} --iteration ${iteration + 1}`
}

// ═══════════════════════════════════════════════════════════════════════════
// ORCHESTRATION — the unattended fan-out path (ADR-017 §4 Realization: Claude
// Code delegates here). Fresh subagent per card (fan-out invariant, ADR-017
// §3): every per-card decision is made by implement-batch's OWN fan-out
// (`pair-implement-batch`), never iterated in this orchestrator's context.
// ═══════════════════════════════════════════════════════════════════════════

function parsePolicyOrHalt(policyText) {
  if (typeof policyText !== 'string' || policyText.trim() === '')
    HALT('tech/automation.md is absent or empty — eligibility set is empty, automation is off. Nothing to run.')
  const eligibility = extractEligibility(policyText)
  if (eligibility.kind === 'absent')
    HALT('tech/automation.md has no `## Eligibility` section — eligibility set is empty by design. Not an error: automation is simply off.')
  const autoAdvance = extractAutoAdvance(policyText)
  const stop = parseStopPredicate(policyText)
  const maxParallelism = parseMaxParallelism(policyText)
  const auditLocation = resolveAuditLocation(policyText)
  return { eligibility, autoAdvance, stop, maxParallelism, auditLocation }
}

phase('Policy')
const policy = parsePolicyOrHalt(args?.policyText)
log(`Eligibility filter: ${policy.eligibility.value}`)

let iteration = 0
const runLog = []

while (true) {
  phase('Select')
  const selection = await agent(
    `Run /pair-next --filter ${JSON.stringify(policy.eligibility.value)}` +
      (args?.root ? ` --root ${args.root}` : '') +
      `. For every candidate issue also return: its declared \`**Prerequisite Stories**\` (with each prerequisite's MERGED status, checked via \`gh pr view\`/\`gh issue view\`, never assumed), its declared touched-surface (Technical Analysis "Key Components" / task list) rendered as a flat list of mutex-resource strings (skill names, file paths, module names), its \`risk:*\` label (or 'untagged'), its board macrostate, its title and its branch name (feature/#<id>-* convention; empty if none exists yet).`,
    {
      phase: 'Select',
      schema: {
        type: 'object',
        properties: {
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                branch: { type: 'string' },
                tier: { type: 'string' },
                macrostate: { type: 'string' },
                mutexResources: { type: 'array', items: { type: 'string' } },
                prerequisites: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, merged: { type: 'boolean' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  )

  const candidates = (selection?.candidates ?? []).map(c => ({
    ...c,
    tier: c.tier === 'untagged' || !c.tier ? 'risk:red' : c.tier, // fail-safe (quality-model §3.2)
  }))
  const eligible = candidates.filter(c => c.tier === policy.eligibility.value)
  const dropped = candidates.filter(c => c.tier !== policy.eligibility.value)
  for (const c of dropped) runLog.push({ iteration, id: c.id, excluded: true, reason: `not eligible (tier ${c.tier} !== ${policy.eligibility.value})` })

  const { resolved, audit: resolveAudit } = resolveCards(eligible)
  runLog.push(...resolveAudit.map(a => ({ iteration, ...a })))

  const { allowed: depAllowed, audit: depAudit } = dependencyFilter(resolved)
  runLog.push(...depAudit.map(a => ({ iteration, ...a })))

  const { batch: mutexBatch, audit: mutexAudit } = computeMutexBatch(depAllowed, args?.overrides)
  runLog.push(...mutexAudit.map(a => ({ iteration, ...a })))

  phase('Batch')
  const cap = resolveMaxParallelism(policy.maxParallelism, mutexBatch.map(c => c.tier))
  const batch = composeBatch(mutexBatch, cap)

  if (batch.length === 0) {
    log(`Iteration ${iteration}: nothing eligible — stopping.`)
    runLog.push({ iteration, note: 'nothing eligible this iteration' })
    break
  }

  log(`Iteration ${iteration}: driving ${batch.length} card(s) via pair-implement-batch: ${batch.map(c => c.id).join(', ')}`)
  const batchResult = await workflow('pair-implement-batch', {
    stories: batch.map(c => ({ id: c.id, title: c.title, branch: c.branch })),
  })

  phase('Advance')
  const outcomes = batchResult?.batch ?? []
  for (const outcome of outcomes) {
    const card = batch.find(c => c.id === outcome.id) ?? { tier: 'risk:red' }
    runLog.push({ iteration, id: outcome.id, status: outcome.status })
    const reviewApproved = outcome.status === 'ready-for-merge'
    const tierAllowed = policy.autoAdvance.tiers.includes(card.tier)
    if (reviewApproved && tierAllowed) {
      const advance = await agent(
        `Card #${outcome.id} (${card.tier}) is review-approved on PR #${outcome.prNumber}. Verify the 🟢 gate set (lint + type + build) yourself via /pair-capability-verify-quality — never trust branch protection. On green, push and merge unattended to the default branch. On red, do NOT merge; report why.`,
        { phase: 'Advance', schema: { type: 'object', properties: { merged: { type: 'boolean' }, reason: { type: 'string' } } } },
      )
      runLog.push({ iteration, id: outcome.id, autoAdvance: !!advance?.merged, reason: advance?.reason })
    } else if (reviewApproved) {
      runLog.push({ iteration, id: outcome.id, autoAdvance: false, reason: `awaiting human — tier ${card.tier} not in Auto-Advance` })
    }
  }

  phase('Audit')
  await agent(
    `Append this iteration's audit record to ${policy.auditLocation} under the resolved working_path (create the file/dirs if absent). Iteration ${iteration}. Entries: ${JSON.stringify(runLog.filter(r => r.iteration === iteration))}`,
    { phase: 'Audit' },
  )

  iteration++
  if (iteration >= policy.stop.maxIterations) {
    log(`Reached max-iterations (${policy.stop.maxIterations}) — stopping.`)
    break
  }
  if (policy.stop.predicate) {
    const snapshot = await agent(
      `Evaluate the board against selector \`${policy.stop.predicate.selector}\`${args?.root ? ` (root ${args.root})` : ''}: return every matching issue's tags and canonical macrostate (through the state mapping).`,
      { phase: 'Select', schema: { type: 'object', properties: { cards: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, macrostate: { type: 'string' } } } } } } },
    )
    const { satisfied } = evaluateStopPredicate(policy.stop.predicate, snapshot?.cards ?? [])
    if (satisfied) {
      log('Stop predicate satisfied — stopping.')
      break
    }
  }
}

return { iterations: iteration, log: runLog }
