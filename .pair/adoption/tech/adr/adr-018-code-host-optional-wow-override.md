# ADR-018: Code Host as an Optional Way-of-Working Override, Linked by Text Convention

## Status

Accepted

## Date

2026-07-28

## Context

- pair's skill corpus conflated two distinct tools behind one adoption field. `pm-tool` in `way-of-working.md` was read for *both* backlog operations (create/update an item, read its labels and state, transition it) *and* code operations (cut a branch, open/read/label a pull request, submit a review, merge). On GitHub Projects — the only PM tool the corpus had been exercised against — the two coincide, so the conflation was invisible.
- The conflation becomes a hard failure the moment a project's backlog lives somewhere that hosts no repositories. Linear and Jira are the flagship examples; `filesystem` (pair's offline tracker) is a third, because it only moves item files between status directories and has no branches or PRs at all. Story #236 adopts Linear + GitHub as the reference split case.
- Two further design questions came with it, and both had to be answered before any skill could be patched: (a) how an item and its PR find each other when the tools are different systems, and (b) whether PR state (draft / ready / approved / merged) and the pair review check should be mirrored back onto the board.
- Constraints: an existing single-tool project must keep working byte-identically with **zero** new adoption content (`.pair/adoption` is delta-only — a schema's complete default lives in the KB, D21); the routing rule must be grep-verifiable rather than re-derived in each of the ~40 skills; and pair may not depend on any PM tool's proprietary VCS integration, because tool-agnosticism is a framework requirement (R2.12/R2.13).
- Prerequisite/sibling: ADR-011 (Canonical States + n-m State-Mapping Schema) established the precedent this ADR follows — an optional `way-of-working.md` section whose absence is a valid, fully-specified configuration.

## Options Considered

### Option 1: Keep one tool field; let each skill infer the code host from context

- **Description**: No schema change. Skills detect a git remote (or just assume `gh`) when they need a PR, and use `pm-tool` for everything else.
- **Pros**: No adoption schema to design; nothing to migrate; the shortest diff.
- **Cons**: The inference lives in every skill that touches a PR (8+ files) and drifts independently; it is not grep-verifiable ("does this skill assume the PM tool hosts the code?" has no answer); a Linear-only project silently routes PR-description edits and PR labels to a tool that has neither, producing no-ops instead of errors; and the accidental `gh` fallback becomes load-bearing without ever being declared.

### Option 2: Depend on the PM tool's native VCS integration, mirroring PR state onto the board

- **Description**: Require (and configure) e.g. Linear's GitHub app. The integration supplies the item↔PR link and pushes PR states onto the board; pair reads/writes state through the PM tool only, as before.
- **Pros**: Zero cross-linking work for skills; users get a rich native UI; a PR's status is visible on the card.
- **Cons**: **Rejected.** It makes a per-tool proprietary integration a hard prerequisite of the framework (violates tool-agnosticism — every new PM tool needs its own integration story, and self-hosted/air-gapped setups can't comply); it duplicates state across two systems, so the two disagree the moment one write fails and there is no single owner to reconcile from; and the mirrored PR states are not pair macrostates, so `## State Mapping` would need a second, parallel vocabulary. Native integrations may still be *enabled* by a project — they simply must not be *depended on*.

### Option 3: Optional `code-host` field + text-convention cross-link, review check on the code host only (chosen)

- **Description**:
  1. `way-of-working.md` gains an optional `## Git Workflow` section holding `code-host` and `base-branch` (default `main`). **`code-host` absent ⇒ the code host is the PM tool** — the zero-configuration default for repository-hosting trackers; the same tool named in both fields is treated exactly as omitted (no dual-write). A PM tool that **hosts no code** (`linear`, `jira`, `filesystem`) has nothing to fall back to, so an absent `code-host` there HALTs before any PR operation with a setup pointer instead of resolving to a tool that cannot host a PR.
  2. The **PM↔code-host routing table** lives in exactly one KB file (`skill-conventions/way-of-working-pm-resolution.md`). Each skill states only *which side* an operation is on and points at the table; no skill restates the resolution steps, the default, or the cross-linking convention.
  3. The link between an item and its PR is **text convention**, both directions: the PR body carries `Refs: <issue-id>` (a conditional slot in the PR template, written by `/publish-pr`, read back by `/review` and `/next`), and the PR URL is posted **back on the item as a comment** — never as a body update, since a body write would overwrite the story's acceptance criteria. `/write-issue` therefore exposes a dedicated non-destructive `$mode: comment` path whose failures **warn instead of HALTing**, so a missing back-link can never invalidate an already-valid PR.
  4. **No status mirroring.** Macrostate transitions always happen on the PM tool; PR states live on the code host and are never copied onto the board. The **pair review check registers on the code host only**, because that is where it gates the merge; the board reaches the outcome through the linked PR reference.
- **Pros**: Zero adoption footprint and byte-identical behavior for single-tool projects; one file to change if the split model ever changes; grep-verifiable per-skill routing (a conformance test asserts it); works with any code host and any PM tool with a comment or link field, with no proprietary integration; no duplicated state, so no reconciliation problem; a declared-but-unreachable code host fails loudly and idempotently (PM-side work already done is not rolled back).
- **Cons**: Adds a second resolution step for every PR-touching skill and a schema the skill author must learn; the cross-link is only as good as the convention (a hand-edited PR body that drops `Refs:` breaks the read-back, where a native integration would not); the back-link needs a comment capability per PM tool (documented per implementation guide); and the split path is verified by documentation plus content-assertion tests rather than a live two-tool run.

## Decision

Adopt Option 3.

- `## Git Workflow` (`code-host`, `base-branch`) is an **optional** section of `way-of-working.md`, documented in the KB template and left unset by default. Absent ⇒ code host = PM tool for repository-hosting trackers; **required** for `linear` / `jira` / `filesystem`.
- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md` is the **single source of truth** for code-host resolution, the routing table, section ownership (`## Git Workflow` owns where code lives and where a branch starts; `## Merge Strategy` owns how a PR ends), and the cross-linking convention.
- Cross-linking is **text convention in both directions** (`Refs: <issue-id>` in the PR body; PR URL as a comment on the item). Native PM-tool VCS integrations may coexist but no skill depends on one.
- **No PR-state mirroring onto the board**, and the pair review check registers **on the code host only**.
- `/write-issue` gains `$mode: comment` — the only sanctioned back-link mechanism through that skill — which is non-destructive and warns rather than HALTs; where it is not installed, `/publish-pr` writes the comment directly through the PM tool's implementation guide.

## Consequences

- **Positive**: single-tool projects are unaffected and configure nothing; Linear/Jira/filesystem adoptions become usable end-to-end; the routing rule is enforced by one conformance test file rather than by reviewer memory; adding a PM tool means writing an implementation guide (including its comment mechanism), never touching skill logic.
- **Negative / accepted**: eight skills now carry a routing pointer they didn't need before; a hand-edited PR body can break the `Refs:` read-back; the split path ships verified by documentation + content assertions, **not** by a live Linear+GitHub cycle (no throwaway Linear workspace was available) — recorded as an accepted gap on story #236 and disclosed in PR #389 rather than silently left unchecked.
- **Follow-ups**: any new PM tool guideline must document its comment/link mechanism for the back-link; if a live two-tool walkthrough is later run, it validates rather than changes this decision.

## References

- Story #236 — code host separate from PM tool (WoW override); Epic #202 — canonical states, n-m mapping, DoR/DoD.
- [ADR-011](adr-011-canonical-states-state-mapping.md) — the optional-`way-of-working.md`-section precedent this ADR follows.
- [way-of-working / PM-tool + code-host resolution](../../../knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md) — the routing table and cross-link convention this ADR ratifies.
- [linear-implementation.md](../../../knowledge/guidelines/collaboration/project-management-tool/linear-implementation.md) — the reference split-case PM guideline (`commentCreate` back-link).
- [Code Host vs PM Tool](../../../../apps/website/content/docs/concepts/code-host.mdx) — the user-facing explanation of this decision.
