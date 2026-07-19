---
name: pair-capability-publish-pr
description: "Publishes a completed story branch as a pull request: runs the quality gate, creates or updates ONE PR from the pr-template (conditional sections filled only when pertinent), copies the story's classification tags, marks it ready-for-review, and updates the board state. Standalone — driven by a handoff/checkpoint, not by /pair-process-implement having run in the same session. Composed by a future closing phase of /pair-process-implement; reused by hotfix and automation loops. Composes /pair-capability-verify-quality, /pair-capability-checkpoint, /pair-capability-write-issue."
version: 0.4.1
author: Foomakers
---

# /pair-capability-publish-pr — Publish a Story Branch as a PR

Take a completed story branch to a review-ready pull request in one standalone step: **gate → compose PR → propagate tags → ready-for-review → board state**. Reliable on a clean context (input is a handoff document, not session memory) and reusable outside `/pair-process-implement` — hotfix branches and automation loops (#212, G10) invoke it directly.

**One PR per story:** the story lands on ONE branch with ONE PR. If a PR already exists for the branch, this skill UPDATES it — it never opens a second PR for the same story.

**Never merges.** This skill stops at a ready-for-review PR. Merge is a separate, human-gated step (`/pair-process-review` / `/pair-process-implement` Phase 4).

## Composed Skills

| Skill             | Type       | Required                                                                                          |
| ----------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `/pair-capability-verify-quality` | Capability | Yes — the pre-flight gate (Phase 1). A red gate HALTs before any PR is created or updated (AC5).   |
| `/pair-capability-checkpoint`     | Capability | Optional — `$mode=resume` to read the handoff when one exists; if not installed, gather state from branch + story. |
| `/pair-capability-write-issue`    | Capability | Optional — used to update the story's board state (Phase 4). If not installed, warn and continue.  |

## Arguments

| Argument     | Required | Description                                                                                                       |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `$story`     | No       | Story ID. If omitted, resolved from the handoff, then from the branch name (`<branch-format>` → `#<id>`). Unresolvable ⇒ **HALT** (AC edge case). |
| `$handoff`   | No       | Path to a handoff/checkpoint document. Default: `.pair/working/checkpoints/<story-id>.md`. Missing ⇒ gather minimal state from branch + story, then proceed (business rule). |
| `$scope`     | No       | Forwarded to `/pair-capability-verify-quality` as its `$scope` (default `all`).                                                  |

## Adoption Inputs (read deterministically)

- **[way-of-working.md](../../../.pair/adoption/tech/way-of-working.md) → `## Merge Strategy`** — the same section the merge consumers read (`/pair-process-review` Phase 6): `Method` (`squash` | `merge` | `rebase`, **default `squash`**) and the `Commit format` ([commit template](../../../.pair/knowledge/guidelines/collaboration/templates/commit-template.md)). Recorded on the PR as the intended merge strategy; **squash happens at merge, never here** (AC2). `base-branch` defaults to `main`; `branch-format` (to parse the branch id) comes from the [branch template](../../../.pair/knowledge/guidelines/collaboration/templates/branch-template.md). A consolidated `git-workflow` adoption section (base-branch + `code-host` alongside Merge Strategy) is #236's job.
- **way-of-working.md → `code-host`** — the code host when it differs from the PM tool (#236). Absent ⇒ code host = PM tool (single-tool; AC4 degrades gracefully).
- **way-of-working.md → `## State Mapping`** — board-column ↔ canonical-macrostate mapping (see [canonical-states.md](../../../.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md)). Omitted ⇒ canonical names assumed.

## Algorithm

Each phase follows the **check → skip → act → verify** pattern. Phases run in order; a HALT stops the skill without side effects.

### Phase 0: Resolve Story & Handoff (BLOCKING)

1. **Check**: Is `$story` provided or already loaded in this session?
2. **Act**: If not, resolve in order:
   - From `$handoff` (or the default checkpoint path) via `/pair-capability-checkpoint $mode=resume` when installed — this yields story, branch, tasks done, decisions with zero prior context.
   - Else from the current branch name, parsing `#<id>` per the `branch-format`.
3. **Verify**: Story ID resolved AND the branch is known. If the story id cannot be resolved from handoff or branch → **HALT**: "Cannot resolve story id — pass `$story` explicitly." (edge case).
4. **Act**: If no handoff document exists, gather minimal state directly: branch (`git branch --show-current`), commits since base, and the story's ACs/tags from the PM tool. Note in the output that no handoff was found.

### Phase 1: Quality Gate (BLOCKING — AC5)

1. **Act**: Compose `/pair-capability-verify-quality` with `$scope` (default `all`). This is a local pre-flight, not a replacement for CI (CI stays authoritative, #210).
2. **Check**: Did every required gate pass?
3. **Skip**: If all gates pass, proceed to Phase 2.
4. **Act**: If any required gate fails → **HALT** before creating or updating the PR (AC5). Report each failing check (gate name + first failing detail). No PR side effects occur on a red gate.

### Phase 2: Resolve Merge Strategy & Prepare Base (AC2)

1. **Act**: Read the `## Merge Strategy` section (Adoption Inputs). Resolve, with defaults for anything omitted:
   - `Method` (default `squash`) — the intended merge method (`squash` | `merge` | `rebase`), recorded on the PR/output. **Applied at merge, not here** — this skill never rewrites branch history.
   - `Commit format` — the commit-message convention (informational; commits already exist on the branch).
   - `base-branch` (default `main`) — the PR target branch. A configurable base lands with the `git-workflow` consolidation (#236).
   - `branch-format` (default `feature/#<id>-<slug>`, per the branch template) — used only to parse/validate the branch, never to rename it.
2. **Act**: Ensure the branch is pushed to the code host (`git push -u <remote> <branch>`); if already up to date, skip.
3. **Verify**: The resolved base branch exists on the remote and the feature branch is pushed. Example: `Method: squash` (the default) ⇒ the output marks squash-on-merge (AC2).

### Phase 3: Compose the PR Body (AC3)

1. **Act**: Read the [pr-template](../../../.pair/knowledge/guidelines/collaboration/templates/pr-template.md). Fill the always-applicable sections from the handoff/story:
   - **Title**: `[#<story-id>] <type>: <brief description>` (`<type>` from commit-format / story type).
   - **Summary** (What Changed + Why) from the story statement and the handoff's decisions.
   - **Story Context**: link the story issue and list AC coverage.
   - **Changes Made**: tasks completed + files added/modified/deleted (from `git diff --name-only <base-branch>...HEAD`).
   - **Testing**: quality-gate results from Phase 1.
2. **Act — conditional sections (fill ONLY when pertinent; never leave an empty section):**
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
4. **Act — code-host routing (AC4):** if `code-host` differs from the PM tool (#236), the PR lives on the code host and cross-links the PM item via the text convention `Refs: <issue-id>` in the body; board-state updates (next step) go to the PM tool. If `code-host` is absent, code host = PM tool (single-tool).
5. **Act — ready-for-review:** mark the PR ready for review (not draft); if the host supports an explicit ready command (e.g. `gh pr ready`), use it.
6. **Act — board state:** update the story's board state via the `## State Mapping` (canonical target: `Review`), using `/pair-capability-write-issue` when installed. If `/pair-capability-write-issue` is not installed or the PM tool is inaccessible, warn and continue — the PR is already ready.
7. **Verify**: A single ready-for-review PR exists on the code host, tags reflect the story (or their absence is noted), and the board state is updated (or the failure is reported).

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
├── Conditional: [Services to Release: N deployable packages / n-a | Screenshots: UI touched / n-a]
└── Board:      [→ Review | not updated — reason]

RESULT: [PR READY FOR REVIEW | HALTED — <reason>]
```

## Composition Interface

When composed by a future closing phase of `/pair-process-implement` (wired in #256):

- **Input**: `/pair-process-implement` invokes `/pair-capability-publish-pr` after the last task's commit, passing `$story` (and, when it wrote one, the checkpoint as `$handoff`). `/pair-process-implement` owns task iteration; `/pair-capability-publish-pr` owns the gate→PR→board sequence.
- **Output**: The PR number/URL and board-state result flow back to `/pair-process-implement`'s Phase 3 output. A HALTed gate propagates as `/pair-process-implement`'s HALT.

When invoked **independently** (hotfix, automation loop #212):

- Standalone: no dependency on `/pair-process-implement` having run in the same session. Resolve state from `$handoff`/branch/story (Phase 0), then run the full sequence.

## HALT Conditions

- **Story id unresolvable** from handoff or branch (Phase 0).
- **Quality gate red** (Phase 1) — report failing checks; no PR side effects (AC5).
- **pr-template not found** (Phase 3) — cannot compose a PR without it.
- **Code host unreachable** for create/update (Phase 4) — report and stop; nothing partial is left ready.

On HALT: report the blocker, propose resolution, make no PR side effects.

## Graceful Degradation

See [graceful degradation](../../../.pair/knowledge/skill-conventions/graceful-degradation.md) (guideline/template missing → minimal structure; PM tool inaccessible → do the PR, warn on the board step) for the standard scenarios. Additional cases:

- **No `## Merge Strategy` section**: default to `squash` + the commit template, base `main` — the zero-configuration default, not a degradation (AC2). Consistent with the merge consumers, which also default to `squash`.
- **No `code-host` declared**: code host = PM tool (single-tool; AC4 still satisfied in the degraded shape).
- **No classification tags on the story**: create the PR without tags and note it (edge case) — never invent tags.
- **`/pair-capability-checkpoint` not installed**: gather state from branch + story directly (Phase 0).
- **`/pair-capability-write-issue` not installed**: skip the board-state update, warn, leave the PR ready.

## Notes

- This skill **creates git-host artifacts** (a pushed branch, one PR) and updates board state — it does not modify source files and never merges.
- **Idempotent** — see [idempotency convention](../../../.pair/knowledge/skill-conventions/idempotency.md). Re-invocation detects the existing PR and updates it in place; re-runs the gate (fast if already green); re-parses the handoff. Never a duplicate PR.
- Tag propagation is a **copy**; the authoritative classification is (re)done in `/pair-process-review` (G6).
- The gate here is a local pre-flight only — CI remains authoritative (#210).
- The handoff/checkpoint is the input contract (see the [checkpoint template](../../../.pair/knowledge/guidelines/collaboration/templates/checkpoint-template.md)); it is consumed here, never loaded as ambient context elsewhere.
