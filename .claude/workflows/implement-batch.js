export const meta = {
  name: 'implement-batch',
  description:
    'Drive a mutex-safe batch of ready Pair stories, each to a review-approved PR (implement -> PR -> independent review <-> fix loop). Stops at PR-ready; NEVER merges (human gate).',
  phases: [{ title: 'Contracts' }, { title: 'Implement' }, { title: 'PR' }, { title: 'Review' }],
}

// ── Input ────────────────────────────────────────────────────────────────
// args.stories = the batch of STORIES (never tasks) to drive THIS run. A batch
// ITEM IS A STORY, not a task: each story is delivered on ONE branch with ONE
// PR — opened the first time and UPDATED for all subsequent work on that story
// (further tasks/features included). NEVER one-PR-per-task, and NEVER a second
// PR for the same story: continuing a story that already has a PR reuses its
// existing branch/{prNumber} and updates that PR (create-or-update). A second
// PR for the same story is forbidden unless a human explicitly instructs it.
// MUST be pre-filtered to be mutex-safe: no two stories here may touch the same
// shared skill/file (pair-next, pair-process-review, record-decision,
// apps/pair-cli, templates).
// Chains advance ACROSS runs: after you merge these PRs, re-run with the next
// batch (the now-unblocked heads). A story's dependency must be MERGED, not
// just PR-ready, before its dependent enters a batch.
let _args = args
if (typeof _args === 'string') {
  try {
    _args = JSON.parse(_args)
  } catch {
    _args = undefined
  }
}
// Each story: { id, title, branch }. Add { prNumber } to RESUME an existing PR
// mid-review — implement+PR are skipped and the story re-enters the review<->fix
// loop directly (drives remaining findings, incl. minor, to zero).
// Optional { notes } = a scope directive threaded into the implement+PR prompts
// (overrides the issue body on conflict), e.g. "resolve all findings in ONE PR,
// do not split".
const STORIES = _args?.stories ?? []
const MAX_FIX_ROUNDS = 2

// ── Schemas (orchestration return-value contracts) ─────────────────────────
// These are the compact values agents RETURN for control-flow — NOT the artifact
// formats. The human-facing artifacts follow the KB templates, applied by the
// agents: the PR body → `pr-template.md`, the review report → `code-review-template.md`
// (posted as a PR comment by the reviewer), the checkpoint → `checkpoint-template.md`.
// Where a schema field overlaps a template field it MIRRORS the template's
// vocabulary (single source of truth) so the machine contract and the human
// artifact cannot drift.
const STEP_SCHEMA = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    checkpointPath: { type: 'string' }, // checkpoint body follows checkpoint-template.md
    gatesPassed: { type: 'boolean' },
    summary: { type: 'string' },
  },
  required: ['gatesPassed'],
}
const PR_SCHEMA = {
  // The PR BODY follows pr-template.md (authored by the agent); this is only the handle.
  type: 'object',
  properties: { prNumber: { type: 'number' }, url: { type: 'string' } },
  required: ['prNumber'],
}
const LOOSE_REVIEW_SCHEMA = {
  // Mirrors code-review-template.md: the Overall Assessment verdict options and the
  // Detailed Review Comments finding fields (File:Line / severity / description /
  // recommendation). The posted report is the artifact; this is the return value.
  // This is the loose FALLBACK skeleton: phase-0 (ensure-contract, below) derives an
  // enum-locked version from the template via an AI-generated contract.json; when
  // that contract is missing/stale-and-ungeneratable/malformed, this skeleton is
  // used as-is so the run never breaks.
  type: 'object',
  properties: {
    // Free string mirroring code-review-template.md's "Overall Assessment" options
    // (Approved / Approved with Comments / Request Changes / Comment Only) — NOT
    // enum-locked here, so a template vocabulary change doesn't break validation.
    // Control flow keys on `nonActionable` + actionable count, never on specific
    // verdict strings.
    verdict: { type: 'string' },
    needsHumanDecision: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          location: { type: 'string' }, // File:Line
          severity: { type: 'string' }, // Critical | Major | Minor per template (not enum-locked)
          description: { type: 'string' }, // the issue and its impact
          recommendation: { type: 'string' }, // suggested resolution
          // true = by-design / won't-fix: fixing it would be wrong (byte-consistent
          // with a source of truth, matches an existing convention, resolves only
          // post-merge, etc.). Put the justification in `description`. Non-actionable
          // findings do NOT block convergence; surfaced to the human at the merge gate.
          nonActionable: { type: 'boolean' },
        },
      },
    },
  },
  required: ['verdict'],
}
const FIX_SCHEMA = {
  type: 'object',
  properties: { fixed: { type: 'boolean' }, needsHumanDecision: { type: 'boolean' } },
  required: ['fixed'],
}

