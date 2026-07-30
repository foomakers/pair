export const meta = {
  name: 'implement-batch',
  description:
    'Drive a mutex-safe batch of ready Pair stories, each to a review-approved PR (implement -> PR -> independent review <-> fix loop). Stops at PR-ready; NEVER merges (human gate).',
  whenToUse:
    'REQUIRED args shape: {"stories":[{"id":"234","title":"...","branch":"feature/US-234-..."}]} — ' +
    'a bare list of issue refs ("#234 #236") is NOT accepted and the run throws: title feeds the ' +
    'prompts and branch feeds `git worktree add`, and the sandbox has no gh/filesystem access to ' +
    'derive them. Optional per story: notes (scope directive) and prNumber (re-enter the review ' +
    'loop on an existing PR). Pre-filter for mutex safety — no two stories may touch the same ' +
    'shared skill/file. A dependency must be MERGED, not just PR-ready, before its dependent ' +
    'enters a batch. Prefer ONE long run over pause/resume cycles: each stop kills the agents and ' +
    'loses the in-worktree review log.',
  phases: [
    { title: 'Contracts', model: 'haiku' },
    { title: 'Implement', model: 'opus' },
    { title: 'PR', model: 'sonnet' },
    { title: 'Review', model: 'opus' },
  ],
}

