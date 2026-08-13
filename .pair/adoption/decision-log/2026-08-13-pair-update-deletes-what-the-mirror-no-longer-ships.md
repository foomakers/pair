# Decision: `pair update` deletes what a mirror no longer ships — bounded by the copy, and never silently

## Date

2026-08-13

## Status

Active

## Category

Tooling Preference

## Context

Two registries in `apps/pair-cli/config.json` declare `behavior: "mirror"` over a directory — `knowledge` (`.pair/knowledge/**`) and `github` (`.github/agents/**`). "Mirror" means the installed tree is a copy of the dataset: what the dataset drops, the target drops.

`pair update` never did the second half. Measured on the #393 branch rather than read off the call graph: for a mirror registry the install goes `doCopyAndUpdateLinks` → the CLI-local `copyDirectory` (`apps/pair-cli/src/registry/operations.ts`) → `copyDirHelper`, a pure source→target copy that deletes nothing. `handleMirrorCleanup` existed in `packages/content-ops`, was made recursive and ownership-bounded during this story, and was reachable **only** from the library's own `copyPathOps` / `movePathOps` — not from the CLI. Orphans planted at the top level and nested under `.pair/knowledge/**` survived a real `pair update --source ./packages/knowledge-hub/dataset --offline`, twice, in runs demonstrably live (they were indexed into `.pair/llms.txt`).

The cost was not hypothetical. The two how-to guides dropped from the dataset in #246 (superseded by ADR-012) were still installed at this repo's root ~5 months later and still advertised by `.pair/llms.txt`, so agents were handed guidance the KB no longer ships. Nothing in the tool could remove them; a human did, by hand, in this story — and four unit tests calling the helper directly had made the defect look fixed while the CLI path was untouched.

Whether the **tool** should do that removal was left open across review rounds 4-10 of PR #421 and recorded as the OPEN RESIDUAL in [the mirror-guard ADL](./2026-08-11-a-mirror-guard-compares-the-transform.md). Two things had to be true before it could be answered, and by round 10 both were:

1. **The documentation half was settled.** `customization/templates.mdx:154`, `customization/team.mdx:25` and `reference/kb-structure.mdx:113` all state that a consuming project's `.pair/knowledge/` is registry-owned and overwritten; the one sentence that read otherwise (`getting-started/quickstart-org.mdx:16`) was addressing the **central KB repository**, where that tree is authored source, and now says so explicitly.
2. **The delete had bounds.** Round 7 threaded the copy's own ownership context (`exclude` / `excludeRoot`, `folderBehavior` / `defaultBehavior` / `datasetRoot`) into the cleanup, so it asks one predicate — "would the copy install this?" — before removing **or** descending.

What remained was purely behavioral: the docs say those files are not the adopter's to keep, and the tool had never deleted them, so wiring cleanup starts destroying files that every install to date has taught adopters survive.

## Decision

**`pair update` performs mirror cleanup on the path it actually takes.** `handleMirrorCleanup` is exported from `@pair/content-ops` and invoked from the CLI's registry `copyDirectory` when the resolved behavior is `mirror`, before the copy. Three properties are part of the decision, not implementation detail:

1. **The wire is where the CLI copies, not where the library copies.** The defect class this closes is precisely "the helper is correct and nothing calls it", so the tests that pin it go through `doCopyAndUpdateLinks` — the function the CLI invokes — and were injection-verified RED with the wire removed. A test that calls the helper directly cannot see this class of bug; four such tests did not.

2. **Cleanup receives the SAME ownership context object as the copy.** Not an equivalent one, the same one: cleanup and copy can then never disagree about what the registry owns. An `exclude`d path, or one whose resolved behavior is `add` or `skip`, is neither deleted nor descended into. A destructive step may delete only what the copy step would install — the general rule already recorded in the mirror-guard ADL.

3. **Every deletion is a WARN, not an info line.** This is the one place `pair update` removes from the target tree. A deletion the operator cannot see in the output is indistinguishable from data loss, whatever the docs say — so the line names the path and where customization belongs:

   ```text
   ⚠️ Mirror: removed .pair/knowledge/how-to/04-how-to-define-subdomains.md (not in the source; customize via .pair/adoption/)
   ```

