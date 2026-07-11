export const meta = {
  name: 'implement-batch',
  description:
    'Drive a mutex-safe batch of ready Pair stories, each to a review-approved PR (implement -> PR -> independent review <-> fix loop). Stops at PR-ready; NEVER merges (human gate).',
  phases: [{ title: 'Implement' }, { title: 'PR' }, { title: 'Review' }],
}

// ── Input ────────────────────────────────────────────────────────────────
// args.stories = the batch to drive THIS run. MUST be pre-filtered to be
// mutex-safe: no two stories here may touch the same shared skill/file
// (pair-next, pair-process-review, record-decision, apps/pair-cli, templates).
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
const REVIEW_SCHEMA = {
  // Mirrors code-review-template.md: the Overall Assessment verdict options and the
  // Detailed Review Comments finding fields (File:Line / severity / description /
  // recommendation). The posted report is the artifact; this is the return value.
  type: 'object',
  properties: {
    // Free string mirroring code-review-template.md's "Overall Assessment" options
    // (Approved / Approved with Comments / Request Changes / Comment Only) — NOT
    // enum-locked, so a template vocabulary change doesn't break validation. Control
    // flow keys on `nonActionable` + actionable count, never on specific verdict strings.
    // (Target: derive this contract from the template via an AI-generated contract.json —
    // see the execution-layer generalization story.)
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
      `Implement story ${tag} ("${story.title}") on branch \`${story.branch}\`, following /pair-process-implement, the reference skills, and the task/commit templates. ${wtClause(story)} Test-first. Run scoped quality gates. On completion write the story checkpoint via /pair-capability-checkpoint $mode=write (it lives in the worktree) so a fresh instance can open the PR with zero prior context. Do NOT open the PR yet. Do NOT merge.`,
      { agentType: 'implementer', phase: 'Implement', label: `impl:${tag}`, schema: STEP_SCHEMA },
    )
    if (!impl) return { story, status: 'failed-implement' }

    // 2. OPEN PR — fresh implementer instance; resumes from checkpoint (context reset)
    pr = await agent(
      `You are resuming story ${tag}. ${wtClause(story)} Read the checkpoint (/pair-capability-checkpoint $mode=resume) — do not re-derive. Push the branch and open the PR for \`${story.branch}\` using the PR template. Put everything a reviewer needs (rationale, decisions, ADR links) in the PR description — the reviewer cannot see the checkpoint. Return the PR number. Do NOT merge.`,
      { agentType: 'implementer', phase: 'PR', label: `pr:${tag}`, schema: PR_SCHEMA },
    )
    if (!pr?.prNumber) return { story, status: 'failed-pr' }
  }

  // 3. REVIEW <-> FIX loop — reviewer is independent & BLIND to the handoff.
  //    Converges when every ACTIONABLE finding is resolved. Findings the reviewer
  //    marks nonActionable (by-design / won't-fix, justified) don't block: they're
  //    carried to the merge gate as `acceptedFindings` for the human to see.
  let round = 0
  let prevFindings = []
  let accepted = []
  while (true) {
    const review = await agent(
      `Independently review PR #${pr.prNumber} for story ${tag}, following /pair-process-review. ${revWtClause(story)} Review ONLY from the story's acceptance criteria, the PR diff+description, and the code. Do NOT read .pair/working/. Report EVERY finding regardless of severity (including minor/nit), using the code-review-template vocabulary: each finding = \`location\` (File:Line), \`severity\` ∈ {Critical, Major, Minor}, \`description\` (issue + impact), \`recommendation\`; verdict ∈ {Approved, Approved with Comments, Request Changes, Comment Only}. For any finding that is by-design / won't-fix — fixing it would be WRONG (byte-consistent with a source of truth, matches an existing convention in the same file, resolves only after merge, etc.) — set \`nonActionable: true\` and put the justification in \`description\`. ${round > 0 ? `Verify these prior findings were genuinely resolved: ${JSON.stringify(prevFindings)}.` : ''} Return findings and a verdict.`,
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
  batch: results.filter(Boolean),
  note: 'PRs are ready-for-merge or escalated. Merge is the human gate — review the list, merge, then re-run with the next mutex-safe batch.',
}