// ── Model / effort policy ──────────────────────────────────────────────────
// MODEL is set per ROLE in each agent's frontmatter (.claude/agents/*.md): the
// stable default — implementer & reviewer -> opus, contract-generator -> haiku.
// EFFORT is set per STEP below in the agent() opts (the guaranteed lever for a
// running workflow), scaled to the step's difficulty. The one MODEL exception is
// the PR-open step: an implementer doing light checkpoint->PR authoring, dialed
// down to sonnet/medium via opts (opts win over frontmatter). Spend concentrates
// where quality pays: coding (implement/fix, opus/high) and the adversarial
// review gate (opus/xhigh). NOTE: .claude/workflows/ is outside the packages/apps
// prettier gate — keep the one-line opts style already used in this file.

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
// Each story: { id, title, branch }. Add { prNumber } to RESUME an existing PR
// mid-review — implement+PR are skipped and the story re-enters the review<->fix
// loop directly (drives remaining findings, incl. minor, to zero).
// Optional { notes } = a scope directive threaded into the implement+PR prompts
// (overrides the issue body on conflict), e.g. "resolve all findings in ONE PR,
// do not split".
//
// #401: the input is validated LOUDLY. The previous version coerced an unparseable
// string to `undefined` and fell through to `STORIES = []`, so a caller who
// passed a bare list of refs (`args: "#234 #236"`) got a run that spawned ZERO
// agents, exited in ~30ms and returned the SUCCESS-shaped
// `{ batch: [], note: 'PRs are ready-for-merge or escalated…' }` — a silent
// no-op reported as a completed batch, indistinguishable from a real run whose
// stories all failed. An orchestrator asked to drive stories and driving none
// must fail, not report success. An EXPLICIT empty list stays a legal no-op:
// a caller that computed "nothing to do" is not making a mistake.
function parseBatchArgs(raw) {
  let a = raw
  if (typeof a === 'string') {
    const t = a.trim()
    try {
      a = JSON.parse(t)
    } catch {
      throw new Error(
        `implement-batch: \`args\` is a string that is not JSON: ${JSON.stringify(t.slice(0, 60))}. ` +
          `A bare list of issue refs is NOT a valid batch — each story needs { id, title, branch }: ` +
          `title goes into the implement/PR prompts and branch into \`git worktree add\`, and this ` +
          `sandbox has no gh/filesystem access to derive either. Pass, verbatim: ` +
          `{"stories":[{"id":"234","title":"PR state flow…","branch":"feature/US-234-pr-state-flow"}]}`,
      )
    }
  }
  // A bare array is unambiguous — read it as the story list.
  if (Array.isArray(a)) a = { stories: a }
  if (!a || typeof a !== 'object' || !Array.isArray(a.stories))
    throw new Error(
      `implement-batch: \`args\` must be { stories: [...] } (or a bare array of stories). Received: ` +
        `${a === undefined || a === null ? String(a) : JSON.stringify(a).slice(0, 80)}. ` +
        `Nothing was run — this is an input error, not an empty batch.`,
    )
  const stories = a.stories.map((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s))
      throw new Error(`implement-batch: stories[${i}] is not an object: ${JSON.stringify(s)}.`)
    // `#234` and `234` name the same story; normalize once so no prompt, worktree
    // path or marker ever carries a stray `#`.
    const id = String(s.id ?? '').trim().replace(/^#/, '')
    const missing = ['id', 'title', 'branch'].filter(
      k => !String((k === 'id' ? id : s[k]) ?? '').trim(),
    )
    if (missing.length)
      throw new Error(
        `implement-batch: stories[${i}]${id ? ` (#${id})` : ''} is missing ${missing.join(', ')}. ` +
          `All three are required — id + title feed the prompts, branch feeds \`git worktree add\`; ` +
          `an absent one would reach a shell command as \`undefined\`.`,
      )
    return { ...s, id }
  })
  return stories
}
const STORIES = parseBatchArgs(args)
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
  // Mirrors code-review-template.md: the `## Verdict`-line verdict options and the
  // `Findings by severity` finding fields (File:Line / severity / description /
  // recommendation). The posted report is the artifact; this is the return value.
  // This is the loose FALLBACK skeleton: phase-0 (ensure-contract, below) derives an
  // enum-locked version from the template via an AI-generated contract.json; when
  // that contract is missing/stale-and-ungeneratable/malformed, this skeleton is
  // used as-is so the run never breaks.
  type: 'object',
  properties: {
    // Free string mirroring code-review-template.md's `## Verdict`-line options
    // (APPROVED / CHANGES-REQUESTED / TECH-DEBT) — NOT enum-locked here, so a
    // template vocabulary change doesn't break validation.
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
          severity: { type: 'string' }, // Critical | Major | Minor | Questions per template (not enum-locked)
          description: { type: 'string' }, // the issue and its impact
          recommendation: { type: 'string' }, // suggested resolution
          // true = by-design / won't-fix: fixing it would be wrong (byte-consistent
          // with a source of truth, matches an existing convention, resolves only
          // post-merge, etc.). Put the justification in `description`. Non-actionable
          // findings do NOT block convergence; surfaced to the human at the merge gate.
          nonActionable: { type: 'boolean' },
          // When nonActionable, the SPECIFIC disposition that replaces the opaque
          // "non-actionable" label in human-facing output: exactly `Deferred to #<n>`
          // when the finding belongs to a separate tracked story, else a concrete
          // by-design reason (By convention … / Historical record / Forward-ref to
          // unbuilt #<n> / Resolves after merge).
          disposition: { type: 'string' },
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
// #373: sandbox-safe continuation probe. The orchestrator has no FS/gh, so a cheap
// agent in the worktree reports two signals used to decide whether round-0 must post
// a fresh first review:
//   - logExists: the persisted working log is present → an in-flight cycle to CONTINUE
//     (silent round-0 + seeds `cycleHasRemediation` so convergence still synthesizes+cleans).
//   - firstReviewPosted: a first-review comment already exists on the PR (PR-side
//     corroboration). Guards the double-first-review the log-only signal can miss when
//     the log is GONE but a first review was already posted — e.g. a converged-but-not-
//     yet-merged PR re-entering a batch (log deleted at convergence, #373 finding 1), or
//     a pruned/recreated worktree / out-of-band clone that lost the untracked log
//     (#373 finding 3). Either signal suppresses a second first-review.
const PROBE_SCHEMA = {
  type: 'object',
  properties: { logExists: { type: 'boolean' }, firstReviewPosted: { type: 'boolean' } },
  required: ['logExists', 'firstReviewPosted'],
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
// once the PR return value grows beyond a handle. See
// ADR-016 (adr-016-ai-generated-template-contracts.md).
const CONTRACT_SPECS = [
  {
    name: 'code-review',
    template: '.pair/knowledge/guidelines/collaboration/templates/code-review-template.md',
    contract: '.claude/workflows/contracts/code-review.contract.json',
    skeleton: LOOSE_REVIEW_SCHEMA,
    mirrors:
      'verdict ← the `## Verdict`-line options; findings[].severity ← the `Findings by severity` severity levels',
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
    { agentType: 'contract-generator', phase: 'Contracts', label: `contract:${spec.name}`, effort: 'low', schema: CONTRACT_RESULT_SCHEMA },
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
const DEFAULT_SEVERITIES = ['Critical', 'Major', 'Minor', 'Questions']
const DEFAULT_VERDICTS = ['APPROVED', 'CHANGES-REQUESTED', 'TECH-DEBT']
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

// #373 finding 3: the escalate-flush shared block — supersede-the-prior-flush + the manual
// out-of-band CONVENTION + the untracked-worktree-persistence note — is identical across BOTH
// escalation prompts (MAX_FIX_ROUNDS + needsHumanDecision). Authored ONCE here so a future
// change to the convention or the worktree-persistence wording is made in one place and can't
// silently diverge between the two paths (they had already drifted slightly before this).
// Part A — PR-comment minimize/supersede. Operates ONLY on already-posted PR comments, so it
// does NOT depend on a working log and MUST be emitted on EVERY escalation (both arms), else a
// stale prior flush or a prior convergence's "ready for merge" synthesis is left visible next to
// an active escalation (finding: the no-log arm previously omitted this).
function flushMinimize(prNumber) {
  return `FIRST minimize / mark-outdated any prior escalate-flush comment already posted on PR #${prNumber} — each flush "summarizes the rounds so far", so a new one SUPERSEDES the last; only the newest escalate-flush should stay visible (no-op if there is none). ALSO minimize / mark-outdated any prior final-remediation/synthesis comment left by an EARLIER convergence of this SAME cycle (a converged-but-unmerged PR that was re-run, found new findings and is now escalating): its "review clean / ready for merge" verdict directly contradicts an active escalation, so it must NOT stay visible alongside this flush — mirror the convergence-synthesis path (no-op if there is none), but NEVER minimize the first-review comment.`
}

// Part B — the log/out-of-band CONVENTION + untracked-worktree-persistence note. Only meaningful
// when a working log exists (a continuing cycle), so it is emitted only on the log-backed arms.
function flushLogConvention(story) {
  return `CONVENTION (state it in the comment so the human/orchestrator knows): any further rework or re-review — including manual out-of-band rounds — should be funneled into THIS same working log (append), NOT posted as standalone PR comments; the next orchestrated run on this story continues the same cycle and its convergence will synthesize ONE final remediation and minimize these intermediate comments. Note too (in the comment) that this working log is an UNTRACKED file living ONLY in the persistent authoring worktree \`../pair-worktrees/${story.id}\`, so that worktree must be PRESERVED until merge — if it is pruned/recreated the audit log is lost (this flush + the first-review comment still remain on the PR, and the PR-side first-review signal still prevents a duplicate first review on the next run).`
}

// Full convention = minimize (Part A) + log/out-of-band note (Part B), for the log-backed arms.
function flushConvention(story, prNumber) {
  return `${flushMinimize(prNumber)} ${flushLogConvention(story)}`
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
      { agentType: 'implementer', phase: 'Implement', label: `impl:${tag}`, effort: 'high', schema: STEP_SCHEMA },
    )
    if (!impl) return { story, status: 'failed-implement' }

    // 2. OPEN PR — fresh implementer instance; resumes from checkpoint (context reset)
    pr = await agent(
      `You are resuming story ${tag}.${story.notes ? ` SCOPE DIRECTIVE: ${story.notes}` : ''} ${wtClause(story)} Read the checkpoint (/pair-capability-checkpoint $mode=resume) — do not re-derive. Push the branch and open the PR for \`${story.branch}\` using the PR template. Put everything a reviewer needs (rationale, decisions, ADR links) in the PR description — the reviewer cannot see the checkpoint. Return the PR number. Do NOT merge.`,
      { agentType: 'implementer', phase: 'PR', label: `pr:${tag}`, model: 'sonnet', effort: 'medium', schema: PR_SCHEMA },
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
  //
  //    PR-COMMENT POLICY (noise reduction — the WHOLE cycle of a PR is ONE logical cycle,
  //    #367 in-loop + #373 across-runs): regardless of how many runs / escalations /
  //    manual out-of-band rounds it takes to converge, a PR shows AT MOST one first-review
  //    comment + AT MOST one final remediation comment.
  //    - The FIRST review IS posted on the PR (the independent review artifact).
  //    - The fix<->re-review rounds are NOT commented per round; each round is appended
  //      to a working log `.pair/working/reviews/<id>.md` (orchestrator-side audit; the
  //      re-reviewer stays BLIND to it — it receives prior findings via the prompt). The
  //      log is the SINGLE SOURCE OF TRUTH for cycle state ACROSS runs: its existence ==
  //      an in-flight cycle to CONTINUE, not restart.
  //    - CONTINUATION (#373): on a resume run a SILENT round-0 (no second first-review) is
  //      triggered by EITHER signal — the working log still exists (an in-flight cycle) OR a
  //      first-review comment already exists on the PR (PR-side corroboration, so a converged-
  //      but-unmerged re-run or a lost/pruned untracked log can't produce a duplicate first
  //      review). The PR-side signal is DETERMINISTIC: the first review emits a fixed hidden
  //      HTML-comment marker and the probe does an EXACT substring match on it — NOT a semantic
  //      reading of the comment's structure — so the probe can't misclassify a
  //      non-review comment into silencing a real first review (finding 1). The probe runs
  //      at sonnet/low (not haiku): its job orchestrates a worktree + a `gh` fetch + a
  //      substring match, and a mis-report fails OPEN toward a duplicate first review (the
  //      very noise this story removes), so the reliability of those tool steps is worth the
  //      small tier bump over the cheapest model. Log existence
  //      additionally seeds `cycleHasRemediation` so convergence still
  //      synthesizes+cleans even if round-0 converges immediately; a first-review-only signal
  //      (no log) does NOT seed it, so a clean round-0 adds nothing and never synths a gone log.
  //    - At convergence ONE synthesized remediation comment is posted, written
  //      CONTEXTUALLY to the first review (maps EVERY finding across ALL runs in the log
  //      -> resolution + accepted dispositions + final verdict), AND any prior intermediate
  //      comments (escalate-flush, manual out-of-band rounds, OR a prior convergence's own
  //      final-remediation comment on a re-run→re-converge cycle) are minimized / marked
  //      outdated so only first-review + this one remediation remain visible; the log is
  //      then deleted.
  //    - On escalation the log is KEPT and flushed to the PR as the continuation anchor. A
  //      new escalate-flush SUPERSEDES the prior one (minimized/marked-outdated in place), so
  //      repeated escalations across runs leave only the newest flush visible, not a pile. It
  //      ALSO minimizes any prior convergence's own final-remediation comment (a converged-but-
  //      unmerged PR re-run that now escalates) — a stale "ready for merge" verdict must not
  //      stay visible next to an active escalation (never the first-review comment), mirroring
  //      the convergence-synthesis minimize set.
  //    - MANUAL OUT-OF-BAND CONVENTION (#373): if a human/orchestrator takes over rework or
  //      re-review after an escalate, they funnel their notes into THIS same working log
  //      (append) rather than posting standalone PR comments; the next orchestrated run
  //      continues the cycle and its convergence synthesizes one final remediation +
  //      minimizes the intermediates. (This is a documented CONVENTION only — standalone
  //      reviewer/fix agents are NOT edited by #373.)
  //    The workflow runs in a sandbox (no FS/gh), so the log existence-probe, comment
  //    posting, and comment minimizing are all delegated to agents running in the worktree.
  const reviewLog = `.pair/working/reviews/${story.id}.md`
  // #373: the first-review comment always emits this hidden HTML-comment marker verbatim
  // (invisible in rendered markdown → no visible noise). The continuation probe detects a
  // prior first review by an EXACT substring match on this marker, NOT by a semantic reading
  // of the comment's structure — so the cheap sonnet/low probe makes no classification
  // judgment and can't false-positive a non-review comment into silencing a real first
  // review (the story's High-impact over-silencing risk). Minimized/outdated comments still
  // match: gh returns their raw body, which still contains the marker.
  const firstReviewMarker = `<!-- pair:first-review #${story.id} PR#${pr.prNumber} -->`
  // #373: continuation detection. Two signals, only meaningful on a resume run (a fresh
  // story branches from origin/main, so neither a prior cycle log nor a prior first-review
  // comment exists): `logExists` = an in-flight cycle to continue; `firstReviewPosted` =
  // PR-side corroboration (deterministic marker match) that a first review already went out
  // (so we never post a second one even if the untracked log is gone — findings 1 & 3).
  let isContinuation = false
  let firstReviewPosted = false
  // #401: the probe used to be gated on `resuming`, i.e. on the CALLER having passed
  // `prNumber` in the story object. That made the duplicate-first-review guard
  // depend on the caller's bookkeeping, and a `Workflow({resumeFromRunId})` resume
  // replays the implement/PR agents from cache with the SAME args — so
  // `story.prNumber` is absent, `resuming` is false, the probe never runs,
  // `firstReviewPosted` stays false, and round-0 posts ANOTHER first review on a PR
  // that already carries one. Observed three times on a single story across three
  // pause/resume cycles: that story was re-reviewed from scratch each time instead of
  // advancing through its fix rounds, and ended up the least-progressed of its batch.
  // The gate is now the PR's existence — a fact the script knows — instead of an
  // argument the caller must remember. One cheap sonnet/low probe per story per run
  // costs far less than one duplicated opus/xhigh review round, and on a genuinely
  // fresh story both signals come back false, leaving the fresh path's behaviour
  // identical (the first review still posts).
  if (pr?.prNumber) {
    const probe = await agent(
      `Story ${tag}: read-only CONTINUATION PROBE (no review, no edits). ${wtClause(story)} Report TWO booleans: (1) \`logExists\` — is the review working log \`${reviewLog}\` present in the worktree? (2) \`firstReviewPosted\` — does PR #${pr.prNumber} ALREADY carry the first-review comment? Match it DETERMINISTICALLY, not by judgment: fetch the PR comments via \`gh\` and report whether ANY comment's raw body contains the EXACT marker substring \`${firstReviewMarker}\` (the first review always emits this hidden marker verbatim; a minimized/outdated comment still counts — its raw body still contains the marker). Do NOT infer from a comment's structure or tone — it is a plain substring match. Return { logExists, firstReviewPosted }. Do NOT create, modify, or delete the log, do NOT post or minimize any comment, and do NOT run the review — this is a cheap probe to decide whether an in-flight review cycle is being CONTINUED and whether a first review was already posted.`,
      { agentType: 'implementer', phase: 'Review', label: `probe:${tag}`, model: 'sonnet', effort: 'low', schema: PROBE_SCHEMA },
    )
    // #373 finding 4: a failed / malformed / schema-invalid probe return yields BOTH signals
    // false (via `?.x === true`), so round-0 falls through to a POSTED first review. This
    // fail-open direction is deliberate: degrade toward VISIBILITY (post a review a human can
    // see) rather than fail-silent (suppress it). The dangerous case — a genuine continuation
    // where a total probe failure re-posts a first review — is low-probability (requires an
    // agent/schema failure on a resume of an in-flight cycle) and self-announcing (a visible
    // duplicate is noticed and pruned), whereas silent over-suppression of a real review is
    // not. The deterministic marker above removes the misclassification failure mode; only a
    // hard probe failure reaches this fallback.
    isContinuation = probe?.logExists === true
    firstReviewPosted = probe?.firstReviewPosted === true
  }
  let round = 0
  let prevFindings = []
  let accepted = []
  // #373: `cycleHasRemediation` tracks whether THIS CYCLE (across all runs it spans) has
  // any remediation state to synthesize — not merely whether a fix happened this run. On a
  // continuation (log present) it is seeded true so an immediate round-0 convergence still
  // posts the ONE final synthesis + deletes the log (never leaves an escalate-flush as the
  // last word). A converged-but-unmerged re-run has NO log (firstReviewPosted true,
  // isContinuation false) → stays false, so a clean round-0 adds nothing and never tries to
  // synth a deleted log. A fresh cycle starts false, so a clean first review stands alone (AC6).
  let cycleHasRemediation = isContinuation
  while (true) {
    // #373: round-0 is the FIRST (posted) review ONLY on a genuinely fresh cycle — no
    // in-flight log AND no first-review comment already on the PR. Either signal makes
    // round-0 a SILENT re-review, so a PR never accrues a second first-review.
    const first = round === 0 && !isContinuation && !firstReviewPosted
    const review = await agent(
      `Independently review PR #${pr.prNumber} for story ${tag}, following /pair-process-review. ${revWtClause(story)} Review ONLY from the story's acceptance criteria, the PR diff+description, and the code. Do NOT read .pair/working/. Report EVERY finding regardless of severity (including minor/nit), using the code-review-template vocabulary: each finding = \`location\` (File:Line), \`severity\` ∈ {${SEVERITIES}}, \`description\` (issue + impact), \`recommendation\`; verdict ∈ {${VERDICTS}}. Set \`nonActionable: true\` ONLY if fixing it would be genuinely WRONG (byte-consistent with a source of truth, matches an existing convention/already-tracked deferred plan, resolves only after merge, etc.) — being outside this story's originally stated scope is NOT by itself a reason to mark something nonActionable: a real, fixable gap found during review gets fixed in this same PR unless it is large enough to warrant its own story (state that explicitly in the description if so). Whenever you set \`nonActionable: true\`, ALSO set \`disposition\` — a specific reason that replaces the bare label: write exactly \`Deferred to #<number>\` when the finding belongs to a separate tracked story (file one via /pair-capability-write-issue if none exists yet), otherwise a concrete by-design reason (\`By convention …\` / \`Historical record\` / \`Forward-ref to unbuilt #<n>\` / \`Resolves after merge\`); never leave "non-actionable" as the only explanation. ${first ? `This is the FIRST review: POST your full review report as a PR comment on #${pr.prNumber} (code-review-template structure), and include the marker line \`${firstReviewMarker}\` VERBATIM as the first line of the comment body — it is an HTML comment (invisible in the rendered markdown, so no visible noise) that lets a later resume detect this first review by an EXACT substring match rather than a semantic reading (finding 1). Then return findings + verdict.` : prevFindings.length
            ? `This is a RE-REVIEW: do NOT post any PR comment (the orchestrator synthesizes the cycle at the end). Return findings + verdict only. Verify these prior findings were genuinely resolved: ${JSON.stringify(prevFindings)}.`
            : `This is a RE-REVIEW on a resumed in-flight cycle (round-0 of this run carries no prior findings): do a FRESH, independent full review pass. do NOT post any PR comment (the orchestrator synthesizes the cycle at the end). Return findings + verdict only.`} Return findings and a verdict.`,
      { agentType: 'reviewer', phase: 'Review', label: `rev:${tag} r${round}`, effort: 'xhigh', schema: REVIEW_SCHEMA },
    )
    const findings = review?.findings ?? []
    const actionable = findings.filter((f) => !f.nonActionable)
    accepted = findings.filter((f) => f.nonActionable)
    // Converge once nothing actionable remains (by-design findings don't block).
    if (actionable.length === 0) break
    if (round >= MAX_FIX_ROUNDS || review?.needsHumanDecision) {
      // #373 finding 1: emit a PR-visible escalation UNLESS this run's round-0 ALREADY posted
      // the first review (`first === true`) carrying these same findings. The gap this closes:
      // a SILENT re-review that escalates with no log — a resumed PR whose prior first review
      // exists but whose untracked working log was never written / was pruned (firstReviewPosted
      // true, isContinuation false → cycleHasRemediation false, first false). Without the `!first`
      // arm the new blocking concern surfaced ONLY in the batch return value and a later resume
      // repeated the silent escalation. The log read is BEST-EFFORT: only a continuing cycle
      // (cycleHasRemediation) has a log to anchor to; the no-log arm escalates from inline findings.
      if (cycleHasRemediation || !first) {
        const logClause = cycleHasRemediation
          ? `Read the review log \`${reviewLog}\`. ${flushConvention(story, pr.prNumber)} THEN `
          : `No prior review working log exists (a re-review on a resumed PR whose log was never written or was pruned) — escalate from the inline findings directly. ${flushMinimize(pr.prNumber)} `
        await agent(
          `Story ${tag}: the review<->fix loop is escalating to a human (non-convergence or a design disagreement). ${wtClause(story)} ${logClause}post ONE fresh comment on PR #${pr.prNumber} — written as a response to the first code-review comment — summarizing${cycleHasRemediation ? ' the rounds so far (per finding: what was attempted + current state) and' : ''} the still-open actionable findings: ${JSON.stringify(actionable)}.${cycleHasRemediation ? ' Do NOT delete the log — it is the continuation anchor for this cycle.' : ''} Do NOT merge.`,
          { agentType: 'implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
        )
      }
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: actionable, acceptedFindings: accepted }
    }

    round++
    prevFindings = actionable
    cycleHasRemediation = true
    // FIX — implementer resumes checkpoint (if present) + resolves actionable findings.
    // Logs the round to the working review log INSTEAD of posting a per-round PR comment.
    const fix = await agent(
      `Resume story ${tag}. ${wtClause(story)} Read the checkpoint if present (/pair-capability-checkpoint $mode=resume); otherwise work from the PR diff + code. Resolve EVERY one of these actionable review findings on PR #${pr.prNumber} — including minor/nit, do not defer any: ${JSON.stringify(prevFindings)}. Commit and push. Do NOT post a remediation PR comment; INSTEAD append this round to the working log \`${reviewLog}\` (create it if absent): list each finding and exactly what changed to resolve it, with commit refs. Only for a genuine design disagreement set needsHumanDecision instead of forcing a fix. Do NOT merge.`,
      { agentType: 'implementer', phase: 'Review', label: `fix:${tag} r${round}`, effort: 'high', schema: FIX_SCHEMA },
    )
    // failed-fix: the fixer died mid-round; a partial working log may exist. Surface
    // its path in the return so the human / next resume can find (and clean) it.
    if (!fix) return { story, prNumber: pr.prNumber, status: 'failed-fix', reviewLog: cycleHasRemediation ? reviewLog : undefined }
    if (fix.needsHumanDecision) {
      // No guard here: reaching this line means the fix round above already ran, which set
      // `cycleHasRemediation = true` AND had the fixer append this round to the working log.
      // So the log always exists and the flush always fires — there is no no-log arm (unlike
      // the MAX_FIX_ROUNDS escalation at the top of the loop, whose `cycleHasRemediation || !first`
      // guard IS load-bearing because that path can be reached on a silent round-0 re-review).
      await agent(
        `Story ${tag}: escalating a design disagreement to a human. ${wtClause(story)} Read \`${reviewLog}\`. ${flushConvention(story, pr.prNumber)} THEN post ONE fresh comment on PR #${pr.prNumber} (response to the first review) summarizing the remediation rounds so far, the still-open findings (${JSON.stringify(prevFindings)}) and the open decision. Do NOT delete the log — it is the continuation anchor for this cycle. Do NOT merge.`,
        { agentType: 'implementer', phase: 'Review', label: `flush:${tag}`, model: 'sonnet', effort: 'medium' },
      )
      return { story, prNumber: pr.prNumber, status: 'escalate', findings: prevFindings, acceptedFindings: accepted }
    }
  }

  // Converged. If any remediation happened (this run OR a prior run this cycle continues),
  // post ONE synthesized remediation comment (contextual to the first review), minimize any
  // prior intermediate comments, and delete the working log. If the first review was already
  // clean (fresh cycle, no remediation), the first-review comment stands alone — nothing to do.
  if (cycleHasRemediation)
    await agent(
      `Story ${tag} converged: the latest independent re-review found zero actionable findings. ${wtClause(story)} Read the review log \`${reviewLog}\` — it may span MULTIPLE runs / escalations / manual rounds of this ONE cycle. Post ONE remediation comment on PR #${pr.prNumber}, written as a direct RESPONSE to the first code-review comment: map EVERY finding recorded across ALL runs in the log (plus any surfaced during remediation) to how it was resolved (with commit refs), list any accepted/non-actionable findings with their dispositions (${JSON.stringify(accepted)}), and state the final verdict (review clean). THEN minimize / mark-outdated any prior intermediate PR comments on #${pr.prNumber} — earlier escalate-flush comments, any manual out-of-band rework/re-review comments, AND any earlier final-remediation/synthesis comment left by a prior convergence of this same cycle (a converged-but-unmerged PR that was re-run, found new findings and re-converged — do NOT minimize the first review comment) — so that ONLY the first review comment and this one final remediation remain as the visible current state (if there are none to minimize, that step is a no-op). This single comment IS the durable audit of the ENTIRE review<->fix cycle across every run. Then DELETE \`${reviewLog}\`. Do NOT merge.`,
      { agentType: 'implementer', phase: 'Review', label: `synth:${tag}`, model: 'sonnet', effort: 'medium' },
    )

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
