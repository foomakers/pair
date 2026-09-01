---
name: publish-pr
description: "Publishes a completed story branch as a pull request: realigns the generated mirrors from the local dataset (committing them separately when they drifted), runs the quality gate, creates or updates ONE PR from the pr-template (conditional sections filled only when pertinent), copies the story's classification tags, marks it ready-for-review, updates the board state, then enters the PR state flow — registers the required `pair-review` check as pending (merge blocked from t0) and dispatches the review to a clean-context subagent. Standalone — driven by a handoff/checkpoint, not by /implement having run in the same session. Composed by /implement's closing phase (Step 3.3); reused by hotfix and automation loops. Composes /verify-quality, /checkpoint, /write-issue."
version: 0.8.0
author: Foomakers
---

# /publish-pr — Publish a Story Branch as a PR

Take a completed story branch to a review-ready pull request in one standalone step: **realign mirrors → gate → compose PR → propagate tags → ready-for-review → board state → review dispatch**. Reliable on a clean context (input is a handoff document, not session memory) and reusable outside `/implement` — hotfix branches and automation loops (#212, G10) invoke it directly.

**One PR per story:** the story lands on ONE branch with ONE PR. If a PR already exists for the branch, this skill UPDATES it — it never opens a second PR for the same story.

**Never merges.** This skill stops at a PR under review. Merge is a separate, human-gated step (`/review` / `/implement` Phase 4).

**The review is never optional.** Every PR this skill publishes enters the [PR state flow](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) as `to-be-reviewed` with the **required** `pair-review` check registered as pending (so the merge is blocked from t0), and the review itself is dispatched to a clean-context subagent (Phase 5). This skill never renders the verdict — it only guarantees a review is pending and mechanically enforced.

## Composed Skills

| Skill             | Type       | Required                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `/verify-quality` | Capability | Yes — the pre-flight gate (Phase 1). A red gate HALTs before any PR is created or updated.   |
| `/checkpoint`     | Capability | Optional — `$mode=resume` to read the handoff when one exists; if not installed, gather state from branch + story. |
| `/write-issue`    | Capability | Optional — two distinct compositions in Phase 4: `$mode: comment` for the PR-URL back-link (step 5) only — the board state (step 7) is written directly, never by composing write mode. If not installed, warn and continue (back-link written directly per the PM tool's implementation guide **and read back to confirm it**; the board write is unaffected — it never composed this skill). |

## Arguments

| Argument     | Required | Description                                                                                                       |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `$story`     | No       | Story ID. If omitted, resolved from the handoff, then from the branch name (`<branch-format>` → `#<id>`). Unresolvable ⇒ **HALT** (AC edge case). |
| `$handoff`   | No       | Path to a handoff/checkpoint document. Default: `.pair/working/checkpoints/<story-id>.md`. Missing ⇒ gather minimal state from branch + story, then proceed (business rule). |
| `$scope`     | No       | Forwarded to `/verify-quality` as its `$scope` (default `all`).                                                  |
| `$assignee`  | No       | Who the **pull request** is assigned to. Resolved by **the same cascade** `/write-issue` Step 6b applies to an item — argument, then the adoption default, then none with a warning. Because a PR is a **code-host** write, the adoption default is `code-host-assignee` when the project declares one, else `default-assignee`. Unresolvable ⇒ the PR is still published, unassigned (**never a HALT**). |

## Adoption Inputs (read deterministically)

Two sibling sections cover git concerns and the split is deliberate: **`## Merge Strategy` owns how a PR ends** (merge method, commit format, branch cleanup, merge confirmation — read by the merge consumers too), **`## Git Workflow` owns where the code lives and where it starts** (`code-host`, `base-branch`). This skill is the one reader of both, because it spans start (base branch) and intended end (merge method).

- **[way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → `## Merge Strategy`** — the same section the merge consumers read (`/review` Phase 6): `Method` (`squash` | `merge` | `rebase`, **default `squash`**) and the `Commit format` ([commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md)). Recorded on the PR as the intended merge strategy; **squash happens at merge, never here**. `branch-format` (to parse the branch id) comes from the [branch template](../../../.pair/knowledge/guidelines/collaboration/templates/branch-template.md).
- **way-of-working.md → `## Git Workflow`** — `code-host` (the tool owning branches/PRs) and `base-branch` (default `main`; **a `base-branch` declared under `## Merge Strategy`, where this skill's ≤ 0.4.1 versions documented it, is still honored** — the resolution order is single-sourced in the convention's **`base-branch` resolution** — the same order `/implement` applies, so the two readers cannot disagree on the target branch). **`code-host` absent ⇒ code host = PM tool** (single-tool; the zero-configuration default, not a degradation), and the same tool named in both places is treated exactly as omitted. Resolution, the PM↔code-host routing table, and the cross-linking convention live in one place: [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) — this skill states only which side each operation is on.
- **way-of-working.md → `## Quality Gates` → `mirror-realign-command`** — the project's single writer for its generated mirrors, run in Phase 1 before the gate. Declared as a command the project owns (e.g. a root script), because which artifacts a repo generates, and from what, is the repo's business and not this skill's — a hardcoded command would emit a step most projects cannot run. **Absent ⇒ the realignment step is skipped entirely** (zero-configuration default, not a degradation). The command must be a *writer*, local and idempotent: the guards that detect drift are the checkers, this is the one thing that fixes it.
- **way-of-working.md → `## State Mapping`** — board-column ↔ canonical-macrostate mapping (see [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)). Omitted ⇒ canonical names assumed.
- **way-of-working.md → `## Assignment`** — the fallback when no `$assignee` is passed. This skill writes the **code-host** side, so it reads **`code-host-assignee` first and `default-assignee` second** — the split-configuration key exists because the same human often carries two identifiers, and resolving the PM-tool login against the code host is how a PR ends up rejected and published unassigned. **One rule, two callers**: the schema and the cascade live once, in the [resolution convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md), and both this skill (the PR, a **code-host** write) and `/write-issue` (the item, a **PM-tool** write) read them from there rather than each defining their own. Both omitted ⇒ no default; the PR is published unassigned with a warning.

## Algorithm

Each phase follows the **check → skip → act → verify** pattern. Phases run in order; a HALT stops the skill without side effects.

### Phase 0: Resolve Story & Handoff (BLOCKING)

1. **Check**: Is `$story` provided or already loaded in this session?
2. **Act**: If not, resolve in order:
   - From `$handoff` (or the default checkpoint path) via `/checkpoint $mode=resume` when installed — this yields story, branch, tasks done, decisions with zero prior context.
   - Else from the current branch name, parsing `#<id>` per the `branch-format`.
3. **Verify**: Story ID resolved AND the branch is known. If the story id cannot be resolved from handoff or branch → **HALT**: "Cannot resolve story id — pass `$story` explicitly." (edge case).
4. **Act**: If no handoff document exists, gather minimal state directly: branch (`git branch --show-current`), commits since base, and the story's ACs/tags from the PM tool. Note in the output that no handoff was found.

### Phase 1: Realign Generated Mirrors, then Quality Gate (BLOCKING)

The realignment runs **before** the gate, and the order is load-bearing in both directions: mirror drift is precisely what turns the gate red, so a step placed after it would be unreachable in the only case it exists for — and a gate that ran first would have judged a tree the PR no longer contains. It is also the **only** write this skill makes to the branch.

1. **Check**: Does the adoption declare a `mirror-realign-command`?
2. **Skip**: If it does not, go to step 5. A project with no generated mirrors has nothing to realign — the zero-configuration default, not a degradation, and nothing is reported.
3. **Act**: Run the declared command. It regenerates the mirrors from the working tree's **local** dataset — never a published release — and is idempotent. A **non-zero exit → HALT** before any PR side effect, reporting the command's own reason verbatim: it never reports success over a no-op, so a failure here means nothing was written and the drift is still there.
4. **Check → Act**: Read `git status --porcelain` for the generated paths the command owns.
   - **No change** → a no-op stays **silent**: no commit, and no output row (the `Mirrors:` row is emitted only when a commit was made). Continue to step 5.
   - **Changed** → stage **only** those paths — never `git add -A`: unstaged authored changes belong to the contributor and must survive the run untouched, and this skill must not commit them — and commit them **alone**, as their own commit, never mixed into a feature commit. Name it as a *regeneration* (e.g. `chore: regenerate mirrors from local dataset`), never a "fix": an overwritten hand-edit was restored to what the dataset generates, not repaired. Drift in a file this branch never touched is committed here too, and **said so in the output** — surprising, but better than pushing knowingly stale generated output, and the separate commit keeps even a dataset-wide regeneration readable next to the authored work.
   - **Verify**: `git log` shows exactly one new commit, and `git status` still shows every pre-existing unstaged authored change, untouched.
5. **Act**: Compose `/verify-quality` with `$scope` (default `all`). This is a local pre-flight, not a replacement for CI (CI stays authoritative, #210).
6. **Check**: Did every required gate pass?
7. **Skip**: If all gates pass, proceed to Phase 2.
8. **Act**: If any required gate fails → **HALT** before creating or updating the PR. Report each failing check (gate name + first failing detail). No PR side effects occur on a red gate.

### Phase 2: Resolve Merge Strategy & Prepare Base

1. **Act**: Read **both** git-concerned sections (Adoption Inputs) — `## Merge Strategy` (how the PR ends) and `## Git Workflow` (where the code lives and where the branch starts). Resolve, with defaults for anything omitted:
   - `Method` (default `squash`) — the intended merge method (`squash` | `merge` | `rebase`), recorded on the PR/output. **Applied at merge, not here** — this skill never rewrites branch history.
   - `Commit format` — the commit-message convention (informational; commits already exist on the branch).
   - `base-branch` — the PR target branch, resolved by the convention's **`base-branch` resolution** order (`## Git Workflow` → legacy `## Merge Strategy` → default `main`), which lives there rather than here because `/implement` reads the same key: an adoption that declared e.g. `base-branch: develop` under `## Merge Strategy` (where this skill's ≤ 0.4.1 versions documented it) keeps targeting `develop`, and both skills agree on it.
   - `branch-format` (default `feature/#<id>-<slug>`, per the branch template) — used only to parse/validate the branch, never to rename it.
2. **Act**: Ensure the branch is pushed to the code host (`git push -u <remote> <branch>`); if already up to date, skip.
3. **Verify**: The resolved base branch exists on the remote and the feature branch is pushed. Example: `Method: squash` (the default) ⇒ the output marks squash-on-merge.

### Phase 3: Compose the PR Body

1. **Act**: Read the [pr-template](../../../.pair/knowledge/guidelines/collaboration/templates/pr-template.md) (resolve override-first — [template resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/template-resolution.md); the same resolution applies to the commit and branch templates referenced above). Fill the always-applicable sections from the handoff/story:
   - **Title**: `[#<story-id>] <type>: <brief description>` (`<type>` from commit-format / story type).
   - **Summary** (What Changed + Why) from the story statement and the handoff's decisions.
   - **Story Context**: link the story issue and list AC coverage.
   - **Changes Made**: tasks completed + files added/modified/deleted (from `git diff --name-only <base-branch>...HEAD`).
   - **Testing**: quality-gate results from Phase 1.
2. **Act — conditional sections (fill ONLY when pertinent; never leave an empty section):**
   - **`Refs:` (PR Information)**: the template's cross-link slot. Fill it with the PM tool's item id verbatim ONLY when `code-host` differs from `pm-tool` (Phase 4 step 4); omit the line entirely on a single-tool project. Filling the slot rather than appending free text is what makes `/review`'s and `/next`'s read-back deterministic.
   - **Services to Release**: from `git diff --name-only <base-branch>...HEAD`, group changed files by owning package/service and keep only **deployable** ones. Detect deployable via the adoption's deployable-package globs when declared, else a path heuristic (e.g. `apps/*`, deployable `packages/*`) — exclude content/docs-only packages (e.g. `packages/knowledge-hub`, `apps/website` content). Include the section only if one or more deployable packages/services are touched; list each once. Omit when nothing deployable changed.
   - **Screenshots** (before/after): include ONLY when the diff touches UI. Detect UI via the adoption's UI package globs when declared, else a path heuristic (e.g. `apps/*/`, `*.tsx|*.css|*.svelte`, `**/components/**`). When touched but no screenshot is available, include the section with a `TODO: attach before/after` marker rather than fabricating content.
3. **Act**: Omit every template section that does not apply (no placeholder-only sections).
4. **Verify**: The body follows the template, has no empty/placeholder sections, and every included conditional section is genuinely pertinent.

### Phase 4: Create/Update PR, Propagate Tags, Ready-for-Review, Board State

**No write is assumed here either** — the rule `/write-issue` states for items holds for a PR: **every write is re-read back**, and this skill reports what the read returned, never what the call reported. A PR is created, assigned and labelled in one command whose success says nothing about which of the three actually landed.

1. **Check**: Does a PR already exist for this branch on the code host?
2. **Act — create or update (one PR per story), assignee included:**
   - **No PR** → create it targeting `base-branch` on the code host.
   - **PR exists** → update its body and tags in place, and its assignee **conditionally** (two bullets down) (edge case) — never open a second PR.
   - **The assignee is resolved by the same cascade the item write uses** — `$assignee`, else the adoption default (`## Assignment`), else none. **One rule, two callers**: `/write-issue` Step 6b owns the cascade and this skill applies it unchanged — resolution *and* the conditional update rule below — so the two cannot diverge (a cascade applied on one side only is the half-applied state this contract exists to remove). Set it **on the create/update call itself, never as a follow-up step**, with the code host's own mechanic (the implementation guide carries the flag — never invent one).
   - **On an existing PR the write is conditional**, exactly as the item update is (`/write-issue` Step 7.3): apply the resolved assignee when the caller passed `$assignee` **explicitly**, or when the read shows the PR has **no** assignee. Otherwise **leave the existing assignee untouched**, and **never clear one** — resolved to none included. The case this protects: a maintainer reassigns a published PR to the colleague who owns its review, the author pushes fixes and re-runs the documented fix→re-publish loop, and an unconditional write silently pulls the PR back to `default-assignee` and out of that colleague's assignee-filtered view — the same invisibility, inverted, on the side that was supposed to be symmetric. Whether the host's call **adds** to or **replaces** the assignee set is the host's concern, documented in its implementation guide.
   - **This is the code-host branch of that cascade**: the adoption default here is **`code-host-assignee` when declared, else `default-assignee`** (the [resolution convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) owns both keys). On a single-tool project nothing extra is declared and the two are the same value; on a **split** project they are usually different logins for the same human, and resolving the PM-tool one against the code host gets it rejected — the PR is then published unassigned with a warning, i.e. exactly the invisibility this contract removes.
   - **A pull request's author is not its assignee.** The host fills `author` from the token and leaves `assignees` empty, and an assignee-filtered view reads `assignees` — which is why PRs published before this contract were open, green and invisible on the board.
   - **Nothing resolvable, or a login the host rejects** ⇒ publish the PR **unassigned** and warn that it is **invisible in an assignee-filtered view** — **never a HALT**: the PR is the work, and a bookkeeping field must not sink it.
3. **Act — tag propagation (copy, not analysis):** copy the story's estimated **classification tags** to the PR verbatim, **`risk:*` included**. This is a copy — the authoritative re-classification happens in review (G6). The `risk:*` labels are not cosmetic: the gate matrix and the tier requirements resolve from the PR's tier, and an untagged PR resolves **fail-safe** red, so dropping them silently costs a wrong tier on top of a filtered-out board row. If the story carries **no classification tags**, create the PR without tags and note it in the output (projection may be inactive, D17) (edge case). Then **re-read the pull request** just written — body, assignee, labels, base — and report **what the read returned** (the draft→ready transition is written three steps later and is read back **there**, in step 6, since a read taken here could only ever show the pre-transition state): a label the host silently dropped (never provisioned in the repository) or an assignee it refused is a **finding**, never an assumed success because the command exited 0.
4. **Act — code-host routing:** the PR is created/updated on the **code host**, the board state (step 7) is written on the **PM tool** — per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). When `code-host` is absent (or names the PM tool) both resolve to the same tool and the split is invisible. When they differ, fill the pr-template's conditional `Refs: <issue-id>` slot (Phase 3 step 2) — the PM tool's own item id, copied verbatim.
5. **Check — does a back-link apply at all?** Resolve `code host` vs `pm-tool` **before touching the PM item**: the same tool (or an alias of it — identifier equality) ⇒ **skip this entire step here and now**, report `n-a (single tool)`, and go to step 6. The host already links PR and item natively, so there is nothing to post *and nothing to look for*. Gating at the head of the step rather than inside its Act is deliberate: on the default single-tool configuration this step performs **no PM-item read at all**, so publishing stays byte-identical to the pre-`code-host` behavior.
   **Check (split active) — back-link already present?** Read the PM item's existing comments (link field where the tool has one instead) and look for one containing this PR's URL.
   **Skip**: found → the back-link is already there; report it as `already linked` and do **not** post again. This is what keeps the step idempotent: a comment has no id, so `/write-issue` comment mode cannot dedupe it (see its Step 7c) — the check belongs here, or the normal fix→re-publish loop and any code-host HALT recovery would accrete one `PR: <url>` comment per round. If the item's comments cannot be read, treat it as *not found* and post (a duplicate comment is a lesser failure than a missing back-link) — say so in the report.
   **Act — post the back-link (bidirectional cross-link):** post the PR **URL back on the PM item** as a *comment* — never a body write. This closes the loop the `Refs:` line opens, so the board reaches the PR without any native integration. On `filesystem` the item **is** a file and its "comments" are dated bullets under `## Activity Log`, so both the check above and this write mean that one section of the item file ([filesystem-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/filesystem-implementation.md#comments-on-an-item-activity-log)). Two mechanisms, in order:
   - **`/write-issue` installed** → compose it in **comment mode**, which is non-destructive by contract (no template, no body render, no board write) and **confirms the post by reading the item's comments back** (its Step 7c Verify), degrading to `Comment warned — manual link needed` when that read does not show it:

     ```text
     /write-issue $mode: comment $id: <issue-id> $comment: "PR: <pr-url>"
     ```

   - **not installed** → write the comment directly through the PM tool's implementation guide (e.g. Linear `commentCreate`, `gh issue comment`, the Azure DevOps work-item comments endpoint, the Jira comment API). **Then confirm it exactly as the composed path does**: **read the item's comments back** (the `## Activity Log` section on `filesystem`) and look for the URL just posted. A read that does not show it is reported as `back-link failed — manual link needed`, **never as posted** — the direct post is a write like any other, so its exit status is not evidence. This branch is the one that most needs the read: it runs on a **split**-tool project (the only configuration where a back-link exists at all), where this comment is the sole link from the board to the PR, and a comment API that exits 0 having created nothing would otherwise render `Cross-link: Refs: <id> + PR URL posted on <item>` over a board that reaches nothing.

   Never compose `/write-issue` in write mode for the back-link: write mode is a **full-body overwrite** and would replace the story's AC/DoD/task breakdown with the link. If the **item id is not found**, or the PM tool errors, keep the PR (it is valid work) and warn with the manual-link instruction (edge case) — comment mode warns rather than HALTing for exactly this reason, so the documented non-blocking behavior holds through the composition.
6. **Act — ready-for-review:** mark the PR ready for review (not draft) on the code host; if the host supports an explicit ready command (e.g. `gh pr ready`), use it. **Then read the PR back and confirm it is no longer a draft** — this is a write like any other, so its exit status is not evidence, and a PR left in draft is unmergeable however green it looks. A negative read is a **finding** on the `PR:` row (`ready-for-review not confirmed`), never an assumed success.
7. **Act — board state:** update the story's board state on the **PM tool** **directly**, in the order the item writer states once and this step applies unchanged — **membership, then a read that confirms it, then the state field** (`/write-issue` Step 7b). Composing `/write-issue` is not the route for a state-only change — its write mode is a **full-body overwrite** and would replace the story's AC/DoD/task breakdown — so the invariant is applied here **by reference**, never re-derived. **Resolve `## State Mapping` first** — the canonical target is `Review`:
   - **A board state maps to `Review`** ⇒ write that state onto the item's board field.
   - **None does** (a minimal board, D4 — a board that reviews on the PR and merges straight to `Done`) ⇒ **write no state field** — establish and confirm the membership, stop before the state beats — and report `Board: n-a — no Review state on this board`. This mirrors the item writer's own documented skip (its Step 6): a macrostate that has been *requested* and cannot be mapped can only HALT (route (c)), so **resolving no target at all** is what makes the minimal-board path work — here that means writing no state field rather than writing a wrong one.

   The **membership precedes state** order is applied here by reference (`/write-issue` Step 7b: membership → a read that confirms it → the state field), so an item the tracked view does not hold is put there and *confirmed* before the state is written. **Any HALT this raises — an unconfirmable membership or an unmappable requested macrostate — is reported verbatim on the `Board:` row** as `not updated — <reason>` and never absorbed into a green publish; the PR stays ready-for-review either way. If the PM tool is inaccessible, warn and continue — the PR is already ready. PR state itself is never mirrored onto the board.
8. **Verify**: A single ready-for-review PR exists on the code host — **confirmed by the step-6 read**, not by the ready command's exit status — and **a read of it** shows the assignee this run wrote, the assignee it deliberately left untouched, or the unassigned warning, plus the story's tags, the cross-link exists in both directions when the tools differ — **exactly one** back-link comment, whether this run posted it or found it (or the missing back-link is reported) — and the board state is confirmed updated, or documented as skipped (no `Review` state on this board), or the failure is reported.

### Phase 5: Enter the PR State Flow & Dispatch the Review

The PR is ready; it must now be **under review and mechanically blocked** — see the [PR state flow](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md) for the state model, the required checks, and the host mechanics ([github-implementation.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/github-implementation.md) § PR state flow).

1. **Check**: Does the current head commit already carry a `pair-review` check (from an earlier run on the same head)?
2. **Skip**: If a `pair-review` check already exists on this head **and** a review has been submitted for it, do nothing here — the PR is already in the flow (idempotency). A new head commit always needs a fresh check + review.
3. **Act — register the check as pending, when enforcement is on**: read `Review enforcement` from [way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) — **`disabled` is the default**. Enabled: publish `pair-review` on the head commit with a pending status **before** dispatching the review, using the mechanism the host's implementation guide prescribes for an ordinary (non-App) agent token — on GitHub a **commit status**, not a check run. That is what blocks the merge from t0: a crashed or never-started review leaves the required check unsatisfied instead of leaving the PR mergeable. Disabled: publish nothing here and say so — `pair-review: advisory (Review enforcement disabled)` — then dispatch the review exactly as before. The review still runs and still reports; what it cannot do is block, and claiming otherwise would be the one failure mode worse than not enforcing at all. **Then read the status back** on the head commit: publishing it is a write, and the invariant this skill applies in Phase 4 does not stop at Phase 5 — a status the read does not show is `pair-review: NOT PUBLISHED — advisory`, never an assumed block, because claiming a merge is blocked when it is not is the one failure mode worse than not enforcing. If the publication is **refused** (missing token scope, no status API), do not claim enforcement: report `pair-review: NOT PUBLISHED — advisory` and continue (degradation below).
4. **Act — label the state**: apply `pr-state:to-be-reviewed`, removing any other `pr-state:*` label (exactly one at a time). **Then read the PR's labels back** and confirm the state label is on them — a label API that silently no-ops otherwise renders `PR state: pr-state:to-be-reviewed` on a PR carrying no such label, the same unverified claim Phase 4 forbids. The label family is provisioned once per repository (implementation guide) and does **not** auto-create; if the read does not show it, or the label is absent or the label API is unavailable, report `PR state: not applied — finding` and continue — **non-blocking** (degradation below). The label is a **view** — the required checks are the authority (pr-states.md).
5. **Act — hand the review dispatch to whoever can actually spawn it**: the review must run on a **clean context** — an **anonymous** subagent whose prompt is the PR reference only, no context from this session (mechanical isolation, D23: the reviewing context must not inherit the authoring context). **Who spawns it depends on where this skill is running**, because harnesses commonly forbid **nested** subagent dispatch — and this skill is itself frequently running *inside* a subagent (`/implement` Step 3.3 publishes the PR from a handoff-only subagent), where spawning a second level would fail on the primary path:
   - **This skill is running inside a subagent** (or nested dispatch is unavailable/refused) → do **not** attempt to nest. Emit the signal **`Review: review-dispatch-required — /review $pr=<number>`** and return it to the caller; **the caller dispatches** (for `/implement`, Step 3.3 in the top-level session — the actor is named there). The `pair-review` check is already `pending`, so the merge stays blocked until the review lands: nothing is lost, and the dispatch happens one frame up where it is allowed.
   - **This skill is running at the top level** (invoked directly in a session that can spawn subagents) → spawn the anonymous review subagent here, now.
6. **The dispatch prompt** (identical for either actor) is the PR reference plus a **bounded** instruction — the review must not merge:

   ```text
   Run /review $pr=<number> $dispatched=true.
   Phases 1–5 only: produce the verdict, publish the `pair-review` check, synthesize the PR state.
   NEVER run Phase 6 and NEVER merge, even if the verdict is APPROVED and every gate is green —
   the merge is a human act (pr-states.md). Stop after Phase 5 and report.
   ```

   `/review`'s own non-interactive contract (its Arguments section) already forbids Phase 6 and defines what to do at its two human prompts (Step 1.4 "Proceed with review?" → continue without asking; Step 5.5 "Merge now?" → always "the author merges"), so a dispatched review neither stalls on an unanswerable question nor self-answers itself into a merge. The prompt states it too: belt and braces, since the constraint is an authorization boundary.

7. **Act — degraded path (no dispatch anywhere)**: if neither this skill nor its caller can spawn a subagent, do **not** run the review inline in this session (a self-context review defeats the isolation). Leave `pair-review` pending, note `Review: pending — dispatch unavailable, run /review <pr> in a fresh session` in the output, and post the same instruction as a PR comment. The merge stays blocked meanwhile, so nothing is lost — only deferred.
8. **Act — dispatch failure**: if the subagent fails or times out, the pending `pair-review` check stays in place (merge blocked) and the re-run guidance is posted as a PR comment. Re-invoking this skill re-dispatches (idempotent).
9. **Verify**: A read of the head commit shows the `pair-review` check (or the advisory/NOT-PUBLISHED report), a read of the PR shows exactly one `pr-state:*` label (or the `not applied` finding), and either a dispatched/submitted review or a recorded reason why it is still pending (`review-dispatch-required` counts as recorded **only** because the caller's contract picks it up — see Composition Interface). This skill never publishes a verdict itself and never merges.

## Output Format

```text
PUBLISH-PR REPORT:
├── Story:      [#ID: Title]
├── Handoff:    [.pair/working/checkpoints/<id>.md | none — state gathered from branch+story]
├── Mirrors:    [regenerated — commit <sha>, N file(s) — omit this row entirely when nothing was committed]
├── Gate:       [PASS | HALTED — N gates failing]
├── Base:       [base-branch — squash on merge: yes|no]
├── PR:         [#PR-number — URL — Created | Updated — ready-for-review confirmed by read | ready-for-review not confirmed — finding]
├── Tags:       [copied and confirmed by read: label, label | none on story — PR created without tags | dropped by host: label — finding]
├── Assignee:   [login — confirmed by read | unchanged: login — confirmed by read | none — WARNING: PR invisible in an assignee-filtered view]
├── Code host:  [same as PM tool | <host> (board updates → PM tool)]
├── Cross-link: [n-a (single tool) | Refs: <issue-id> + PR URL posted on <item> | already linked — comment present, not re-posted | back-link failed — manual link needed]
├── Conditional: [Services to Release: N deployable packages / n-a | Screenshots: UI touched / n-a]
├── Board:      [→ Review — confirmed by read | n-a — no Review state on this board | not updated — reason]
├── PR state:   [pr-state:to-be-reviewed — confirmed by read | not applied — finding]
└── Review:     [dispatched — subagent (clean context) | review-dispatch-required — /review $pr=<n> (caller dispatches) | pending — dispatch unavailable, run /review <pr> | already submitted on this head]

RESULT: [PR UNDER REVIEW — merge blocked by required check `pair-review` | HALTED — <reason>]
```

## Composition Interface

When composed by `/implement`'s closing phase (Step 3.3):

- **Input**: `/implement` invokes `/publish-pr` after the last task's commit, passing `$story` (and, when it wrote one, the checkpoint as `$handoff`). `/implement` owns task iteration; `/publish-pr` owns the gate→PR→board sequence.
- **Output**: The PR number/URL and board-state result flow back to `/implement`'s Phase 3 output. A HALTed gate propagates as `/implement`'s HALT.
- **Review-dispatch contract**: `/implement` publishes the PR from a **handoff-only subagent**, so this skill's Phase 5 runs one level down and must not nest a second subagent. It therefore returns **`Review: review-dispatch-required — /review $pr=<n>`**, and `/implement` Step 3.3 — running in the **top-level** session — spawns the anonymous review subagent with the bounded prompt (phases 1–5, never Phase 6/merge). The `pair-review` check is already `pending` before the return, so the merge is blocked across the handoff. When this skill runs at the top level instead, it dispatches itself and returns `Review: dispatched`.

When invoked **independently** (hotfix, automation loop #212):

- Standalone: no dependency on `/implement` having run in the same session. Resolve state from `$handoff`/branch/story (Phase 0), then run the full sequence.

## HALT Conditions

- **Story id unresolvable** from handoff or branch (Phase 0).
- **`mirror-realign-command` exits non-zero** (Phase 1) — report its own reason verbatim; nothing was regenerated and no PR side effects occur. Same shape as the gate-red HALT it precedes.
- **Quality gate red** (Phase 1) — report failing checks; no PR side effects.
- **pr-template not found** (Phase 3) — cannot compose a PR without it.
- **Code host unreachable or unauthenticated** for create/update (Phase 4) — report with a setup pointer and stop; nothing partial is left ready. **PM-side work already done is not rolled back** (the board write is the PM tool's own state); re-invocation is idempotent and resumes at the code-host step.

On HALT: report the blocker, propose resolution, make no PR side effects.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline/template missing → minimal structure; PM tool inaccessible → do the PR, warn on the board step) for the standard scenarios. Additional cases:

- **No `## Merge Strategy` section**: default to `squash` + the commit template, base `main` — the zero-configuration default, not a degradation. Consistent with the merge consumers, which also default to `squash`.
- **No `code-host` declared**: code host = PM tool (single-tool) — the zero-configuration default, not a degradation; the cross-link step is skipped entirely.
- **Back-link cannot be written** (item id not found, PM tool error, no comment mechanism, or `/write-issue` unavailable and no guide command): keep the PR, warn with the manual-link instruction; the `Refs:` line in the body still links PR → item. This is a warning by design, never a HALT.
- **No classification tags on the story**: create the PR without tags and note it (edge case) — never invent tags.
- **No assignee resolvable** (no `$assignee`, no `default-assignee`, or the host rejects the login): publish the PR **unassigned** and warn that it is invisible in an assignee-filtered view — a genuine degrade, **never a HALT**. The same cascade, and the same non-blocking outcome, as the item write. On an **existing** PR that already has an assignee this branch never fires as a clear: nothing resolvable means the current assignee stands (Phase 4 step 2).
- **A write the host reports as applied but a read does not show** (a tag, the assignee, ready-for-review, the `pair-review` status, the `pr-state:*` label — each read back where it is written: tags and assignee in Phase 4 step 3, ready-for-review in step 6, the check status and the state label in Phase 5 steps 3 and 4): report it as a finding on the corresponding output row and continue. The PR exists and is what matters; what must never happen is reporting the unapplied write as done.
- **No board state maps to `Review`** (a minimal board, D4 — a project that reviews on the PR and merges straight to `Done`): **write no state field** in step 7 — membership is still established and confirmed — and report `Board: n-a — no Review state on this board`. The zero-configuration documented skip, **not** an error and not a degraded publish — the readiness signal is the PR itself.
- **The direct board write cannot complete** (membership unconfirmable after the add and its one retry — the item writer's Step 7b; or a macrostate no board state can express — its Step 6): report the blocker verbatim on the `Board:` row as `not updated — <reason>` and continue. The reasons are the item writer's, the write is **this skill's own** — it applies those beats by reference, it does not compose them. The PR is published and ready-for-review; a board write that did not happen is **reported, never absorbed into a green publish**, and this skill never HALTs on it (the code-host artifact is the work).
- **No `mirror-realign-command` declared**: skip the realignment step and report nothing (Phase 1) — the zero-configuration default for a project with no generated mirrors, **not** a degradation. Never substitute a guessed command, and never a knowledge-base *install* command: installing a published release is a different operation from realigning a working tree, and using one for the other makes the fix depend on what has been published.
- **`/checkpoint` not installed**: gather state from branch + story directly (Phase 0).
- **`/write-issue` not installed**: only the **comment-mode back-link** (Phase 4 step 5) is affected — write it directly per the PM tool's implementation guide **and read the item's comments back to confirm it**, or warn with the manual-link instruction. A direct post the read does not show is reported `back-link failed — manual link needed`, **never as posted**: losing the composition must not lose the confirming read with it, or the degraded path becomes the one path that claims a write it never made. **The board write in step 7 is unaffected and still runs in full** (membership → confirming read → state field): it is direct, never a composition, so a missing item writer can never leave the story off the board. Skipping the board write here would re-create #384/#372 — green, ready-for-review, and invisible.
- **Nested subagent dispatch unavailable** (Phase 5 — the common case: this skill is itself running in `/implement`'s handoff subagent and the harness forbids a second level): return `Review: review-dispatch-required — /review $pr=<n>` and let the **caller** dispatch (`/implement` Step 3.3). This is the primary path when nested, not a degradation — the review still runs, one frame up, on a clean context.
- **Subagent spawning unavailable anywhere** (Phase 5 — the caller cannot spawn either, or this skill was invoked at top level in an environment without subagents): leave `pair-review` pending, post the re-run instruction as a PR comment, and note the deferral in the output. Never run the review inline in the authoring session (isolation, D23) and never mark the PR reviewed. Merge stays blocked — the outcome is deferred, not skipped.
- **Code host has no check-run/required-check API** (Phase 5): publish the state as a `pr-state:*` label only, note `enforcement: advisory — see host manual setup` in the output, and continue. Documented degradation, never a silent claim of enforcement (pr-states.md).
- **`pair-review` publication refused** (Phase 5 — token without the status scope, host API rejects it): the check is not published, so enforcement is **advisory**; report `pair-review: NOT PUBLISHED — advisory` (with the host error) and still dispatch the review. Never report a blocked merge that is not blocked.
- **`pr-state:*` label absent / no label API, or the read-back does not show it** (Phase 5): report `PR state: not applied — finding` and continue — **non-blocking**, the required checks remain the merge authority. The labels are provisioned once per repository (host implementation guide); never invent a different label name.
- **`/review` not installed**: still register the pending `pair-review` check and label the state, then report that no reviewer flow is available. The PR stays blocked rather than silently mergeable.

## Notes

- This skill **creates git-host artifacts** (a pushed branch, one PR, a pending `pair-review` check, a `pr-state:*` label) and updates board state — it does not modify source files, never renders a review verdict, and never merges.
- **Gate ≠ review** ([pr-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/pr-states.md)): the Phase 1 gate is mechanical; the judgment verdict belongs to `/review`, dispatched here on a clean context and enforced by the required `pair-review` check (R5.7).
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invocation detects the existing PR and updates it in place; re-runs the gate (fast if already green); re-parses the handoff. Never a duplicate PR.
- Tag propagation is a **copy**; the authoritative classification is (re)done in `/review` (G6).
- The gate here is a local pre-flight only — CI remains authoritative (#210).
- The handoff/checkpoint is the input contract (see the [checkpoint template](../../../.pair/knowledge/guidelines/collaboration/templates/checkpoint-template.md)); it is consumed here, never loaded as ambient context elsewhere.
