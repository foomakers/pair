---
name: pair-process-review
description: "Reviews a pull request through 6 sequential phases (5 review + optional merge with parent cascade) — validation, technical review, adoption compliance, completeness, decision — to decide whether it merges. Gate before judgment: a red mechanical gate caps the verdict, and the decision is published as the required `pair-review` check plus the synthesized PR state (to-be-reviewed / ready-to-merge / not-approved), so merge stays blocked until gates are green, the review is approved, and (at risk:red) a human approves explicitly. Not a quick build/test sanity check (use /pair-capability-verify-quality). Composes /pair-capability-classify, /pair-capability-verify-quality, /pair-capability-verify-done, /pair-capability-record-decision, /pair-capability-analyze-debt, /pair-capability-assess-security (required), /pair-capability-verify-adoption, /pair-capability-assess-stack (optional)."
version: 0.6.0
author: Foomakers
---

# /pair-process-review — Code Review

Review a pull request through 6 sequential phases (5 review + 1 optional merge). Each phase composes atomic skills and follows the **check → skip → act → verify** pattern for idempotent re-invocation.

## Composed Skills

| Skill                   | Type       | Required | Phase | Purpose                                      |
| ----------------------- | ---------- | -------- | ----- | -------------------------------------------- |
| `/pair-capability-classify`             | Capability | Yes †    | 1     | Risk matrix from the diff (confirm-or-raise) |
| `/pair-capability-verify-quality`       | Capability | Yes      | 2     | Quality gate checking                        |
| `/pair-capability-verify-done`          | Capability | Yes      | 4     | Definition of Done checking                  |
| `/pair-capability-record-decision`      | Capability | Yes      | Any   | Record missing ADR (HALT condition)          |
| `/pair-capability-analyze-debt`         | Capability | Yes      | 4     | Flag tech debt items                         |
| `/pair-capability-assess-security`      | Capability | Yes †    | 2     | Security posture verdict + findings (D22)    |
| `/pair-capability-assess-cost`          | Capability | Yes †    | 2     | Cost class verdict + signals (D22)           |
| `/pair-capability-assess-coupling`      | Capability | Yes †    | 2     | Architecture/coupling balance verdict (D22)  |
| `/pair-capability-verify-adoption`      | Capability | Optional | 3     | Full adoption compliance                     |
| `/pair-capability-assess-stack`         | Capability | Optional | 3     | Tech-stack resolution                        |
| `/pair-capability-execute-manual-tests` | Capability | Optional | 6     | Post-merge release validation (manual tests) |

† **Required _when installed_.** `/pair-capability-classify`, `/pair-capability-assess-security`, `/pair-capability-assess-cost` and `/pair-capability-assess-coupling` carry Required = Yes because `/pair-process-review` composes them by default — but all **degrade gracefully**: `/pair-process-review` **warns and continues** when the skill is absent (`/pair-capability-classify` → Step 1.5 Skip; `/pair-capability-assess-security` → Step 2.4; `/pair-capability-assess-cost` → Step 2.5; `/pair-capability-assess-coupling` → Step 2.6; each also under Graceful Degradation), the affected section reading **not assessed**, never HALTing on their absence. "Required" here means _composed by default_, not _a hard prerequisite_, so the flag never contradicts the graceful-skip steps.

## Arguments

