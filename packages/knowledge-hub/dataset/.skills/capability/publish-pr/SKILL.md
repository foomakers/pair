---
name: publish-pr
description: "Publishes a completed story branch as a pull request: runs the quality gate, creates or updates ONE PR from the pr-template (conditional sections filled only when pertinent), copies the story's classification tags, marks it ready-for-review, and updates the board state. Standalone — driven by a handoff/checkpoint, not by /implement having run in the same session. Composed by a future closing phase of /implement; reused by hotfix and automation loops. Composes /verify-quality, /checkpoint, /write-issue."
version: 0.6.0
author: Foomakers
---

# /publish-pr — Publish a Story Branch as a PR

Take a completed story branch to a review-ready pull request in one standalone step: **gate → compose PR → propagate tags → ready-for-review → board state**. Reliable on a clean context (input is a handoff document, not session memory) and reusable outside `/implement` — hotfix branches and automation loops (#212, G10) invoke it directly.

**One PR per story:** the story lands on ONE branch with ONE PR. If a PR already exists for the branch, this skill UPDATES it — it never opens a second PR for the same story.

**Never merges.** This skill stops at a ready-for-review PR. Merge is a separate, human-gated step (`/review` / `/implement` Phase 4).

## Composed Skills

| Skill             | Type       | Required                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `/verify-quality` | Capability | Yes — the pre-flight gate (Phase 1). A red gate HALTs before any PR is created or updated (AC5).   |
| `/checkpoint`     | Capability | Optional — `$mode=resume` to read the handoff when one exists; if not installed, gather state from branch + story. |
| `/write-issue`    | Capability | Optional — two distinct compositions in Phase 4: `$mode: comment` for the PR-URL back-link (step 5) and the default write mode for the board state (step 7). If not installed, warn and continue (back-link written directly per the PM tool's implementation guide, board step skipped). |

## Arguments

| Argument     | Required | Description                                                                                                       |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `$story`     | No       | Story ID. If omitted, resolved from the handoff, then from the branch name (`<branch-format>` → `#<id>`). Unresolvable ⇒ **HALT** (AC edge case). |
| `$handoff`   | No       | Path to a handoff/checkpoint document. Default: `.pair/working/checkpoints/<story-id>.md`. Missing ⇒ gather minimal state from branch + story, then proceed (business rule). |
| `$scope`     | No       | Forwarded to `/verify-quality` as its `$scope` (default `all`).                                                  |

## Adoption Inputs (read deterministically)

Two sibling sections cover git concerns and the split is deliberate: **`## Merge Strategy` owns how a PR ends** (merge method, commit format, branch cleanup, merge confirmation — read by the merge consumers too), **`## Git Workflow` owns where the code lives and where it starts** (`code-host`, `base-branch`). This skill is the one reader of both, because it spans start (base branch) and intended end (merge method).

- **[way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → `## Merge Strategy`** — the same section the merge consumers read (`/review` Phase 6): `Method` (`squash` | `merge` | `rebase`, **default `squash`**) and the `Commit format` ([commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md)). Recorded on the PR as the intended merge strategy; **squash happens at merge, never here** (AC2). `branch-format` (to parse the branch id) comes from the [branch template](../../../.pair/knowledge/guidelines/collaboration/templates/branch-template.md).
- **way-of-working.md → `## Git Workflow`** — `code-host` (the tool owning branches/PRs) and `base-branch` (default `main`). **`code-host` absent ⇒ code host = PM tool** (single-tool; the zero-configuration default, not a degradation), and the same tool named in both places is treated exactly as omitted. Resolution, the PM↔code-host routing table, and the cross-linking convention live in one place: [way-of-working / PM-tool + code-host resolution](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) — this skill states only which side each operation is on.
- **way-of-working.md → `## State Mapping`** — board-column ↔ canonical-macrostate mapping (see [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)). Omitted ⇒ canonical names assumed.

## Algorithm

Each phase follows the **check → skip → act → verify** pattern. Phases run in order; a HALT stops the skill without side effects.

### Phase 0: Resolve Story & Handoff (BLOCKING)

1. **Check**: Is `$story` provided or already loaded in this session?
2. **Act**: If not, resolve in order:
   - From `$handoff` (or the default checkpoint path) via `/checkpoint $mode=resume` when installed — this yields story, branch, tasks done, decisions with zero prior context.
   - Else from the current branch name, parsing `#<id>` per the `branch-format`.
3. **Verify**: Story ID resolved AND the branch is known. If the story id cannot be resolved from handoff or branch → **HALT**: "Cannot resolve story id — pass `$story` explicitly." (edge case).
4. **Act**: If no handoff document exists, gather minimal state directly: branch (`git branch --show-current`), commits since base, and the story's ACs/tags from the PM tool. Note in the output that no handoff was found.

### Phase 1: Quality Gate (BLOCKING — AC5)

1. **Act**: Compose `/verify-quality` with `$scope` (default `all`). This is a local pre-flight, not a replacement for CI (CI stays authoritative, #210).
2. **Check**: Did every required gate pass?
3. **Skip**: If all gates pass, proceed to Phase 2.
4. **Act**: If any required gate fails → **HALT** before creating or updating the PR (AC5). Report each failing check (gate name + first failing detail). No PR side effects occur on a red gate.

### Phase 2: Resolve Merge Strategy & Prepare Base (AC2)

1. **Act**: Read the `## Merge Strategy` section (Adoption Inputs). Resolve, with defaults for anything omitted:
   - `Method` (default `squash`) — the intended merge method (`squash` | `merge` | `rebase`), recorded on the PR/output. **Applied at merge, not here** — this skill never rewrites branch history.
   - `Commit format` — the commit-message convention (informational; commits already exist on the branch).
   - `base-branch` (default `main`, from `## Git Workflow`) — the PR target branch.
   - `branch-format` (default `feature/#<id>-<slug>`, per the branch template) — used only to parse/validate the branch, never to rename it.
2. **Act**: Ensure the branch is pushed to the code host (`git push -u <remote> <branch>`); if already up to date, skip.
3. **Verify**: The resolved base branch exists on the remote and the feature branch is pushed. Example: `Method: squash` (the default) ⇒ the output marks squash-on-merge (AC2).

### Phase 3: Compose the PR Body (AC3)

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
4. **Verify**: The body follows the template, has no empty/placeholder sections, and every included conditional section is genuinely pertinent (AC3).

### Phase 4: Create/Update PR, Propagate Tags, Ready-for-Review, Board State (AC1, AC4)

1. **Check**: Does a PR already exist for this branch on the code host?
2. **Act — create or update (one PR per story):**
   - **No PR** → create it targeting `base-branch` on the code host.
   - **PR exists** → update its body and tags in place (edge case) — never open a second PR.
3. **Act — tag propagation (copy, not analysis):** copy the story's estimated **classification tags** (e.g. risk/size labels) to the PR verbatim. This is a copy — the authoritative re-classification happens in review (G6). If the story carries **no classification tags**, create the PR without tags and note it in the output (projection may be inactive, D17) (edge case).
4. **Act — code-host routing (AC4):** the PR is created/updated on the **code host**, the board state (step 6) is written on the **PM tool** — per the [routing table](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md). When `code-host` is absent (or names the PM tool) both resolve to the same tool and the split is invisible. When they differ, fill the pr-template's conditional `Refs: <issue-id>` slot (Phase 3 step 2) — the PM tool's own item id, copied verbatim.
5. **Check — back-link already present?** Read the PM item's existing comments (link field where the tool has one instead) and look for one containing this PR's URL.
   **Skip**: found → the back-link is already there; report it as `already linked` and do **not** post again. This is what keeps the step idempotent: a comment has no id, so `/write-issue` comment mode cannot dedupe it (see its Step 7c) — the check belongs here, or the normal fix→re-publish loop and any code-host HALT recovery would accrete one `PR: <url>` comment per round. If the item's comments cannot be read, treat it as *not found* and post (a duplicate comment is a lesser failure than a missing back-link) — say so in the report.
   **Act — post the back-link (bidirectional cross-link):** post the PR **URL back on the PM item** as a *comment* — never a body write. This closes the loop the `Refs:` line opens, so the board reaches the PR without any native integration. **Skip the whole step when code host = PM tool** — the host already links the two natively, so a comment would be noise. Two mechanisms, in order:
   - **`/write-issue` installed** → compose it in **comment mode**, which is non-destructive by contract (no template, no body render, no board write):

     ```text
     /write-issue $mode: comment $id: <issue-id> $comment: "PR: <pr-url>"
     ```

   - **not installed** → write the comment directly through the PM tool's implementation guide (e.g. Linear `commentCreate`, `gh issue comment`, the Azure DevOps work-item comments endpoint, the Jira comment API).

   Never compose `/write-issue` in write mode for the back-link: write mode is a **full-body overwrite** and would replace the story's AC/DoD/task breakdown with the link. If the **item id is not found**, or the PM tool errors, keep the PR (it is valid work) and warn with the manual-link instruction (edge case) — comment mode warns rather than HALTing for exactly this reason, so the documented non-blocking behavior holds through the composition.
6. **Act — ready-for-review:** mark the PR ready for review (not draft) on the code host; if the host supports an explicit ready command (e.g. `gh pr ready`), use it.
7. **Act — board state:** update the story's board state on the **PM tool** via the `## State Mapping` (canonical target: `Review`), using `/write-issue` (default write mode, `$status: Review`) when installed. If `/write-issue` is not installed or the PM tool is inaccessible, warn and continue — the PR is already ready. PR state itself is never mirrored onto the board.
8. **Verify**: A single ready-for-review PR exists on the code host, tags reflect the story (or their absence is noted), the cross-link exists in both directions when the tools differ — **exactly one** back-link comment, whether this run posted it or found it (or the missing back-link is reported) — and the board state is updated (or the failure is reported).

## Output Format

```text
PUBLISH-PR REPORT:
├── Story:      [#ID: Title]
├── Handoff:    [.pair/working/checkpoints/<id>.md | none — state gathered from branch+story]
├── Gate:       [PASS | HALTED — N gates failing]
├── Base:       [base-branch — squash on merge: yes|no]
├── PR:         [#PR-number — URL — Created | Updated]
├── Tags:       [copied: label, label | none on story — PR created without tags]
├── Code host:  [same as PM tool | <host> (board updates → PM tool)]
├── Cross-link: [n-a (single tool) | Refs: <issue-id> + PR URL posted on <item> | already linked — comment present, not re-posted | back-link failed — manual link needed]
├── Conditional: [Services to Release: N deployable packages / n-a | Screenshots: UI touched / n-a]
└── Board:      [→ Review | not updated — reason]

RESULT: [PR READY FOR REVIEW | HALTED — <reason>]
```

## Composition Interface

When composed by a future closing phase of `/implement` (wired in #256):

- **Input**: `/implement` invokes `/publish-pr` after the last task's commit, passing `$story` (and, when it wrote one, the checkpoint as `$handoff`). `/implement` owns task iteration; `/publish-pr` owns the gate→PR→board sequence.
- **Output**: The PR number/URL and board-state result flow back to `/implement`'s Phase 3 output. A HALTed gate propagates as `/implement`'s HALT.

When invoked **independently** (hotfix, automation loop #212):

- Standalone: no dependency on `/implement` having run in the same session. Resolve state from `$handoff`/branch/story (Phase 0), then run the full sequence.

## HALT Conditions

- **Story id unresolvable** from handoff or branch (Phase 0).
- **Quality gate red** (Phase 1) — report failing checks; no PR side effects (AC5).
- **pr-template not found** (Phase 3) — cannot compose a PR without it.
- **Code host unreachable or unauthenticated** for create/update (Phase 4) — report with a setup pointer and stop; nothing partial is left ready. **PM-side work already done is not rolled back** (the board write is the PM tool's own state); re-invocation is idempotent and resumes at the code-host step.

On HALT: report the blocker, propose resolution, make no PR side effects.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/graceful-degradation.md) (guideline/template missing → minimal structure; PM tool inaccessible → do the PR, warn on the board step) for the standard scenarios. Additional cases:

- **No `## Merge Strategy` section**: default to `squash` + the commit template, base `main` — the zero-configuration default, not a degradation (AC2). Consistent with the merge consumers, which also default to `squash`.
- **No `code-host` declared**: code host = PM tool (single-tool) — the zero-configuration default, not a degradation; the cross-link step is skipped entirely.
- **Back-link cannot be written** (item id not found, PM tool error, no comment mechanism, or `/write-issue` unavailable and no guide command): keep the PR, warn with the manual-link instruction; the `Refs:` line in the body still links PR → item. This is a warning by design, never a HALT.
- **No classification tags on the story**: create the PR without tags and note it (edge case) — never invent tags.
- **`/checkpoint` not installed**: gather state from branch + story directly (Phase 0).
- **`/write-issue` not installed**: skip the board-state update, warn, leave the PR ready.

## Notes

- This skill **creates git-host artifacts** (a pushed branch, one PR) and updates board state — it does not modify source files and never merges.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/idempotency.md). Re-invocation detects the existing PR and updates it in place; detects an existing back-link comment and does not post a second one (Phase 4 step 5's Check — the one composed step that cannot dedupe itself); re-runs the gate (fast if already green); re-parses the handoff. Never a duplicate PR, never a duplicate back-link.
- Tag propagation is a **copy**; the authoritative classification is (re)done in `/review` (G6).
- The gate here is a local pre-flight only — CI remains authoritative (#210).
- The handoff/checkpoint is the input contract (see the [checkpoint template](../../../.pair/knowledge/guidelines/collaboration/templates/checkpoint-template.md)); it is consumed here, never loaded as ambient context elsewhere.
