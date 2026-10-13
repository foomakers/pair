# Decision: A mirror guard compares the OUTPUT of the transform, never the source

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

This repo ships two copies of most content: a canonical **dataset** under `packages/knowledge-hub/dataset/**`, and an installed **mirror** at the repo root (`.pair/knowledge/**`, `.claude/skills/**`, `AGENTS.md`/`CLAUDE.md`). The root copy is *generated*: `pair update` copies the dataset and rewrites, in every markdown file it lands, the `/command` skill references (short `assess-security` becomes `/pair-capability-assess-security`) and the `.skills/**` SKILL.md link paths. **The mirror is not a copy of the source; it is a copy of the source's transform.**

Parity guards exist because the copies drifted repeatedly (seven incidents on record, three from a hand-port instead of a regeneration). One got the comparison wrong. `packages/knowledge-hub/src/conformance/code-review-verdict-first.test.ts` (#228) asserted:

```ts
it('is byte-identical between root and dataset (identical-mirror invariant)', () => {
  expect(TEMPLATE_MIRROR).toBe(TEMPLATE_DATASET)
})
```

justified as *"The PR declares the two files an identical mirror — enforce that fully with byte-equality"*. That is only satisfiable while the mirror is **untransformed**, so it froze a defect into an invariant:

- Measured across the KB corpus on 2026-08-11: **441 markdown files; the transform changes 42 of them**. The other 399 carry no skill reference and no `.skills/**` link, so `transform(x) === x` and byte-identity is *correct* — the rule below does **not** say a mirror must differ from its source. What is wrong is a mirror byte-identical to a source the transform *would* have changed; `guidelines/collaboration/templates/code-review-template.md` was the **only** such file. The guard pinned the single anomaly as the rule.
- The installed template therefore documented slash-prefixed **short** names (`assess-security`, `assess-cost`, `assess-coupling`, `classify`) — **commands that do not exist in the reader's assistant** (`/pair-capability-assess-security` does).
- Every `pair update` rewrote the file correctly and turned the guard red; restoring byte-identity turned it green (reproduced twice on `e7ea4e1a`) — the project's own drift remedy and the guard were deadlocked until a human broke the tie.

The correct pattern existed one directory away: `packages/knowledge-hub/src/tools/skill-md-mirror.ts` compares against the **regenerated** copy (the real copy pipeline over an in-memory dataset clone); same for `skills-guide-mirror.test.ts`. Only the #228 guard compared against the raw source.

Related open question: the two generated **root** files with no dataset source — `CLAUDE.md` (from `AGENTS.md` with the `claude` transform) and `.pair/llms.txt` (written by `writeProjectLlmsTxt` on every install/update) — were reported as producing a trailing-newline diff on every update. With nothing to compare byte-wise, "is this drift?" had no answer, and story **#416** wants a guard on `.pair/llms.txt`.

## Decision

**A mirror guard asserts `mirror === transform(dataset)`. Never `mirror === dataset`.**

A guard asserting `mirror === dataset` asserts *that no transform exists*; when one does, it forbids the mirror from being correct.

Three corollaries, each enforced by code in this repo:

1. **The transform is the production one, not a re-implementation.** `mirror-guard.ts`'s `buildMirrorTransform` composes the real content-ops `rewriteSkillReferences` + `rewriteSkillLinkPaths` — the exact pair the CLI applies to non-skills registries (`applySkillRefsToNonSkillRegistries`) — so a pipeline bug **fails** the guard instead of being masked by a parallel copy. Same principle as `skill-md-mirror.ts`.

2. **The failure message states what it compares.** `assertMirrorMatches` fails with `COMPARED: the installed mirror vs. TRANSFORM(dataset source) — NOT vs. the raw dataset source …`, plus why byte-equality with the source is itself the drift. The wrong invariant was *derived by a reader* from a guard that did not say what it compared.

3. **A generated file with no dataset source is compared against its generator** — the degenerate case where `dataset` is empty and `transform` is the whole generator. #416 will formalize it for `.pair/llms.txt`.

Scope is the **class**, not the instance: `mirror-guard.test.ts` asserts `mirror === transform(dataset)` for **every** file the guarded datasets contribute (derived from disk at collection time — no list, no count), plus a "no mirror is frozen untransformed" sweep naming the whole offending set. The 399 files with no skill references still pass.

**Non-markdown KB files are guarded too, by the same helper.** The `knowledge` registry also ships `assets/*.sh` (two of them executable gate scripts) and `assets/gitleaks-example.toml`. Install-time rewrites walk `.md` only, so the transform is the identity *by construction* and the assertion is plain byte-equality — stated so in the failure message ("byte-identity is itself the drift" is false here). Pipeline invariance is pinned: the guard asserts the registry declares no `flatten`/`prefix` and no per-target transform, which also makes the skill-ref + link-path pair the *complete* transform for this registry (`applySkillRefsToNonSkillRegistries` skips any registry with flatten/prefix).

**The mirror is regenerated by running the pipeline, never by hand-editing the output** — `pair update --source ./packages/knowledge-hub/dataset --offline` in this repo. Hand-porting caused three of the seven recorded incidents; a hand-edit gets skill names right and surrounding formatting wrong.

**A destructive mirror cleanup may delete only what the copy step would install — ownership travels with the recursion.** Added 2026-08-12 (review round 7 on PR #421), because making `handleMirrorCleanup` recursive widened a delete path. The copy decides at **every** depth what the registry owns: an `exclude`d entry is dropped as if never in the source, and an entry resolving to `add` or `skip` is left alone (for `add`, target-only files are the point). A cleanup descending the shared tree *without* that context deletes adopter content under a subtree the registry does not own. So the same `exclude`/`excludeRoot` and `folderBehavior`/`defaultBehavior`/`datasetRoot` the copy honors are threaded into the cleanup from both call sites (`copy-directory.ts`, `movePathOps.ts`), and it asks one predicate — "would the copy install this?" — before removing **or descending into** anything. Reachability: `exclude` under a mirror root is reachable from config and pinned end-to-end through `copyPathOps`; `add`/`skip` under a mirror root is not reachable through a validated registry today (`validateMirrorConstraints` rejects a non-mirror descendant of a `mirror` key), so that half is defense-in-depth for direct callers, pinned at unit level. General form: **widening the blast radius of a delete is not a refactor — the ownership rules that bounded it must widen with it, in the same change.**

**On the two generated root files: the diff is settled as eliminated, not tolerated.** Verified 2026-08-11 on `e8e5e986`: a full `pair update` from the local dataset produces **no diff** on `CLAUDE.md` or `.pair/llms.txt`. The `CLAUDE.md` half was fixed in #412 (`e7ea4e1a`) — a trailing blank line `collapseBlankLines` could not see (two newlines are not three or more). `.pair/llms.txt` was never a generator bug: it **is** regenerated every run (proved by injecting a `DRIFT-PROBE` line and watching the next `pair update` remove it — worth repeating, since "no diff" is also what a never-written file shows) and reproduces byte-identically. #416 can build on the current bytes.

## Alternatives Considered

- **Copy the dataset file over the mirror** (the mechanical reading of the original story title). Rejected, verified wrong on 2026-08-05: it *destroys* the skill-name rewrite, reinstating short `refine-story` where the assistant knows only `/pair-process-refine-story`.
- **Keep byte-equality and make the rewriter skip files under an "identical-mirror invariant"** (the other branch the #393 evidence comment offered). Rejected: correctness would depend on an opt-out list whose files ship commands the reader cannot type — inverting cause and effect.
- **Relax #228 to "identical modulo the skill-reference transform" with a bespoke regex.** Rejected: a parallel rewrite implementation would agree with a buggy pipeline or disagree with a correct one.
- **Drop the equality assertion, keep only structural checks** (heading-count parity, seven assessment sections). Rejected: those prove structure, not content; the drift class here is body text, which is why #228 added the assertion. The protection is kept in full — only its target changed.
- **Guard just `code-review-template.md`.** Rejected: one instance of a class cheap to assert over the whole tree; closing the instance leaves the next hand-port free.

## Consequences

- `packages/knowledge-hub/src/tools/mirror-guard.ts` is the tested production module holding the rule (per the [gate-tooling-in-tested-modules ADL](./2026-07-13-gate-tooling-code-in-tested-modules.md)); the #228 guard and the whole-tree guard both call its `assertMirrorMatches` — ONE definition of the comparison, one failure format.
- The whole `.pair/knowledge/**` tree is guarded — markdown against `transform(source)`, non-markdown byte for byte — where previously only `skills-guide.md` was. A new KB file adds a case with no test edit.
- **The scope is "every install TARGET whose install rewrites content", not "the KB" and not even "the registry".** The unit is a (dataset source → installed copy) pair, since one registry can install one source at several targets under *different* ops. Four are guarded, in `GUARDED_MIRRORS`: `.pair/knowledge/**` and `.github/agents/**` (`knowledge` and `github` registries — `behavior: "mirror"`, no flatten/prefix, so `applySkillRefsToNonSkillRegistries` runs the same rewrite over both), plus the two root files the `agents` registry generates from `dataset/AGENTS.md`: `AGENTS.md` and `CLAUDE.md` — one data-driven suite, only paths and per-target op sets differ.
- **What separates a target's installed bytes from `skillRefs(dataset)` is modeled per target by `buildInstallTransform`**, in pipeline order: (1) `applyTransformCommands(text, prefix)` for a target declaring a naming transform (`writeSecondaryTarget`); (2) `stripAllMarkers` when the registry's *source* is a single **file**, since `postCopyOps` calls `stripMarkersFromTarget` on non-directory targets only; (3) the shared skill-ref rewrite, markdown only. Modeling (2) let `AGENTS.md` join the guard and corrects a wrong record: the `agents` registry's earlier exclusion cited "a per-target naming transform" — true of `CLAUDE.md`, **false** of `AGENTS.md`, whose real blocker was the marker strip (measured: `AGENTS.md === skillRefs(stripAllMarkers(dataset))` holds, `AGENTS.md === skillRefs(dataset)` does not).
- **The remaining exclusions are asserted, encoding the real blocker.** Two registries are out, neither for renaming: `adoption` is `behavior: "add"` (seeded once, then owned by the adopter — divergence is the point) and `skills` declares flatten+prefix, so the pipeline skips the skill-ref rewrite (that pair is `skill-md-mirror`'s job). The suite asserts *every other* declared registry is guarded, so a new rewritten registry in `config.json` cannot stay outside. Each guarded mirror pins its modeled ops against config: the declared per-target `transform` must be exactly the modeled naming prefix, and the source's on-disk kind must match the marker-strip flag. A declared `include` is honored through one membership predicate shared by fixture and pin, so an un-copied sibling is never demanded.
- **The call form `/name(args)` is rewritten too.** `buildReferenceRegex`'s after-boundary class excluded `(`, so `record-decision(content, target, decision-metadata)` — how the KB documents a skill contract, written here without its leading slash per the convention below — was walked past, invisibly to any mirror guard (the dataset carries the same text). Fixed at the source (a one-character class change in `skill-reference-rewriter.ts`, test-first), since a guard cannot catch a transform that under-fires. Occurrences inside fenced blocks are deliberate authoring templates.
- **The transform is applied PER FILE, never over a concatenation.** `rewriteSkillReferences` carries fenced-block state to the end of its input, so `transform(join(corpus))` lets a file ending inside an open fence exempt the next file's head. Found live: `guidelines/collaboration/estimation/forecast-based-estimation.md` closed a fence with a second ``` ```text ``` marker (a closing fence may carry no info string), exempting the first 37 lines of the next file. The one-character dataset fix is in this change; a test pins the mechanism.
- **Mirror cleanup descends into shared directories now (absorbed #426, `248f114a`).** `handleMirrorCleanup` (`packages/content-ops/src/ops/path-operation-helpers.ts`) compared only the target's *immediate children*, so a file dropped from the dataset survived every mirror run below the top. It now **descends** into a directory present on both sides and removes only entries the source lacks (`rm -r` on a shared directory would delete content still shipped). Old cost: the two how-to guides dropped in #246 (superseded by ADR-012) were still installed ~5 months later and indexed by `.pair/llms.txt`; both were deleted **by hand** here.
- **That recursion changed nothing about `pair update` until it was wired — measured, not reasoned. SUPERSEDED within this same PR: see [`2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md`](./2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md),** which keeps the measurement (CLI path `doCopyAndUpdateLinks` → `copyDirectory` → `copyDirHelper`, deletes nothing; planted orphans survived a live `pair update`) and the wiring that ships the change with a WARN per deletion. Kept here as the reason four green unit tests proved nothing: the helper was reachable only from content-ops' own `copyPathOps` / `movePathOps` (via `copy-directory.ts`'s `performDirectoryCopy`, gated on `behavior: "mirror"`).
- **Orphans are DETECTED, in both directions (review round 10).** The per-file comparison is keyed by dataset files, so alone it misses a file existing only under the target — the defect removed **by hand** here (`how-to/04-how-to-define-subdomains.md`, `05-how-to-define-bounded-contexts.md`). `assertNoOrphanedMirrorEntries` sweeps the other way for every directory-kind guarded mirror — the *same* walk and *same* `include` predicate on both sides — making the guard a set **equality** over entry paths, failing with the whole list and the remedy ("delete it, or add it to the dataset, then regenerate"). Single-file mirrors are trivially exempt. **Detection is not deletion**: it reads two path lists and changes no `pair update` semantics. Both directory mirrors were set-equal when introduced, so it landed as a regression guard. `skill-md-mirror` keeps its own one-directional residual — its target hosts whole root-only skills (`agent-browser`), needing an exemption rule this corpus does not.
- **RESIDUAL CLOSED (2026-08-13) — the tool now removes the orphan it reports.** Tracked here across review rounds 4-10 of PR #421 (detection closed, deletion left to a human); closed in the same PR by [`2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md`](./2026-08-13-pair-update-deletes-what-the-mirror-no-longer-ships.md) — cleanup wired onto the CLI install path, bounded by the copy's ownership context, a WARN per deletion, the adopter-visible change on the v0.4 -> v0.5 migration page. The docs half settled first (review round 8; the four pages and the `quickstart-org.mdx` scoping fix are recorded there). [#426](https://github.com/foomakers/pair/issues/426) stays CLOSED as absorbed into #393 ("implementation extends the story, it does not file a card"), so its residual lived and is retired here. **Amended 2026-08-12 (review round 7), superseded 2026-08-13:** the `pair update`-level acceptance criterion had been restated at the content-ops level with the wiring lifted into an open-decision section on #393; it holds at the `pair update` level again, and that section records the decision taken.
- **A two-step trap, with a self-explaining failure.** `packages/knowledge-hub/dataset/.pair/knowledge/**` is in format scope; its root twin is not (same asymmetry as `dataset/.skills/**`). A `pnpm format` touching a KB dataset file needs `pair update` in the same commit, and the guard says so ("Regenerate with `pair update` — never hand-edit the mirror"). [DEVELOPMENT.md](../../../DEVELOPMENT.md) and its `development-setup.mdx` twin were widened from `.skills/**` to `dataset/**`, keeping that paragraph byte-identical between them as their own ADL requires.
- The transform is asserted **idempotent** over the real corpus, so regenerations cannot double-prefix — and the guard's own `transform(dataset)` expectation stays stable.
- #416 inherits a settled baseline: `.pair/llms.txt` on `main` is the generator's current output, byte for byte.
- **This record writes short skill names WITHOUT the leading slash.** `.pair/adoption/**` is a registry target the rewriter walks: a first draft spelled them slash-prefixed and the next `pair update` rewrote them to the prefixed form. Same convention as the `skills-guide.md` dataset's self-referential phrases (fenced blocks skipped; inline backticks not).
- No knowledge-base/dataset mirror — a decision about *this repo's* guards. The general rule is a candidate for framework guidance, a separate, framework-audience call not made here.

## Adoption Impact

- [DEVELOPMENT.md](../../../DEVELOPMENT.md) — Quality Gates: the two-step remedy covers the whole dataset and names the comparison target ("equals the OUTPUT of the real `pair update` transform — never the dataset source itself").
- `apps/website/content/docs/contributing/development-setup.mdx` — the published twin, kept in sync.
- No `tech/` adoption file changes: this constrains how guards are written, not what the project adopts.