| Argument     | Required | Description                                                                                                                                                                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pr`        | Yes      | PR number or URL to review                                                                                                                                                                                                                           |
| `$story`     | No       | Story ID for requirements validation. If omitted, extracted from PR description.                                                                                                                                                                     |
| `$dispatched` | No       | `true` when this run was **dispatched** (spawned by `/pair-capability-publish-pr`'s caller, an automation loop, a CI job) rather than invoked by a human in an interactive session. Default `false`. Sets the **non-interactive contract** below. Never merges (Phase 6 is unreachable). |

### The non-interactive (dispatched) contract

Two steps of this flow ask a human a question: Step 1.4 ("Proceed with review?") and Step 5.5 ("Merge now or let the author merge?"). In a **dispatched** run there is nobody to answer, so guessing is not an option in either direction — stalling wastes the run, and self-answering Step 5.5 would let the reviewing agent merge its own APPROVED verdict. With `$dispatched: true` (or whenever the run has no interactive human — e.g. the invocation prompt is a bare `/pair-process-review $pr=<n>` from another agent):

- **Step 1.4** — do **not** ask. Emit the same READY block as output and continue directly to Step 1.5.
- **Step 5.5** — do **not** ask, and never self-answer "Merge now". The outcome is always option 2 (**author/human merges**): produce the report and stop after Phase 5.
- **A dispatched run never reaches Phase 6**: it does not merge, does not cascade, does not delete a branch, even on APPROVED with `merge_allowed` true. The human merge gate is the point of the flow ([pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md): "a human still performs the merge; pair never auto-merges"). The dispatch instruction says so explicitly, and this contract holds even if it does not.

Everything else (phases 1–5, the verdict, the `pair-review` publication, the state synthesis) is identical to an interactive run.

## Session State

Maintain throughout the review:

```text
CODE REVIEW STATE:
├── PR: [#PR-NUMBER: Title]
├── Phase: [1-validation | 2-technical | 3-adoption | 4-completeness | 5-decision | 6-merge]
├── Story: [#ID: Title]
├── Review Type: [feature | bug | refactor | docs | config]
├── Issues: [critical: N | major: N | minor: N]
├── Debt Items: [N flagged]
└── Decision: [pending | APPROVED | CHANGES-REQUESTED]
```

## Phase 1: PR Validation (BLOCKING)

### Step 1.1: Load PR Context

1. **Check**: Is the PR already loaded in this session?
2. **Skip**: If yes, confirm PR number and move to Step 1.2.
3. **Act**: Read the PR from the **code host** — a PR/review operation, so it reads `code-host`, not `pm-tool` (resolution + routing table: see [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md); absent `code-host` ⇒ same tool as the PM tool):
   - PR metadata (author, branch, target, status)
   - Changed files and diff
   - PR description and linked story
4. **Verify**: PR loaded and open. If not → **HALT**.

### Step 1.2: Load Story Context

1. **Check**: Is the story already loaded?
2. **Skip**: If yes, move to Step 1.3.
3. **Act**: Extract the story ID from the PR description (the `Refs: <issue-id>` cross-link when the tools are split) or the `$story` argument. Read the story from the **PM tool** — an item read, so it reads `pm-tool`:
   - Acceptance criteria
   - Task breakdown and completion claims
   - Epic context
4. **Verify**: Story loaded with AC. If story not found, warn and proceed with PR-only review.

### Step 1.3: Classify Review Type

1. **Check**: Can the review type be determined from PR labels or story type?
2. **Act**: Classify as `feature`, `bug`, `refactor`, `docs`, or `config` based on:
   - PR labels and title prefix
   - Story type
   - Changed file patterns (e.g., only .md files → docs)
3. **Verify**: Review type set. Determines which validation steps apply.

### Step 1.4: Confirm with Reviewer

Present analysis:

```text
REVIEW READY:
├── PR: [#NUMBER: Title]
├── Author: [name]
├── Story: [#ID: Title | N/A]
├── Type: [feature | bug | refactor | docs | config]
├── Files Changed: [N files, +X/-Y lines]
└── AC: [N criteria to validate]
```

Ask: _"Proceed with review?"_ — **only in an interactive run**. A **dispatched** run (`$dispatched: true`, or no human in the loop) emits this block and continues to Step 1.5 without asking; it never stalls waiting for an answer that cannot come (see the non-interactive contract above).

### Step 1.5: Classification (risk matrix from the diff)

1. **Check**: Has `/pair-capability-classify` already run with `$context: review` on the current PR head commit?
2. **Skip**: If already run — reuse the matrix + tier, move to Phase 2. If `/pair-capability-classify` is not installed → warn (`/pair-capability-classify not installed — no review-time risk matrix`) and move to Phase 2.
3. **Act**: Compose `/pair-capability-classify` with `$context: review` against the PR diff. It applies the [quality model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) to the diff footprint, reads the story's refinement-time tier, and produces the review matrix as a **floor** — it confirms or **raises** the tier, and **never lowers** it (D17). The Security relevance and Coupling balance dimensions are reconciled in Phase 2 (Steps 2.4 and 2.6) as `/pair-capability-assess-security` / `/pair-capability-assess-coupling` verdicts land — raise-only.
4. **Verify**: The review matrix + `risk:*` tier are recorded on the **PR description** (matrix as 1 line + `<details>`, D22; tags applied only when a `## Tag Projection` is declared). This PR-description matrix is the **live, editable** copy — if Phase 2 raises Security relevance or Coupling balance, `/pair-process-review` updates it **in place** (Step 2.4), it is not re-emitted by `/pair-capability-classify`. (Phase 5 additionally embeds a point-in-time **snapshot** of this matrix in the Verdict block of the review report; that copy belongs to the **append-only** native review body and is **never** edited in place — a post-submission raise surfaces in the next fresh review, see Step 5.3 / idempotency #5. So "in place" applies only to the editable PR description, not the review body.) A raise to `risk:red` is carried into the Step 5.2 decision. `/pair-capability-classify` HALTs only if the quality model doc (#221) is absent.

## Phase 2: Technical Review

### Step 2.1: Quality Gates

**The gate is the first filter** (R5.4, [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md)): mechanical checks run before judgment, and a red gate **caps** the outcome of this review.

1. **Check**: Has `/pair-capability-verify-quality` already run on the current PR head commit?
2. **Skip**: If all gates passing on current commit — record results, move to Step 2.2.
3. **Act**: Compose `/pair-capability-verify-quality` with `$scope = all` and **`$pr` = the PR under review**. `$pr` names **which PR** the tier is resolved from — `/pair-capability-verify-quality` reads that PR's `risk:*` labels, the same source CI gates on (including the tag Step 1.5 just raised, **when the adoption declares the `## Tag Projection`** that makes `/pair-capability-classify` apply a label; with no projection the matrix lives in the PR description only and the label read fail-safes to 🔴, as designed) — so the gates run exactly the CI check set even though this review usually runs from a context that is **not** the PR's branch. Without it, resolution finds no current-branch PR and degrades to the fail-safe 🔴 full set. Forward the identifier, never the resolved tier: the labels stay the single source of truth, so no widen-only guard is needed on a second copy. The tier is exact, the **tree** is not — `/pair-capability-verify-quality` reports tier source and checked-out tree separately.
4. **Verify**: Record quality gate results, then resolve **which** gate signal is authoritative. The split keys on the `Tree:` row's **resolved value**, never on the ⚠️ glyph, and it is stated once:

   | Resolved `Tree:` value | The local `/pair-capability-verify-quality` run is | The authoritative gate signal is |
   | --- | --- | --- |
   | `match` — the checked-out tree IS the PR's head commit | **authoritative** | that local run: it may feed the Step 5.4 `resolve_pr_state <gates> …` synthesis and may cap the verdict |
   | `ahead`, `mismatch`, `unknown`, `none` | **advisory only** — a finding aid, never fed to the synthesis | CI's checks on the PR **head commit**, read per the rules below |

   - **Why the resolved value and not the glyph** — ⚠️ marks `mismatch` alone: `ahead` is the canonical pre-push state the implement→review→fix loop produces on every locally committed, not-yet-pushed fix (reported without a warning by design), and `unknown` renders no glyph either. A glyph-keyed rule would hand both of those local greens to the synthesis and let a PR reach `pr-state:ready-to-merge` on gates that ran over code the PR does not contain and CI has never seen.
   - **Name the read** — on every advisory arm, read the head commit's checks from the **code host**: `gh pr checks "$pr"` for GitHub, substituting the host's equivalent per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).
   - **Name the SET it reads** — the **mechanical gate checks only**: the branch protection's required contexts **excluding `pair-review` and `pair-explicit-approval`** (see [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md) § PR state flow). Treat any conclusion other than `success` on a check in that narrowed set as **not green**.
   - **Name the SET's own read** — `gh pr checks` reports which checks ran, not which ones branch protection **requires**, so the required set needs its own named, routed call: `gh api "repos/{owner}/{repo}/branches/<base-branch>/protection/required_status_checks" -q '.contexts[]'` on GitHub (the read side of the same configuration the guide above writes), substituted per the routing table. A `404`/`403` there **is** the trigger for the fallback below — unprotected, or not readable by this token — not an error to report.
   - **Where `<base-branch>` comes from** — the two placeholders in that call are not the same kind: `{owner}/{repo}` is `gh`'s own substitution (it fills them from the checked-out repository), while `<base-branch>` is **this flow's** and must be resolved before the call is made. It is the adopted `base-branch` — the branch this PR targets and the one whose protection therefore governs it — resolved by the single order in [way-of-working-pm-resolution.md](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) § **`base-branch` resolution** (`## Git Workflow` → `## Merge Strategy` legacy → the KB default), the same order `/pair-capability-publish-pr` used when it opened the PR. Read it there, never here: a value guessed at this step reads the protection of a branch the PR may not target, and the `404` that follows is indistinguishable from "no protection" — so an unguessable placeholder degrades **silently** into the fallback below, where an advisory non-required check then reads as a red gate.
   - **Why those two are excluded** — they are **this flow's own outputs**, already carried on their own axes by `resolve_pr_state <gates> <review> <tier> <explicit_approval>`: `pair-review` is registered _pending_ at t0 by `/pair-capability-publish-pr` and concluded only in Step 5.4 below, and `pair-explicit-approval` fails at 🔴 until a human approves. Folding either into `gates` double-counts it and — since the evaluator short-circuits on a non-`pass` gate — makes `pr-state:ready-to-merge` unreachable **by construction** on every advisory arm (the loop's normal state), capping this review's verdict on its own pending self-check.
   - **Fallback when the target branch is not protected** (no branch protection at all), or its required set cannot be read — the degraded configuration [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) documents as non-blocking: use **every non-`pair-*` check reported on the head commit**, and if **none** is reported there, `Gates: pending`.
   - **No published conclusion is not a green** — CI having published no conclusion on that head commit is the normal state in the first minutes after a push and the permanent state on a host that runs no checks: pass `gates` as **not green** (`Gates: pending`), so Step 5.4 yields `pr-state:to-be-reviewed` and **never** `ready-to-merge`. The remedy is re-reading the check once CI reports, never a promotion on absence of evidence.
   - **Which signal caps the verdict** — the same resolved value decides, with no second phrasing: the cap keys on the **authoritative** signal (the local run on `match`, CI's conclusion on the head commit on every other arm). With the authoritative gates red the review can **never** reach APPROVED and the Step 5.4 synthesis can **never** yield `ready-to-merge` — the judgment review does not override a mechanical failure; continue the review (the findings are still useful to the author) but carry `Gates: red` into Step 5.2. An advisory run contributes review **findings only** and never caps the verdict on its own, since the PR would otherwise be blocked on evidence this same step just declared advisory.
   - **A raise landing after this step** (Steps 2.4 / 2.6 reconcile Security relevance and Coupling balance, raise-only per D17) retro-narrows nothing: the set that ran is Phase 1's tier, and the remedy is a **re-run** of this step at the higher tier, never a report rewritten to a narrower one.

### Step 2.2: Code Quality Assessment

1. **Check**: Have code quality issues already been identified in this session?
2. **Skip**: If already assessed — move to Step 2.3.
3. **Act**: Review changed files against:
   - [Design Rules](../../../.pair/knowledge/guidelines/code-design/design-principles/design-rules.md) — do/don't patterns (DR-1, DR-2, ...). A diff **clearly** matching a rule's recognition criteria is a **violation** — cite the rule ID (e.g. "DR-1 — God Module") in the finding, not a generic "improve structure" comment. A **partial or ambiguous** match is a **suggestion**, not a violation — do not count it toward the review decision.
   - [Code design guidelines](../../../.pair/knowledge/guidelines/code-design/README.md) — readability, maintainability, naming
   - [Technical standards](../../../.pair/knowledge/guidelines/technical-standards/README.md) — patterns, conventions
   - Review type-specific concerns (e.g., behavior preservation for refactors, regression tests for bugs)
4. **Verify**: Issues catalogued by severity (critical / major / minor), with rule ID referenced where a Design Rule applies.

### Step 2.3: Architecture & ADR Compliance

1. **Check**: Does the PR introduce new technical decisions (libraries, patterns, technologies)?
2. **Skip**: If no new decisions detected — move to Step 2.4.
3. **Act**: For each new decision, verify:
   - ADR exists in `adoption/tech/adr/`
   - [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md) updated
   - Version consistency across workspaces
4. **Verify**: All decisions documented. **Missing ADR → HALT**:
   - Compose `/pair-capability-record-decision` with `$type = architectural` and `$topic` describing the gap.
   - Set review status to CHANGES-REQUESTED until ADR is created.
   - Resume review after ADR is added.

### Step 2.4: Security Assessment

1. **Check**: Has `/pair-capability-assess-security` already run with `$mode: review` on the current PR head commit?
2. **Skip**: If already run — reuse the verdict + findings, move to Step 2.5.
3. **Act**: Compose `/pair-capability-assess-security` with `$mode: review` against the PR diff. It resolves the rule set (KB global + per-service + per-web-app + adoption project rules) and returns a 1-line verdict + collapsed findings, each tagged **introduced** or **pre-existing**. The verdict feeds the five verdict-first Security sections of the review body — **input validation, output handling, authentication, authorization, introduced vulnerabilities** (Step 5.1, per the [code-review-template](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md)).
4. **Verify**: Verdict + findings recorded — feeds the Security sections (Step 5.1) and the **Security relevance** dimension of the Step 1.5 classification matrix (`/pair-capability-classify` folds this verdict in **raise-only** — it may raise the tier, never lower it). **PR-description re-render**: when the verdict raises Security relevance (or the Coupling verdict raises Coupling balance), `/pair-process-review` updates the already-written Step 1.5 **PR-description** matrix **in place** — re-rendering the affected `<details>` row and the 1-line `risk:*` tier so the PR **description** reflects the final, raised tier (the append-only review body is never edited in place — Step 5.3); `/pair-capability-classify` is **not** re-invoked (its Phase-1 run stands, and a raise-only edit needs no recompute). **Tag re-apply**: when a `## Tag Projection` is declared (e.g. `Active: risk`), this in-place Phase-2-originated raise **also re-applies the projected chromatic tag on the PR** — swapping the stale label for the raised tier (e.g. `risk:yellow` → `risk:red`) via the same §5 projection `/pair-capability-classify` uses in its Step 5, applied here by `/pair-process-review` on the raise-only edit — so the PR label matches the raised body tier; when no projection is declared, only the body matrix is updated and no label is touched. If any **introduced** finding is red → flag explicitly: this is the signal that drives the CHANGES-REQUESTED decision in Step 5.2. Does not itself HALT — `/pair-capability-assess-security` has no merge authority, this skill's own decision step does.
5. **Degrade**: `/pair-capability-assess-security` not installed → the five Security sections read **not assessed** (never dropped); a manual security read of the diff is still expected.

### Step 2.5: Cost Assessment

1. **Check**: Has `/pair-capability-assess-cost` already run against the current PR head commit?
2. **Skip**: If already run — reuse the class + signals, move to Step 2.6.
3. **Act**: Compose `/pair-capability-assess-cost` against the PR diff. It resolves the cost-signal catalog from the project's stack/architecture/infrastructure adoption and returns the `cost:green|yellow|orange|red` class as a 1-line verdict + collapsed signals table (D22). This is a genuine re-assessment of the diff — never a restatement of the story's refinement-time `cost:*` tag.
4. **Verify**: Class + signals recorded — feed the **Cost** section of the review body (Step 5.1, 1 line + `<details>`). The `cost:*` class is carried as its own dimension of the matrix (never folded into the risk `max`). A **red** cost class surfaces the **blocking human sign-off** requirement in the Verdict area (Step 5.1) and is carried into the Step 5.2 decision. Tag re-apply on the PR follows the same rule as Step 2.4 when `cost` is in the declared `## Tag Projection`. Does not itself HALT — `/pair-capability-assess-cost` has no merge authority.
5. **Degrade**: `/pair-capability-assess-cost` not installed → the Cost section reads **not assessed** (never dropped).

### Step 2.6: Architecture (Coupling) Assessment

1. **Check**: Is `/pair-capability-assess-coupling` installed?
2. **Skip**: If not installed → the **Architecture (Coupling)** section reads **not assessed** explicitly; move to Step 2.7.
3. **Act**: Compose `/pair-capability-assess-coupling` with `$scope: diff`. It returns a 1-line balance verdict on the integrations the diff touches (integration strength, socio-technical distance, volatility) + collapsed findings (D22).
4. **Verify**: Verdict + findings recorded — feed the **Architecture (Coupling)** section of the review body (Step 5.1) and the **Coupling balance** dimension of the Step 1.5 matrix (`/pair-capability-classify` folds it in **raise-only**, same in-place body re-render + tag re-apply rule as Step 2.4). Does not itself HALT.

### Step 2.7: Bug-Fix Red Test (bug fixes only)

A bug is reproduced by a failing test **before** it is fixed (`AGENTS.md` § Bug Resolution Workflow). That is already policy; this step is where it is **verified** rather than assumed — on bug fixes only. A feature PR carries no test-first obligation, and the exemption is part of the rule, not a gap in it.

1. **Check**: Is the Step 1.3 review type `bug` — or does the PR (or its story) reference a bug or a defect? An **ambiguous** classification defaults to **applying** the check, and the decision is recorded in the section.
2. **Skip**: If the PR is not a bug fix, the **Bug fix — Red test before fix** section reads **not applicable — not a bug fix** — written out, never dropped; move to Phase 3.
3. **Act**: Read the diff for the test that reproduces the bug and record the **evidence**, not a yes/no — an unevidenced tick is the rubber stamp this item exists to prevent:
   - **Which test** — `file::test name` — and what it asserts about the reported behavior.
   - **Failing-before / passing-after** — the test lands in this PR at or before the fix commit and exercises the fixed path (a test that would pass on the unfixed code is not a reproduction).
   - **Mixed PR** (bug fix + feature): apply the check to the bug-fix portion only; the feature portion is exempt.
   - **Genuinely untestable fix** (a doc typo, a pure-formatting change classified as a fix): record the one-line rationale why an automated test is not the proof — verdict **not applicable — rationale recorded**. The escape hatch is an explicit reviewer statement, never a silent pass.

   This is **reviewer judgment** aided by the prompt: no automated commit-order analysis runs here, and reproduction is never inferred from a commit message or a test-file name alone.
4. **Verify**: Verdict + evidence recorded — feed the **Bug fix — Red test before fix** section of the review body (Step 5.1, 1 line + `<details>`). A bug-fix PR with **no reproducing test** and no recorded rationale is a **Major** finding (the fix has not proven it addresses the bug), carried into the Step 5.2 decision under the same severity rules as any other Major. Does not itself HALT.

## Phase 3: Adoption Compliance

This phase uses a **4-level graceful degradation cascade** depending on which optional skills are installed:

| Level | /pair-capability-verify-adoption | /pair-capability-assess-stack | Behavior                                                   |
| ----- | ---------------- | ------------- | ---------------------------------------------------------- |
| 1     | Installed        | Installed     | Full adoption compliance + automatic tech-stack resolution |
| 2     | Installed        | Not installed | Full compliance detection, manual stack resolution         |
| 3     | Not installed    | Installed     | Inline tech-stack check only + automatic resolution        |
| 4     | Not installed    | Not installed | Warn developer for manual verification                     |

### Step 3.1: Determine Degradation Level

1. **Check**: Is `/pair-capability-verify-adoption` installed? Is `/pair-capability-assess-stack` installed?
2. **Act**: Set the degradation level (1–4) based on availability.
3. **Verify**: Level set. Proceed with the corresponding behavior.

### Step 3.2: Run Adoption Check

Run the procedure for the level determined in Step 3.1 — see [degradation-levels.md](./degradation-levels.md) for the exact steps of each of the 4 levels.

### Step 3.3: Verify Adoption Results

1. **Check**: Are there unresolved non-conformities?
2. **Skip**: If all resolved or Level 4 (warned) — move to Phase 4.
3. **Act**: Unresolved tech-stack items become review findings. Unresolved architectural gaps are HALT conditions.
4. **Verify**: All items resolved or catalogued as findings.

## Phase 4: Completeness Check

### Step 4.1: Definition of Done

1. **Check**: Has `/pair-capability-verify-done` already run in this session?
2. **Skip**: If already run on current commit — reuse results, move to Step 4.2.
3. **Act**: Compose `/pair-capability-verify-done` with `$scope = all` and `$story` (if available).
4. **Verify**: Record DoD results. Failing criteria become review findings. HALT conditions (missing ADR) propagate.

### Step 4.2: Tech Debt Assessment

1. **Check**: Has `/pair-capability-analyze-debt` already run in this session?
2. **Skip**: If already run — reuse results, move to Phase 5.
3. **Act**: Compose `/pair-capability-analyze-debt` with `$scope = all`. `/pair-capability-analyze-debt` is **output-only** — it returns a report and creates nothing.
4. **Act**: Report the debt items in the review output (Tech Debt section). Debt introduced by the PR is **surfaced, not blocked**: it does **not** HALT the review and **never** blocks the PR. Do **not** auto-create a tech-debt issue.
5. **Act**: If a debt item is worth scheduling, record it in the report as a recommendation and stop there — **the review never creates a work item** (ADL `2026-08-12-implementation-never-files-a-card-it-extends-the-story`). Cite an **already-existing** card by number when one covers it; otherwise the debt is fixed in this PR (extending the story that surfaced it), or left as an **actionable finding** the maintainer judges at the **merge gate**. Whether it ever becomes a new card is the maintainer's deliberate call, taken outside the review — never this skill's, and never a side effect of reading a diff.
6. **Verify**: Debt items recorded in the report. High-severity items may inform the review verdict as Minor/Major findings under the same severity-classification rules (see [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md#findings-by-severity)) but never force CHANGES-REQUESTED on debt grounds alone when they don't clear that bar.

## Phase 5: Review Decision

### Step 5.1: Compile Review Report

1. **Act**: Compile all findings into a **verdict-first** review body following the [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md)). The body is ordered so verdict, tier and cost class read in **~30 seconds** (D22, R6.6):
   - **Verdict** (top): classification tags (`risk:<tier>` · `cost:<class>`) + the decision + a 1-line reason + PR/author/story metadata. Include the **`Classification changed:`** drift note **only** when the review-time tier/cost differs from the story's refinement-time classification — it fires **upward only** (e.g. `risk:yellow` → `risk:red`, raise-only per quality-model §3.2 / D17); a review that would lower a dimension records the reduction as a finding in the collapsed details, never as a silent downgrade. A **red** cost class states the **blocking human sign-off** requirement here.
   - **Assessments** (each a 1-line verdict + `<details>`, "not assessed" when the capability is absent):
     - **Security — input validation, output handling, authentication, authorization, introduced vulnerabilities** (five verdicts from `/pair-capability-assess-security`, Step 2.4)
     - **Cost** — `cost:*` class + signals (from `/pair-capability-assess-cost`, Step 2.5)
     - **Architecture (Coupling)** — balance verdict (from `/pair-capability-assess-coupling`, Step 2.6; "not assessed" when the skill is absent)
     - **Bug fix — Red test before fix** — the reproducing-test verdict + evidence on a bug-fix PR (Step 2.7); **not applicable — not a bug fix** on a feature PR, written out rather than dropped
   - **Details** (collapsed): findings by severity + positive feedback (Phase 2); functionality / AC coverage; testing & quality gates (from /pair-capability-verify-quality); adoption compliance with degradation level (Phase 3); tech debt (from /pair-capability-analyze-debt); documentation (from /pair-capability-verify-done).

### Step 5.2: Make Review Decision

Based on compiled findings:

| Decision              | Condition                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **APPROVED**          | No open Critical, Major, or Minor issues. All AC met. Quality gates pass (a red gate caps the decision — Step 2.1). |
| **CHANGES-REQUESTED** | Critical issues found, missing ADRs, any **introduced** red security finding from `/pair-capability-assess-security`, failing tests, AC not met. A bug-fix PR with **no reproducing test** and no recorded rationale (Step 2.7) is a Major finding and blocks on the same bar as any other Major. A **red** `cost:*` class does not itself block — it surfaces a **blocking human sign-off** requirement in the Verdict (the human, not the skill, gates on cost). |

### Step 5.3: Resolve the Acting Identity, then Submit the Review

The compiled report **is the body of the native review on the code host** — the verdict is the review action; there is **no separate VERDICT comment** (decision Q5). That rule is about the verdict only: the **identity audit comment** of Step 5.4b is a distinct, required artifact and Q5 does not suppress it.

The review is submitted on the **code host only** (where it gates the merge). It is **never mirrored** onto the PM tool: the board reaches the outcome through the linked PR reference, so no review state is duplicated. See the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md).

**Before submitting, resolve WHICH CREDENTIAL acts.** The verdict is judgment (Step 5.2); this is the separate question of which principal writes it to the host, and it is decided by the shipped adapter, not here — see [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) § Dedicated review identity for the model, and the host guide for the per-host setup (R2.12).

1. **Act — resolve the identity mode**: read `Review identity` from [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) (`none` is the **default**; `app` / `bot-user` name a configured identity) as **two questions, not one** — is the key **present** (a format-agnostic look, because an adopter may have hand-written it without the bullet or the bold), and does its value **parse** (`review_identity_kind_ok <kind>`)? A key that is present but whose value does not parse is **configured-but-unusable ⇒ HALT** with the setup pointer; only a genuinely absent key is `none`. Never degrade an unparseable value to `none`: `none` means _no identity_, so the flow would resolve `session`, raise no HALT, and write — possibly approve — the review with the **session token** on a repository that provisioned an identity precisely to prevent that. Then source the shipped [`review-identity.sh`](../../../.pair/knowledge/assets/review-identity.sh) and compute `healthy` — never assume or improvise it: `review_identity_health <kind> <auth-ok> <perms-ok> <login>` answers `1`/`0` from the host guide's **per-run, artifact-free probes run on THIS review** (`auth-ok`: the credential authenticated and is scoped to this repository; `perms-ok`: the required grants were observed without writing — on GitHub the App's installation-token exchange requested with explicit `permissions`, or the bot account's repository-permission read — and, on **both** forms, that the identity is not this PR's author, a provisioning error the probe catches before any write rather than at the host's `422`). It folds in `review_identity_exclusion_ok <kind> <login>`, and any probe outcome that is not exactly `1` — including "not run" — is **not healthy**. **`<login>` has exactly one source: the value read back from the host on this run — on GitHub the repository variable `REVIEW_IDENTITY_LOGIN` (`gh api "repos/<owner>/<repo>/actions/variables/REVIEW_IDENTITY_LOGIN" --jq .value`), because that is the value `pair-explicit-approval` resolves as `${{ vars.REVIEW_IDENTITY_LOGIN }}`.** Never pass this session's ambient environment variable of the same name: a login exported in the shell but never `gh variable set` (or stored as a secret, or scoped to an Environment the gate job does not use) would pass health here while the gate's clause compares against the empty string — `.user.login != ""`, true for every account — so the bot's own approval would satisfy the 🔴 human gate. The probe must therefore also refuse a variable that names a **different** account than the one acting. The host guide's **artifact-leaving** probes (a check run that cannot be deleted, a scratch comment) are **setup-time only**: re-running them per review brands every reviewed head with a `pair-identity-probe` entry, and treating their setup result as this run's health means `halt` on every review of a correctly provisioned repository, since nothing persists it. What a read probe cannot prove at run time is covered by one rule: a `403`/`422` met **mid-write is a HALT**, reported against the artifact that failed — never a retry with the session token, and never a `pair-review` publication implying a review that did not land. **The rule is scoped to two of the three writes the identity performs** — the **review** and the **audit comment**. The **`pair-review` publication is the documented advisory-continue exception**: a refusal there is reported `pair-review: NOT PUBLISHED — advisory` and the flow continues (Step 5.4 step 3, and Graceful Degradation), because the verdict still lives in the native review and stopping would leave the PR with neither the label nor the report. The `pr-state:*` label is not an identity write at all, and its refusal stays the documented **non-blocking** case (Step 5.4 step 5, and the host guide's degradation table row _Label API_). So no single event is ever governed by both rules. Then call `resolve_identity_mode <configured> <healthy>`. That last one is not a formality: a `bot-user` identity is an ordinary machine account that types as `user.type == "User"` on the reviews API, so the 🔴 predicate's type clause does **not** exclude it — its login clause does, and only once the login is provisioned (`REVIEW_IDENTITY_LOGIN`, per the host guide). An identity that is not mechanically excluded from the 🔴 gate is **not healthy**, so it HALTs instead of running unguarded. Three outcomes, and no fourth:
   - **`session`** — nothing configured. Proceed exactly as before: the session token writes. This is the default and **not a degradation**; report it as `Identity: session`.
   - **`identity`** — configured and usable. The three **attributed** host writes in Steps 5.3–5.4 — the review, the `pair-review` publication, the audit comment — execute as the identity. **The `pr-state:*` label (Step 5.4 step 5) is not one of them**: it is a board **view**, not an artifact anyone is attributed for, so it is written by the **session token** exactly as before an identity existed. That is deliberate — it keeps the label out of the identity's grant surface (on GitHub the labels endpoint is the `issues` API, which the App baseline in the host guide does not request) and keeps the pre-existing rule that its absence or refusal is **non-blocking** (Step 5.4 step 5) intact.
   - **`halt`** — configured but unusable (invalid credential, missing permission, unknown health) ⇒ **HALT** with the adapter's setup pointer (the host guide's _Dedicated review identity_ section). **Never fall back to the session user**: a review recorded against a human who did not perform it is worse than a stopped review. No host write happens on this path.
2. **Act — synthesize the PR state, once, here**: `resolve_pr_state <gates> <verdict> <tier> <explicit-approval>` from [`pr-state.sh`](../../../.pair/knowledge/assets/pr-state.sh), with the inputs already in hand (`gates` from Step 2.1, the tier from the PR's `risk:*` label via `resolve_tier`, `explicit-approval` = a **non-author human** approval recorded on the current head). **Resolve that input with `human_approval_jq_filter` in a shell where `REVIEW_IDENTITY_LOGIN` is EXPORTED** — the login step 1 already read back into `$RV` from the host (`gh api "repos/<owner>/<repo>/actions/variables/REVIEW_IDENTITY_LOGIN" --jq .value`); read it there in `session` mode, where step 1 did not. **The filter's login clause is inert without it**: unset, `.user.login != env.REVIEW_IDENTITY_LOGIN` compares against the empty string and is true for every account, so a `bot-user` identity's own APPROVED review — cast outside this flow, the supervisor loop or a maintainer holding the bot PAT — counts as the non-author human approval and a `risk:red` PR reaches `ready-to-merge` with no human approval at all. Nothing else populates this variable agent-side: the CI `pair-explicit-approval` job resolves it from `${{ vars.REVIEW_IDENTITY_LOGIN }}` and is a different evaluation, in a different process, that only exists where `Review enforcement` is enabled and branch protection applied. This step is **unconditional**: it runs in **both modes that continue (`session` and `identity`) and for every verdict** — `halt` is not a third case here, because step 1 already ended the review on that path — because Step 5.4 applies exactly one `pr-state:*` label on every run and step 3 below needs the same value whenever there is an APPROVE authority to resolve. The point is that it is **not nested** inside the identity-only, APPROVED-only APPROVE-authority step. **Step 5.4 publishes this same value and does not re-synthesize it** — one call, one answer, so the event and the label can never disagree.
3. **Act — resolve whether an APPROVING review is authorized** (only in `identity` mode, and only when Step 5.2 decided APPROVED). A native `APPROVE` by the identity is what satisfies a host `required_approving_review_count >= 1` — i.e. it makes the PR mergeable with no human action — so it is granted by exactly **one** rule, the adoption-gated light row, and by nothing else:
   - **Evaluate the row**: read whether the project's `## Tag Projection` (`tech/risk-matrix.md`) declares the `light` family — a **read of adoption**, not a judgment — then `light_auto_approve_allowed <pr-labels> <light-declared> <tier> <state>`, `state` being step 2's synthesis. `<pr-labels>` is the PR's label **names**, read from the host **one name per line** — on GitHub `gh pr view <number> --json labels -q '.labels[].name'`. That shape (and the comma-separated one) delimits whole names, so the helper matches whole fields: a label whose NAME merely contains the word — `ui: light theme`, alongside hosts' own `good first issue` / `help wanted` — is not the `light` tag. The space-joined `-q '[.labels[].name] | join(" ")'` is **ambiguous** by construction — a multi-word label name is indistinguishable from the tag once joined — so the helper **fails closed** on it: a string carrying neither delimiter is matched as one whole field, which authorizes nothing unless that whole string is the tag. Passing the joined shape therefore never approves a multi-label PR; use the line form. Exit 0 ⇒ `approve-authorized = 1`; anything else ⇒ `0`, and keep the condition the helper named on stderr for the report. The four conditions and their containments are Step 5.4b's.
   - Not an approving verdict (CHANGES-REQUESTED or unresolved)? The row is **not consulted** — `approve-authorized = 0`, no stderr condition exists, and Step 5.4b reports `Light row: n-a — no approving verdict (row not consulted)`.
   - In `session` mode skip this entirely: `approve-authorized = 0`. The row governs the review an **identity** signs on the project's behalf; where no identity acts there is none to authorize, and step 4 decides the session account's own event on authorship instead.
4. **Act — map the verdict onto the host event**: `identity_verdict_event <mode> <verdict> <approve-authorized> <self-authored>` (never hand-rolled here). `<self-authored>` is read in **both** modes — compare the PR's author with the account that will act (GitHub: `gh pr view <number> --json author -q .author.login` against the acting login: `gh api user -q .login` in `session` mode, the identity's login in `identity` mode — for an App, compare against **both** shapes `gh` can return for one Bot actor, `app/<app-slug>` from the GraphQL read above and `<app-slug>[bot]` from the REST one (`gh api repos/{owner}/{repo}/pulls/{n} --jq .user.login`), since an App **can** author pull requests and a single-shape comparison is inert on the path that emits the other; the slug is the one the host guide's step 4 captures). Pass `0` only when they provably differ, `1` when they match, and leave it unset when a read failed. The adapter's **default differs by mode, deliberately**: unset ⇒ self-authored in `session` (the acting account routinely is the author), unset ⇒ **not** self-authored in `identity` (setup forbids a PR-authoring identity, and the other default would collapse every identity verdict to COMMENT):
   - **`identity` + CHANGES-REQUESTED** ⇒ `event = REQUEST_CHANGES`, ungated. A block never unlocks a merge, so nothing needs to authorize it. A correctly provisioned identity is **not** the PR author, so the host accepts the real event — this is what retires the `--comment` degradation for the blocking direction.
   - **`identity` where the identity IS the PR author** ⇒ `event = COMMENT`, whatever the verdict. The host rejects a self-authored review action (`422 Can not request changes on your own pull request`), so the native event cannot land — and the verdict must not be lost while Step 5.4 publishes `pair-review` regardless. Report it as a **finding** (the setup is wrong: the review identity must not open PRs in this repository — host guide) and continue with the COMMENT form.
   - **`identity` + APPROVED + `approve-authorized = 1`** ⇒ `event = APPROVE`. This **is** the light row's approving review; it is the only path in this flow to an APPROVE the identity signs on the project's behalf.
   - **`identity` + APPROVED + not authorized** ⇒ `event = COMMENT`, with the verdict token (APPROVED) leading the body. The judgment is published in full and the `pair-review` check still carries `success` (Step 5.4), so the PR reaches `ready-to-merge` exactly as before — what the identity does **not** do is sign the host's required approval on the project's behalf. The `Light row:` value of Step 5.4b is where the report says so.
   - **`session` + a NON-self-authored PR** ⇒ the native `APPROVE` / `REQUEST_CHANGES`. This is the shipped default path (nothing configured, second maintainer reviewing) and this story does not change it: the reviewer is not the author, so the host accepts the event — a change request is recorded as one and blocks the merge button, an approval counts toward `required_approving_review_count`. Submitting a COMMENT here would silently drop both.
   - **`session` + a SELF-authored PR (or unknown authorship)** ⇒ `event = COMMENT`. GitHub rejects a self-authored `APPROVE` / `REQUEST_CHANGES`, so this is the solo/self-review case and the fail-safe when the authorship read failed; the verdict token (APPROVED / CHANGES-REQUESTED) still leads the body, so the decision and full report are recorded, never lost. This form stays fully supported — the identity **upgrades** it, it does not replace it. See Graceful Degradation.
   - **Any unresolved verdict, in either mode** ⇒ `event = COMMENT` (fail-safe: never an approval).
5. **Act**: Submit the native review on the code host with that event (for GitHub, per [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md); another host's implementation guide supplies the equivalent commands), passing the compiled verdict-first report as the review **body**:
   - MCP-first: `pull_request_review_write` with `method = create`, the report as `body`, and the resolved `event`.
   - CLI fallback: `gh pr review <number> --approve|--request-changes|--comment --body-file <report>`.
6. **Act**: On re-review, submit a **fresh** native review — both documented paths append (MCP `create`; `gh pr review` CLI), neither edits a submitted body. GitHub's latest-review-governs semantics mean the newest review carries the verdict while earlier reviews stay as visible history, so re-invocation is safe without editing in place (idempotency).
7. **Verify**: The native review is submitted with the verdict-first body, the submitted **event** matches what `identity_verdict_event` returned (an `APPROVE` on a PR the light row did not authorize is a defect, not a shortcut), **and a read of the PR's reviews shows which account authored it** — the identity when one was resolved, the session account otherwise. Report the resolved mode on the `Identity:` output row; never claim per-identity attribution the read does not show. No separate VERDICT-comment artifact exists (the Step 5.4b audit comment is a distinct, required one, and in `identity` mode it always ships), so the `Review:` row reports the submission itself — landed, or `NOT SUBMITTED`. **If the read shows NO review by the resolved actor** — the host refused the submission (a `403`/`422` on the write, a rejected self-authored event) — the verdict did not land: report `Review: NOT SUBMITTED — <host error>` as a finding and **do not let Step 5.4 publish a resolved `pair-review`**; leave the pending check in place so the merge stays blocked. A `success` check on a PR carrying no review body is the one outcome this read-back exists to prevent. `halt` on a refused write, per the identity rule above.

### Step 5.4: Publish the `pair-review` Check & Synthesize the PR State

The verdict is judgment; the **merge block is mechanical**. This step turns the verdict into the required check and the PR state — see [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) for the model and [github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md) § PR state flow for the host commands. Nothing here re-derives criteria: the tier comes from the PR's `risk:*` label via `resolve_tier` and the per-tier requirements come from [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 (**no classification criteria in this flow — D18**).

1. **Check**: Does the current head commit already carry a `pair-review` check whose conclusion matches this verdict, and a matching `pr-state:*` label?
2. **Skip**: If yes — the check and the label are already correct, so skip **steps 3–5 only** and go to **Step 5.4b**, which still runs. The skip covers the two _publication_ acts and nothing else: Step 5.3 submits a **fresh** native review on every re-invocation (step 6), so on a re-review of an unchanged head that identity action is new and still needs its audit comment, and the `Light row:` report line is unconditional in every mode. Jumping from here to Step 5.5 would leave an identity `APPROVE` on the PR with no paired audit comment — the reason no longer reconstructable from the PR alone, which is the property Step 5.4b exists to guarantee.
3. **Act — publish the check**: source the shipped [`pr-state.sh`](../../../.pair/knowledge/assets/pr-state.sh) and map the verdict with `review_check_conclusion` (`approved` ⇒ `success`, `changes-requested` ⇒ `failure`, anything else ⇒ `pending`). Then resolve **how** to publish with `pair_review_publication_mode <mode> <identity-kind>` from [`review-identity.sh`](../../../.pair/knowledge/assets/review-identity.sh), using the mode Step 5.3 already resolved — never re-resolved here:
   - **`checks-api`** (an `app` identity, the only principal the Checks API accepts) ⇒ publish `pair-review` as a **check run** on the head commit.
   - **`commit-status`** (everything else — a bot user, an identity of unknown kind, `session`) ⇒ publish the **commit status** exactly as before. This stays the documented form for an ordinary agent token.
   **One producer per required context.** `/pair-capability-publish-pr` resolved this same form independently, at PR creation; if `Review identity` changed in between, the head carries a `pair-review` record in the **other** form (typically a `pending` commit status on a PR opened before an App was provisioned) that nothing here overwrites — two producers on one required context, and a merge that may stay blocked on the stale one. Read the head for a `pair-review` record in the form you are **not** publishing: if one exists, supersede it with the same conclusion (host guide, § Dedicated review identity — the enablement-transition rule) and, when the credential cannot, report it as a finding naming the stale record rather than leaving it unexplained. **The credential is the usual reason it cannot**: the Checks API is App-only, and on the App path the commit-status write needs `statuses` **in the token's own mint payload**, not merely granted on the App — an installation token carries only the permissions its exchange requested, so an unprepared identity meets `403 Resource not accessible by integration` here.
   Either way the conclusion is the same and the host guide carries the concrete commands. **Precondition (Step 5.3 step 7): the review must have landed.** If its read-back showed no review by the resolved actor, publish nothing resolved here — the pending check stays, the merge stays blocked, and the failure is reported. A `pending` result is never published as resolved — the required check stays unsatisfied so the merge stays blocked. If publication is **refused** (missing scope, no status API), report `pair-review: NOT PUBLISHED — advisory` and continue: the verdict still lives in the native review, but never claim a merge is blocked when it is not.
4. **Act — resolve the requirements for the tier**: read the tier from the PR labels (`resolve_tier`, tags only, **untagged/malformed ⇒ 🔴 fail-safe**), then read that tier's row from quality-model §4 through its `Argument > Adoption > KB default` cascade: reviewer count, SLA, **checklist depth** — `standard` vs `extended` as [quality-model](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 defines it (there is no separate extended-checklist artifact: `extended` is the same code-review template with **no section skipped**, "not applicable" written out rather than omitted) — and whether **explicit approval** is required. Record them in the review output; never invent or hardcode a threshold here. At 🔴, state the explicit-approval requirement in the Verdict block so the human reading the PR knows what is still missing (D10).
5. **Act — apply the state Step 5.3 already synthesized**: the `resolve_pr_state <gates> <verdict> <tier> <explicit-approval>` call happened once, in Step 5.3 step 2 (its own unconditional step, run in both modes that continue and for every verdict) — **do not re-synthesize it here**; this step publishes that value. (`explicit-approval` there = a **non-author human** approval recorded on the current head: the pair review itself never counts, and neither does the dedicated review identity — `human_approval_jq_filter` excludes an App by account type and a bot user by login — **the login clause only where `REVIEW_IDENTITY_LOGIN` was exported into the shell that evaluated the filter** (step 2); unexported, it excludes nobody. On a single-maintainer repo 🔴 therefore needs a second human account — see pr-states.md.) Apply the resulting `pr-state:to-be-reviewed` / `pr-state:ready-to-merge` / `pr-state:not-approved` label, removing any other `pr-state:*` label (exactly one at a time) — **with the session token in every mode**, since the label is a view and not an attributed artifact (Step 5.3 step 1). The labels are provisioned once per repository and if absent — or if the write is **refused** — this step is **non-blocking** (degradation below): report `pr-state label: not applied` and continue. This is the one host write in Steps 5.3–5.4 that a `403` does not HALT, and it is exempt precisely because the identity is not the one writing it. A red gate or a 🔴 tier without explicit approval yields `to-be-reviewed`, never `ready-to-merge`.
6. **Verify**: The head commit carries the `pair-review` check (or the publication failure is reported), the PR carries exactly one `pr-state:*` label matching the synthesis (or its absence is reported), and the tier requirements are recorded in the output. The label is a **view** — enforcement is the required checks (R5.7); this skill never edits branch protection and never bypasses a check.

### Step 5.4b: Audit the Identity Action (and record what the light row decided)

The light row itself was **evaluated in Step 5.3 step 3**, before the review was submitted — it is what authorized (or refused) the native `APPROVE`. Nothing is re-decided here: this step **records** the decision on the PR and reports it. In `session` mode no identity acted, so the **audit action** is skipped — post no audit comment (step 1 does not run) — and step 2 still runs, reporting `Light row: n-a — no identity (session mode)`. The report row is unconditional: every run emits it, in every mode. Model: [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) § Adoption-gated light auto-approval.

1. **Act — audit, on every identity action, in all three directions** (`identity` mode only — in `session` mode there is no actor to attribute, so this step 1 is skipped): post the comment `identity_audit_comment <action> <tag> <declared> <tier> <state>` renders — `action` = `approve` (the light row authorized the native APPROVE), `comment` (an approving verdict the row did **not** authorize, published as a COMMENT-form review), or `block` (REQUEST_CHANGES). The audit is not optional and not summarized from memory: it is the adapter's projection of the same inputs, so the reason is reconstructable from the PR alone — which tag, which declaration, which tier, which state.
2. **Act — report the row's outcome, in every mode**, with the Output Format block's own strings and no paraphrase: `Light row: approved — native APPROVE by the identity + audit comment posted | not-authorized — <unmet condition>, verdict submitted as COMMENT | n-a — no approving verdict (row not consulted) | n-a — no identity (session mode)`. **Four values, one per case, and the case picks the value** — never the nearest-looking string:
   - **`approved`** — `identity` mode, APPROVED, and step 3 authorized it: the submitted event was `APPROVE`.
   - **`not-authorized`** — `identity` mode, APPROVED, step 3 refused it: the event was `COMMENT`. The unmet condition filling `<unmet condition>` is the one `light_auto_approve_allowed` named on stderr, not a re-derivation.
   - **`n-a — no approving verdict (row not consulted)`** — `identity` mode with a verdict that is not APPROVED (CHANGES-REQUESTED, or any unresolved verdict). Step 5.3 step 3 is scoped to approving verdicts, so `light_auto_approve_allowed` never ran: there is no unmet condition to name and the event was `REQUEST_CHANGES` / `COMMENT` on its own rule, not the row's. This is the common case for a blocking review by a configured identity — reporting it as `not-authorized` would invent a stderr condition, and as `approved` or `n-a — no identity` would be false outright.
   - **`n-a — no identity (session mode)`** — `session` mode: no identity acted.
   This row is never omitted: the Output Format block below lists it unconditionally, so a report missing it is a defect regardless of mode.
3. **Verify**: In `session` mode, the `Light row:` line reads `n-a — no identity (session mode)` and **no** audit comment was posted. In `identity` mode the line is one of the other three and matches the event actually submitted — an `APPROVE` pairs with `approved`, a COMMENT-form approving verdict with `not-authorized`, and a `REQUEST_CHANGES` or unresolved verdict with `n-a — no approving verdict (row not consulted)`. In `identity` mode, a read of the PR shows every identity review paired with its audit comment, and **an `APPROVE` event only where the row authorized one**. The `pr-state:*` label from Step 5.4 is unchanged by this step (label mechanics are Step 5.4's, untouched).

**The two containments, stated where someone would try to shortcut them:**

- **Adoption is the gate, the label is not.** All four conditions live in `light_auto_approve_allowed` and the declaration is deliberately one of them, so a hand-applied `light` label on a project whose `## Tag Projection` declares no `light` family authorizes nothing. **No classification criteria** are read here or there — tags, the declaration, the gate result and the verdict, nothing else (D18).
- **It is the only authority for an APPROVE the identity signs.** Outside it an approving verdict by the identity is a COMMENT-form review, so on a repository with `required_approving_review_count >= 1` the identity never satisfies the host's approvals rule on the project's behalf. **At 🔴 the row never fires at all**, and even below 🔴 the identity's approval does not satisfy `pair-explicit-approval`: that predicate rejects an App by account type (`user.type == "User"`) and a bot user by login (`REVIEW_IDENTITY_LOGIN`), so the 🔴 gate stands whatever this row did.

### Step 5.5: Determine Next Action

1. **Check**: What was the review decision?
2. **Skip**: If CHANGES-REQUESTED → output review report and stop. Author addresses findings, then re-invokes `/pair-process-review`.
3. **Act — dispatched run**: if this run is **dispatched** (non-interactive — see the contract in Arguments), do **not** ask and do **not** self-answer: the outcome is option 2 below (the human merges). Output the report and stop. A self-answered "Merge now" here would let the reviewing agent merge on its own verdict, which is exactly what the human merge gate forbids.
4. **Act — interactive run**: If APPROVED → ask reviewer:

   > PR approved. Merge now or let the author merge?
   > 1. **Merge now** — proceed to Phase 6
   > 2. **Author merges** — stop here, author re-invokes `/pair-process-implement` Phase 4

   Either route enforces the **same** precondition before merging (`merge_allowed` on the re-synthesized state — Step 6.0 here, Step 4.1 there), so routing to the author never skips the 🔴 explicit-approval requirement.

5. **Verify**: If a human explicitly selected "Merge now" → proceed to Phase 6. Otherwise (including every dispatched run) → output and stop.

## Phase 6: Merge & Close (APPROVED only, optional)

Only reached when a **human reviewer** picked "Merge now" in Step 5.5 of an **interactive** run — a dispatched run stops at Phase 5 by contract (Arguments § non-interactive) — see [merge-and-cascade.md](./merge-and-cascade.md) for the merge-precondition (Step 6.0: `merge_allowed` on the synthesized PR state — HALT unless `ready-to-merge`), merge-strategy, merge-commit, merge, parent-cascade, branch-cleanup, and post-merge-manual-test steps (Steps 6.1–6.6) plus the completion output.

## Output Format

At review decision (Phase 5):

```text
REVIEW COMPLETE:
├── PR:         [#NUMBER: Title]
├── Story:      [#ID: Title | N/A]
├── Decision:   [APPROVED | CHANGES-REQUESTED]
├── Issues:     [critical: N | major: N | minor: N]
├── Security:   [green | yellow | red — N findings, N introduced | not assessed]
├── Cost:       [green | yellow | orange | red | not assessed]
├── Coupling:   [green | yellow | red | not assessed — skill absent]
├── Red test:   [green — <test> | red — no reproducing test | not applicable — not a bug fix | not applicable — rationale recorded]
├── Quality:    [PASS | FAIL — N gates]
├── DoD:        [N/N criteria met]
├── Adoption:   [Level N — summary]
├── Debt:       [N items flagged]
├── Review:     [Submitted as native review body (verdict = the review action; no separate VERDICT comment) | NOT SUBMITTED — <host error>, check left pending]
├── Identity:   [session (default — no identity configured) | identity: <app|bot-user> — native verdict, confirmed by read | HALTED — configured but unusable]
├── Check:      [pair-review → success | failure | pending (blocks merge) — published as commit status | check run (App identity) | NOT PUBLISHED — advisory, <host error>]
├── Light row:  [n-a — no identity (session mode) | n-a — no approving verdict (row not consulted) | not-authorized — <unmet condition>, verdict submitted as COMMENT | approved — native APPROVE by the identity + audit comment posted]
├── Tier req.:  [🟢/🟡/🔴 — N reviewer(s) / SLA / standard|extended checklist / explicit approval: required-and-present | required-and-MISSING | n-a]
└── PR state:   [pr-state:to-be-reviewed | pr-state:ready-to-merge | pr-state:not-approved]
```

At merge (Phase 6): see [merge-and-cascade.md](./merge-and-cascade.md).

## HALT Conditions

Review stops immediately when:

- **PR not found or not open** (Phase 1)
- **Missing ADR for new technical decision** (Phase 2, Step 2.3) — compose `/pair-capability-record-decision`, then resume
- **Unresolved architectural non-conformity** (Phase 3) — must be addressed before decision
- **A dedicated review identity is configured but unusable** (Step 5.3 — invalid credential, missing permission, unknown health as `review_identity_health` computes it from this run's probes, **a `403`/`422` met mid-write** after the probes passed on the review or the audit comment (a refused `pair-review` publication is the advisory-continue exception — Step 5.3 step 1, Graceful Degradation), **or a `Review identity` key that is present in adoption but whose value does not parse**, which `review_identity_kind_ok` rejects): `resolve_identity_mode` returns `halt`. Report the adapter's setup pointer (the host guide's _Dedicated review identity_ section) and stop **before any host write**. Never fall back to the session user — misattributing a review to the human whose token is loaded is the failure this HALT exists to prevent. No identity configured at all is **not** this case: that is `session` mode and it proceeds normally.
- **PR state is not `ready-to-merge`** (Phase 6) — `merge_allowed` fails: gates red, review not approved, or a 🔴 PR without explicit human approval. Report which condition is unmet and stop; never bypass a required check.

On HALT: report the blocker, compose the resolution skill if available, wait for developer.

## Idempotent Re-invocation

See [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invoking `/pair-process-review` on a partially reviewed PR is safe — per-phase:

1. **PR context**: detects already-loaded PR, skips re-loading.
2. **Phases**: checks which phases completed (via session state or PR review comments). Resumes from first incomplete phase.
3. **Skill compositions**: /pair-capability-verify-quality, /pair-capability-verify-done, /pair-capability-assess-security results cached in session. Not re-run if already passing/current on current commit.
4. **New commits**: if PR updated since last check, re-validates affected phases only.
5. **Review report**: re-review appends a fresh native review (MCP `create` / `gh pr review`); GitHub's latest-review-governs semantics make the newest one carry the verdict while prior reviews remain as history. The report is always the review body, never a separate comment — so no duplicate comment artifact is created.
6. **PR state & check** (Step 5.4): re-publishing is a no-op when the head commit already carries a `pair-review` check matching the verdict and the `pr-state:*` label already matches the synthesis. A **new head commit** (including a force-push) has no check of its own, so the review re-runs on it and the merge stays blocked meanwhile. A tier raised between runs re-synthesizes on the new tier — raise-only, so a re-run never loosens a requirement.
7. **Merge**: detects already-merged PR. Skips Phase 6 if already merged. Resumes parent cascade if merge succeeded but status updates are incomplete.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (optional skill not installed → degrade, never HALT; PM tool not accessible → ask the reviewer directly) for the standard scenarios. Additional cases:

- **/verify-adoption not installed**: Falls back to inline dependency checking against [tech-stack.md](../../../.pair/adoption/tech/tech-stack.md). Warning logged. See degradation cascade (Phase 3).
- **/assess-stack not installed**: Unlisted dependencies flagged as warnings for manual verification. Does NOT HALT.
- **/analyze-debt not available**: Skip debt assessment, note in report.
- **/assess-security not installed**: Skip Step 2.4. The five Security sections (input validation, output handling, authentication, authorization, introduced vulnerabilities) read **not assessed** — never dropped. Does NOT HALT; a manual security read of the diff is still expected per [how-to-11](../../../.pair/knowledge/how-to/11-how-to-code-review.md).
- **/assess-cost not installed**: Skip Step 2.5. The Cost section reads **not assessed**. Does NOT HALT.
- **/assess-coupling not installed**: Skip Step 2.6. The Architecture (Coupling) section reads **not assessed**. Does NOT HALT.
- **No dedicated review identity configured** (Step 5.3): `session` mode — the session token writes, `pair-review` is a commit status, and the verdict is the **native** `APPROVE` / `REQUEST_CHANGES` unless the acting account authored the PR (self-review ⇒ `--comment`, next bullet but one). The **zero-configuration default**, reported as `Identity: session`, never as a degradation. Does NOT HALT.
- **A `bot-user` identity** (Step 5.4): the Checks API is App-only, so `pair_review_publication_mode` keeps `pair-review` on the commit status — the native verdict upgrade still applies. Not a failure; report the publication form.
- **Adoption declares no `light` projection** (Step 5.3 step 3 — the default everywhere): the row authorizes nothing, so an approving verdict by the identity is submitted as a COMMENT-form review; report `Light row: not-authorized — adoption declares no light family, verdict submitted as COMMENT` (the Output Format block's own shape, with the condition filling `<unmet condition>`) and continue. A `light` label present without the declaration changes nothing. Does NOT HALT.
- **A `bot-user` identity with no `REVIEW_IDENTITY_LOGIN` provisioned** (Step 5.3 step 1): `review_identity_exclusion_ok` fails, so the identity is **not healthy** and `resolve_identity_mode` yields `halt`. This is a HALT, not a degradation: a machine account that types as `user.type == "User"` and is not excluded by login could sign the 🔴 human approval itself. Report the setup pointer (host guide § Dedicated review identity).
- **The review identity IS the PR author** (`identity` mode, Step 5.3 step 4): the host rejects a self-authored native event, so `identity_verdict_event` returns **COMMENT** — the verdict token leads the body and the full report is recorded as a review. The light row's `APPROVE` is unobtainable on that PR, so `Light row:` reports `not-authorized` only if the row itself refused; the rejected-event reason is reported separately as a **finding**: the setup is wrong (the identity must not be an account that opens PRs — host guide § Bot user). **Never publish `pair-review` without the review**: if the submission is refused outright, Step 5.3 step 7's read-back catches it and the check stays pending. Does NOT HALT — the judgment still lands and still blocks a bad merge.
- **Self-authored PR (self-review)** — `session` mode where the acting account **is** the PR author, and the fail-safe when that read fails: GitHub blocks `APPROVE` / `REQUEST_CHANGES` on your own PR, so the native verdict action is rejected for solo authors. `identity_verdict_event`'s `<self-authored>` argument is what selects it: `event = COMMENT` (`gh pr review <number> --comment --body-file <report>`), keeping the verdict token at the head of the body — the full verdict-first report is still recorded as a review, so nothing is lost (unlike a rejected APPROVE/REQUEST_CHANGES). A `session`-mode review of **someone else's** PR is not this case: the native event is submitted (Step 5.3 step 4). Does NOT HALT.
- **Story not found**: Review proceeds with PR-only validation (no AC check). Phase 6 skips parent cascade.
- **Code review template not found**: **HALT** — cannot produce review without template (a required dependency, not optional).
- **PM tool not accessible**: the PR-side work (review, merge) still runs on the code host; the PM-side writes (issue close, parent cascade) are reported as not done rather than guessed. In a single-tool project this is the same tool, so the merge falls back to CLI only.
- **Code host declared but unreachable/unauthenticated**: **HALT** with a setup pointer before any review is submitted — there is nothing to review against. PM-side reads already done are not rolled back.
- **Merge fails** (conflicts, branch protection): Report the failure, ask reviewer to resolve. Do not force-push or bypass protections.
- **Code host has no check-run/required-check API**: publish the `pr-state:*` label only, report `enforcement: advisory — host manual setup required` (see [pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) degraded mode), and do NOT claim the merge is blocked. Does NOT HALT.
- **`pair-review` publication refused** (Step 5.4 — token lacks the status scope, host rejects the write): report `pair-review: NOT PUBLISHED — advisory` with the host error; the verdict stays in the native review and the state is still synthesized. Enforcement is advisory until publication works — never asserted otherwise. Does NOT HALT.
- **`pr-state:*` label absent / no label API** (Step 5.4): report `pr-state label: not applied` — **non-blocking**, the required checks remain the authority. Does NOT HALT and does not block Phase 6's `merge_allowed` evaluation, which reads the synthesized state, not the label.
- **🔴 PR on a single-maintainer repository, with `Review enforcement: enabled`**: the non-author human approval is unobtainable (GitHub rejects a self-approval), so the state stays `to-be-reviewed` and Phase 6 HALTs. **With enforcement `disabled` — the default — nothing HALTs**: report the tier, the verdict and the synthesized state, say that the 🔴 approval requirement is advisory here, and stop there. A default that blocks is how a single-maintainer repository becomes unmergeable. Report it as a repository constraint — a second human account is required, or `pair-explicit-approval` must deliberately not be a required context there (pr-states.md edge cases). Never self-approve to unblock.
- **/execute-manual-tests not installed**: Skip Step 6.6. Log "Manual test validation skipped — skill not installed." Does NOT block merge.
- **No manual test suite**: Skip Step 6.6. Log "No manual test suite found." Does NOT block merge.

## Notes

- This skill **reads code, submits the native review (verdict = the review action), publishes the required `pair-review` check + the `pr-state:*` label, and optionally merges PRs** — it does not modify source code and posts no separate review comment.
- **Gate ≠ review** ([pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md)): the mechanical gate is the first filter (Step 2.1) and the judgment verdict never overrides it; the merge block itself is the required check, not this skill's opinion. The `pr-state:*` label is a view — enforcement lives in branch protection (R5.7), which this skill never edits or bypasses.
- **Who decides and who acts are different questions.** The verdict is this skill's judgment; the credential that writes it to the host is resolved by the shipped [`review-identity.sh`](../../../.pair/knowledge/assets/review-identity.sh) (Step 5.3) — `session` by default, `identity` when a project provisions one, `halt` when one is configured but broken. Adopting an identity **never** relaxes the 🔴 rule, and the exclusion is mechanical in two forms: `human_approval_jq_filter` rejects an **App** identity by account type (`user.type == "User"`) and a **bot-user** identity — which does type as `"User"` — by its login (`REVIEW_IDENTITY_LOGIN`, whose absence makes the identity not healthy). A `risk:red` PR still needs a second human account (ADR-018, amendment 2026-08-28).
- **The light row is the only auto-approval path, and it is off unless declared** (Step 5.3 step 3): `light_auto_approve_allowed` reads a tag, an adoption declaration, the tier and the synthesis — **zero classification criteria** (D18) — and `resolve_pr_state`'s table is untouched by it. It is load-bearing because it is the **third argument of `identity_verdict_event`**: outside it an approving verdict is a COMMENT-form review, so the identity never satisfies a host `required_approving_review_count >= 1` on the project's behalf.
- **Per-tier requirements are read, never invented** — reviewer count, SLA, checklist depth, and the 🔴 explicit-approval requirement come from [quality-model.md](../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md) §4 through its `Argument > Adoption > KB default` cascade (D10). The tier comes from the PR's `risk:*` label (`resolve_tier`, tags only, untagged ⇒ 🔴 fail-safe): **this flow contains no classification criteria** (D18).
- Review phases are sequential — each phase builds on findings from prior phases.
- The reviewer can stop between phases; re-invoke to resume (see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md)).
- Output follows [code-review-template.md](../../../.pair/knowledge/guidelines/collaboration/templates/code-review-template.md) — the template defines structure, /pair-process-review fills it with findings.
- HALT on missing ADR is inherited from [how-to-11](../../../.pair/knowledge/how-to/11-how-to-code-review.md) — this is a business rule, not a skill limitation.
- **Parent cascade is best-effort** — if sub-issue queries fail, the skill reports which updates need manual attention.