// ── Phase 0: ensure machine contracts (md template → contract.json) ────────
// The KB markdown template is the single source of truth; the machine contract
// is DERIVED from it by an AI generator agent (this sandbox has no filesystem
// access, so all file work — hashing, cache check, generation, validation —
// happens in the agent via `.claude/workflows/contracts/ensure-contract.mjs`).
// Cache-by-hash: the contract stores the template's sha256; unchanged hash →
// reuse (no regeneration), changed hash → regenerate. Malformed/failed contract
// → the loose skeleton above is used as-is (the run never breaks) and the
// fallback is reported in the run result (`contracts[].status: 'fallback-loose'`).
// The pattern is per-template and reusable: add a spec below to contract another
// template — e.g. { name: 'pr', template: '.../pr-template.md', contract:
// '.claude/workflows/contracts/pr.contract.json', skeleton: PR_SCHEMA, mirrors: ... }
// once the PR return value grows beyond a handle. See ADR
// 2026-07-12-ai-generated-template-contracts.
const CONTRACT_SPECS = [
  {
    name: 'code-review',
    template: '.pair/knowledge/guidelines/collaboration/templates/code-review-template.md',
    contract: '.claude/workflows/contracts/code-review.contract.json',
    skeleton: LOOSE_REVIEW_SCHEMA,
    mirrors:
      'verdict ← the "Overall Assessment" options; findings[].severity ← the "Detailed Review Comments" severity levels',
  },
]

const CONTRACT_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string' }, // cache-hit | regenerated | failed
    contract: { type: 'object' }, // parsed contract.json: { $meta, vocabulary, schema }
  },
  required: ['status'],
}

// Last-resort consumer-side guard (pure, value-agnostic): accept the generated
// schema only if it keeps the structure the control flow depends on. Generic
// contract integrity (hash, vocabulary, JSON-Schema shape) is validated by
// ensure-contract.mjs — the canonical validator; the sandbox cannot import it,
// so this is a deliberately minimal duplicate covering only THIS consumer's needs.
function usableSchema(contract) {
  try {
    const s = contract?.schema
    if (!s || s.type !== 'object' || !s.properties || typeof s.properties !== 'object') return null
    if (s.properties.verdict?.type !== 'string') return null
    if (s.properties.needsHumanDecision?.type !== 'boolean') return null
    const findings = s.properties.findings
    if (findings?.type !== 'array') return null
    const fp = findings.items?.properties
    if (!fp || fp.nonActionable?.type !== 'boolean' || !fp.severity || !fp.description) return null
    return s
  } catch {
    return null
  }
}

async function ensureContract(spec) {
  const res = await agent(
    `Ensure the machine contract for the \`${spec.name}\` template. Template: \`${spec.template}\`. Contract artifact: \`${spec.contract}\` (git-ignored derived cache). Use \`node .claude/workflows/contracts/ensure-contract.mjs\` (\`check\`, then \`write\`) for ALL hash/cache/validation work — NEVER hand-roll hashing or freshness logic. If \`check\` reports \`fresh\`, return the cached contract file content unchanged with status \`cache-hit\`. Otherwise READ the template and generate the contract: take this skeleton schema and tighten ONLY the fields that mirror template vocabulary (${spec.mirrors}) into \`enum\`s, leaving every other field untouched: ${JSON.stringify(spec.skeleton)}. Also fill the contract's \`vocabulary\` object (e.g. verdictOptions, severities, findingFields) from the template. Persist via the \`write\` command (it validates the draft and stamps the template hash), then return status \`regenerated\` plus the final contract content. Never modify the template. If generation or validation fails after one retry, return status \`failed\` with no contract.`,
    { agentType: 'contract-generator', phase: 'Contracts', label: `contract:${spec.name}`, schema: CONTRACT_RESULT_SCHEMA },
  )
  const schema = usableSchema(res?.contract)
  return {
    name: spec.name,
    status: schema ? (res?.status ?? 'regenerated') : 'fallback-loose',
    contract: schema ? res.contract : null,
    schema: schema ?? spec.skeleton,
  }
}