Because this is visible to every adopter on their next update, it ships with a migration entry rather than only a changelog line: `apps/website/content/docs/migrations/v0.4-to-v0.5.mdx` gains a "Changed" section stating what is now deleted, an idempotent prompt step that snapshots the mirror trees into `.pair/working/` **before** the update, and verify items reconciling the ⚠️ lines against that snapshot.

## Alternatives Considered

- **Leave cleanup library-only (the status quo through round 10).** Rejected: it makes `behavior: "mirror"` false on the only path adopters use, keeps shipping retired files into every installation, and makes every removal a manual act by someone who first has to notice — which took ~5 months on our own repo. The bidirectional guard added in round 10 *detects* orphans, but that guard lives in this repository; an adopting project has no such gate.
- **Delete silently, with the pre-existing `info` log.** Rejected: `pair update` is normally run to pick up new guidance, not expecting removals. An unannounced deletion under `.pair/knowledge/` is indistinguishable from corruption, and the operator only finds out through a diff they may not take.
- **Ship a `--dry-run` / `--no-clean` flag with it.** Deferred rather than rejected. The WARN line plus the migration page's snapshot step gives the operator both a record and a recovery path without adding a CLI surface and a second code path to maintain. The bound is one predicate, so a dry-run mode is a small addition on top of it if adopter reports call for one — it is not a prerequisite for correct behavior.
- **Prompt interactively before each deletion.** Rejected: `update` runs unattended in scripts and CI, where a prompt is either a hang or an implicit yes.
- **Restrict cleanup to files the dataset once shipped (an install manifest).** Rejected as a larger, separate design: it would spare adopter-authored files, but the project has no per-install manifest, and inventing one here would silently redefine what "mirror" means. The documented contract already says the tree is not the adopter's to author in, and `.pair/adoption/` exists (with `behavior: "add"`, never overwritten, never cleaned) precisely as the place that is.

## Consequences

- **Adopter-visible behavior change.** On the next update, a file an adopting project added under `.pair/knowledge/**` or `.github/agents/**` — or edited there and since retired upstream — is removed, where before it survived indefinitely. Documented in the v0.4 → v0.5 migration page (Changed section, prompt step 4, three verify items) and in the migrations index row.
- **The blast radius is exactly the copy's.** Verified by execution against a temp project, not by unit test alone: `.pair/knowledge/ORPHAN.md` and `.pair/knowledge/how-to/99-stale.md` removed, an adopter's own `.github/workflows/my-ci.yml` **intact** — the `github` registry's `include: ["/agents"]` narrowing resolves the rest of `.github/` to `skip`, so the registry does not own that tree. `adoption` (`behavior: "add"`) and `skills` (`overwrite`) are untouched by this change.
- **`handleMirrorCleanup` and `MirrorCleanupOwnership` are now public API of `@pair/content-ops`**, exported for the CLI. The export carries a comment stating why, so it is not mistaken for an incidental widening.
- **Detection and deletion now agree.** Round 10's `assertNoOrphanedMirrorEntries` sweeps this repository's own mirrors for orphans; from this change, the tool removes on the next update what that guard reports. The OPEN RESIDUAL in the mirror-guard ADL is closed by this record.
- **Regression risk moves to the ownership predicate.** Everything that keeps this from deleting adopter content sits in one function; widening its recursion again without widening its bounds is the failure mode, and it is pinned by tests at both levels (six ownership cases in `path-operation-helpers.test.ts`, three CLI-path cases in `operations.test.ts`).
- This record, like its sibling, deliberately writes short skill names without a leading slash: `.pair/adoption/**` is inside the reference rewriter's scope, so a document *about* the install pipeline has to dodge its own subject.

## Adoption Impact

- `apps/website/content/docs/migrations/v0.4-to-v0.5.mdx` — new "Changed" section (`pair update` now deletes what the KB no longer ships), prompt step 4 (snapshot into `.pair/working/`, reconcile, re-home), and the matching verify items; prompt scope widened to `.pair/adoption/` **and** `.pair/working/`.
- `apps/website/content/docs/migrations/index.mdx` — the v0.4 → v0.5 row names the deletion.
- [`2026-08-11-a-mirror-guard-compares-the-transform.md`](./2026-08-11-a-mirror-guard-compares-the-transform.md) — its OPEN RESIDUAL is closed and points here; the "changes nothing about `pair update` today" measurement is preserved as history and marked superseded by this change.
- No `tech/` adoption file changes: this decides how our own CLI behaves, not what the project adopts.