// Contracts are ensured up-front (skipped for an empty batch — nothing to drive).
const contracts = STORIES.length ? await parallel(CONTRACT_SPECS.map((s) => () => ensureContract(s))) : []
const crContract = contracts.find((c) => c.name === 'code-review')
// Schema the reviewer returns: template-derived when the contract is usable,
// the loose skeleton otherwise. Control flow stays value-agnostic either way.
const REVIEW_SCHEMA = crContract?.schema ?? LOOSE_REVIEW_SCHEMA
// Reviewer prompt vocabulary: `verdictOptions` and `severities` are CANONICAL,
// required contract keys (ensure-contract.mjs's validateContract rejects any
// contract missing either) — so whenever a contract IS present, both are
// guaranteed populated and the schema (enum-locked from these same keys) and
// the prompt text can never diverge. The hardcoded arrays below are the
// single fallback, used ONLY in the true fallback-loose case (no usable
// contract at all, `crContract?.contract` is null) — never a second,
// independently-drifting vocabulary source.
const REVIEW_VOCAB = crContract?.contract?.vocabulary
const DEFAULT_SEVERITIES = ['Critical', 'Major', 'Minor']
const DEFAULT_VERDICTS = ['Approved', 'Approved with Comments', 'Request Changes', 'Comment Only']
const SEVERITIES = (REVIEW_VOCAB?.severities ?? DEFAULT_SEVERITIES).join(', ')
const VERDICTS = (REVIEW_VOCAB?.verdictOptions ?? DEFAULT_VERDICTS).join(', ')

// ── Isolation convention ───────────────────────────────────────────────────
// The AUTHORING chain (implement -> PR -> fix) runs inside a dedicated, PERSISTENT
// per-story git worktree OUTSIDE the repo, so the main working tree is never
// touched and parallel stories never collide. The worktree persists across the
// whole chain (implement/PR/fix share it) so the untracked checkpoint under
// .pair/working/ survives context resets. The reviewer stays read-only (gh-based,
// no branch switch) so it needs no worktree. Worktrees are cleaned up after merge.
function wtClause(story) {
  return `ISOLATION (mandatory): do ALL git/file work inside a dedicated worktree at \`../pair-worktrees/${story.id}\` — create-or-reuse it: \`git worktree add ../pair-worktrees/${story.id} -B ${story.branch} origin/main\` on first setup, or \`git worktree add ../pair-worktrees/${story.id} ${story.branch}\` if the branch already has commits; if the path already exists, just \`cd\` into it. NEVER modify the repo's main working tree and NEVER switch its branch.`
}

// Reviewer isolation: read-only inspection in a DETACHED throwaway worktree pinned
// to the PR's pushed head. Detached HEAD never occupies the branch, so it can't
// collide with the authoring worktree (which holds it) or with other stories'
// reviewers in a parallel batch — and it never touches the main checkout's branch.
function revWtClause(story) {
  const p = `../pair-worktrees/${story.id}-review`
  return `ISOLATION (mandatory, read-only): NEVER switch the main checkout's branch. Inspect the code in a DETACHED throwaway worktree pinned to the PR's current pushed head: \`git worktree remove --force ${p} 2>/dev/null; git fetch origin -q; git worktree add --detach ${p} origin/${story.branch}\`, then \`cd ${p}\`. Read the code there (the untracked checkpoint is absent here — good, stay blind to it). When finished, remove it: \`git worktree remove --force ${p}\`.`
}

// ── Per-story lifecycle ──────────────────────────────────────────────────
async function driveStory(story) {
  const tag = `#${story.id}`
  const resuming = Number.isInteger(story.prNumber)
  let pr = resuming ? { prNumber: story.prNumber } : null

  if (!resuming) {
    // 1. IMPLEMENT — fresh implementer in the story worktree; writes checkpoint.
    const impl = await agent(
      `Implement story ${tag} ("${story.title}") on branch \`${story.branch}\`, following /pair-process-implement, the reference skills, and the task/commit templates.${story.notes ? ` SCOPE DIRECTIVE (overrides the issue body where they conflict): ${story.notes}` : ''} ${wtClause(story)} Test-first. Run scoped quality gates. On completion write the story checkpoint via /pair-capability-checkpoint $mode=write (it lives in the worktree) so a fresh instance can open the PR with zero prior context. Do NOT open the PR yet. Do NOT merge.`,
      { agentType: 'implementer', phase: 'Implement', label: `impl:${tag}`, schema: STEP_SCHEMA },
    )
    if (!impl) return { story, status: 'failed-implement' }

    // 2. OPEN PR — fresh implementer instance; resumes from checkpoint (context reset)
    pr = await agent(
      `You are resuming story ${tag}.${story.notes ? ` SCOPE DIRECTIVE: ${story.notes}` : ''} ${wtClause(story)} Read the checkpoint (/pair-capability-checkpoint $mode=resume) — do not re-derive. Push the branch and open the PR for \`${story.branch}\` using the PR template. Put everything a reviewer needs (rationale, decisions, ADR links) in the PR description — the reviewer cannot see the checkpoint. Return the PR number. Do NOT merge.`,
      { agentType: 'implementer', phase: 'PR', label: `pr:${tag}`, schema: PR_SCHEMA },
    )
    if (!pr?.prNumber) return { story, status: 'failed-pr' }
  }

  // 3. REVIEW <-> FIX loop — reviewer is independent & BLIND to the handoff.
  //    Converges when every ACTIONABLE finding is resolved. Findings the reviewer
  //    marks nonActionable (by-design / won't-fix, justified) don't block: they're
  //    carried to the merge gate as `acceptedFindings` for the human to see.
  //    nonActionable is NOT a scope filter — "not this story's original scope" alone
  //    never qualifies; only "fixing it would be genuinely wrong" does. See ADL
  //    decision-log/2026-07-11-agent-execution-layer.md (amended 2026-07-18).
  let round = 0
  let prevFindings = []
  let accepted = []
  while (true) {
    const review = await agent(
      `Independently review PR #${pr.prNumber} for story ${tag}, following /pair-process-review. ${revWtClause(story)} Review ONLY from the story's acceptance criteria, the PR diff+description, and the code. Do NOT read .pair/working/. Report EVERY finding regardless of severity (including minor/nit), using the code-review-template vocabulary: each finding = \`location\` (File:Line), \`severity\` ∈ {${SEVERITIES}}, \`description\` (issue + impact), \`recommendation\`; verdict ∈ {${VERDICTS}}. Set \`nonActionable: true\` ONLY if fixing it would be genuinely WRONG (byte-consistent with a source of truth, matches an existing convention/already-tracked deferred plan, resolves only after merge, etc.) — being outside this story's originally stated scope is NOT by itself a reason to mark something nonActionable: a real, fixable gap found during review gets fixed in this same PR unless it is large enough to warrant its own story (state that explicitly in the description if so). ${round > 0 ? `Verify these prior findings were genuinely resolved: ${JSON.stringify(prevFindings)}.` : ''} Return findings and a verdict.`,
      { agentType: 'reviewer', phase: 'Review', label: `rev:${tag} r${round}`, schema: REVIEW_SCHEMA },
    )
    const findings = review?.findings ?? []
    const actionable = findings.filter((f) => !f.nonActionable)
    accepted = findings.filter((f) => f.nonActionable)
    // Converge once nothing actionable remains (by-design findings don't block).
    if (actionable.length === 0) break
    if (round >= MAX_FIX_ROUNDS || review?.needsHumanDecision)
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: actionable, acceptedFindings: accepted }

    round++
    prevFindings = actionable
    // FIX — implementer resumes checkpoint (if present) + resolves actionable findings.
    const fix = await agent(
      `Resume story ${tag}. ${wtClause(story)} Read the checkpoint if present (/pair-capability-checkpoint $mode=resume); otherwise work from the PR diff + code. Resolve EVERY one of these actionable review findings on PR #${pr.prNumber} — including minor/nit, do not defer any: ${JSON.stringify(prevFindings)}. Commit, push, and post a remediation comment mapping each finding to what changed. Only for a genuine design disagreement set needsHumanDecision instead of forcing a fix. Do NOT merge.`,
      { agentType: 'implementer', phase: 'Review', label: `fix:${tag} r${round}`, schema: FIX_SCHEMA },
    )
    if (!fix) return { story, prNumber: pr.prNumber, status: 'failed-fix' }
    if (fix.needsHumanDecision)
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: prevFindings, acceptedFindings: accepted }
  }

  // STOP at the merge boundary — human decides the merge.
  return { story, prNumber: pr.prNumber, status: 'ready-for-merge', acceptedFindings: accepted }
}

// ── Fan-out over the mutex-safe batch ────────────────────────────────────
const results = await parallel(STORIES.map((s) => () => driveStory(s)))
return {
  // Contract provenance per template — `fallback-loose` is the logged signal
  // that a contract could not be derived and the loose skeleton was used (AC4).
  contracts: contracts.map(({ name, status }) => ({ name, status })),
  batch: results.filter(Boolean),
  note: 'PRs are ready-for-merge or escalated. Merge is the human gate — review the list, merge, then re-run with the next mutex-safe batch.',
}
