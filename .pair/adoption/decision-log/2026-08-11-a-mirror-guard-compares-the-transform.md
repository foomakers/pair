# Decision: A mirror guard compares the OUTPUT of the transform, never the source

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

This repo ships two copies of most of its content: a canonical **dataset** under `packages/knowledge-hub/dataset/**`, and an installed **mirror** at the repo root (`.pair/knowledge/**`, `.claude/skills/**`, `AGENTS.md`/`CLAUDE.md`). The root copy is *generated*: `pair update` copies the dataset and then rewrites, in every markdown file it lands, the `/command` skill references (the short `assess-security` becomes `/pair-capability-assess-security`) and the `.skills/**` SKILL.md link paths. **The mirror is not a copy of the source; it is a copy of the source's transform.**

Parity guards exist because the two copies have drifted repeatedly (seven incidents on record, three of them from a hand-port instead of a regeneration). One of those guards got the comparison wrong. `packages/knowledge-hub/src/conformance/code-review-verdict-first.test.ts` (#228) asserted:

```ts
it('is byte-identical between root and dataset (identical-mirror invariant)', () => {
  expect(TEMPLATE_MIRROR).toBe(TEMPLATE_DATASET)
})
```

with the justification *"The PR declares the two files an identical mirror — enforce that fully with byte-equality"*.

That assertion is only satisfiable while the mirror is **untransformed**, so it did not protect the file — it froze a defect into an invariant, and the consequences compounded:

- Measured across the whole KB corpus on 2026-08-11: **441 markdown files; the transform changes 42 of them**. The other 399 carry no skill reference and no `.skills/**` link, so `transform(x) === x` there and byte-identity with the dataset source is *correct* — the rule below does **not** say a mirror must differ from its source. What is wrong is a mirror byte-identical to a source the transform *would* have changed, and `guidelines/collaboration/templates/code-review-template.md` was the **only** file in the corpus in that state. The guard was pinning the single anomaly and calling it the rule.
- The installed template therefore documented the slash-prefixed **short** names (`assess-security`, `assess-cost`, `assess-coupling`, `classify`) — **commands that do not exist in the reader's assistant** (`/pair-capability-assess-security` does). The guard was actively defending a KB that tells its reader to type a command they do not have.
- Every `pair update` run rewrote the file correctly and turned the guard red; restoring byte-identity turned it green again (reproduced twice on `e7ea4e1a`). So the project's own remedy for mirror drift broke a guard on its way through, and the two were deadlocked until a human broke the tie.

The correct pattern already existed in-tree, one directory away: `packages/knowledge-hub/src/tools/skill-md-mirror.ts` asserts byte-equality against the **regenerated** copy — it runs the real copy pipeline over an in-memory clone of the dataset and compares the mirror to *that*. Same for `skills-guide-mirror.test.ts`. Only the #228 guard compared against the raw source.

A related question was open on the same corpus: the two generated **root** files with no dataset source of their own — `CLAUDE.md` (generated from `AGENTS.md` with the `claude` transform) and `.pair/llms.txt` (written by `writeProjectLlmsTxt` on every install/update) — were reported as producing a trailing-newline diff on every update run. With nothing to compare byte-wise, "is this drift?" had no answer, and story **#416** wants to build a guard on top of `.pair/llms.txt`.

## Decision

**A mirror guard asserts `mirror === transform(dataset)`. Never `mirror === dataset`.**

A guard asserting `mirror === dataset` is asserting *that no transform exists*. When one does, the guard does not enforce the mirror — it forbids the mirror from being correct, and the first person to run the generator hits a red test with no way to satisfy both.

Three corollaries, each enforced by code in this repo rather than by this document:

1. **The transform is the production one, not a re-implementation.** `kb-mirror.ts`'s `buildKbMirrorTransform` composes the real content-ops `rewriteSkillReferences` + `rewriteSkillLinkPaths` — the exact pair the CLI applies to non-skills registries (`applySkillRefsToNonSkillRegistries`) — so a bug in the pipeline **fails** the guard instead of being reproduced by a parallel copy of the logic and thereby masked. This is the same principle `skill-md-mirror.ts` already applies by running the real copy pipeline in memory.

2. **The failure message states what it compares.** `assertKbMirrorMatches` fails with `COMPARED: the root mirror vs. TRANSFORM(dataset source) — NOT vs. the raw dataset source …`, plus the reason byte-equality with the source is itself the drift. The wrong invariant was originally *derived by a reader* from a guard that did not say what it compared; a message that spells it out is what stops the next reader re-deriving it.

3. **A generated file with no dataset source is compared against its generator** — the same rule stated for the degenerate case where `dataset` is empty and `transform` is the whole generator. That is what #416 will formalize for `.pair/llms.txt`.

The guard's scope is the **class**, not the instance: `kb-mirror.test.ts` asserts `mirror === transform(dataset)` for **every** file the KB dataset contributes (derived from disk at collection time — no list, no count), plus an explicit "no mirror is frozen untransformed" sweep whose failure names the whole offending set. A file the transform legitimately leaves untouched (the 399 with no skill references) still passes: `transform(dataset) === dataset` there, so the rule does not require every mirror to differ.

**Non-markdown KB files are guarded too, by the same helper.** The `knowledge` registry also ships `assets/*.sh` (two of them executable gate scripts) and `assets/gitleaks-example.toml`. The install-time rewrites walk `.md` only, so for those the transform is the identity *by construction* and the assertion is plain byte-equality — stated as such in the failure message, because "byte-identity is itself the drift" is true for markdown and false here. Their pipeline invariance is pinned rather than assumed: the guard asserts the registry declares no `flatten`/`prefix` and no per-target transform, which is also what makes the skill-ref + link-path pair the *complete* transform for this registry (`applySkillRefsToNonSkillRegistries` skips any registry with flatten/prefix).

**The mirror is regenerated by running the pipeline, never by hand-editing the output** — `pair update --source ./packages/knowledge-hub/dataset --offline` in this repo. Hand-porting is how three of the seven recorded drift incidents happened; it is also how this one would have reproduced, since a hand-edit gets the skill names right and the surrounding formatting wrong.

**On the two generated root files: the diff is settled as eliminated, not tolerated.** Verified 2026-08-11 on `e8e5e986`: a full `pair update` from the local dataset produces **no diff** on `CLAUDE.md` and none on `.pair/llms.txt`. The `CLAUDE.md` half was fixed in #412 (`e7ea4e1a`) — the generator left a trailing blank line that `collapseBlankLines` could not see, because two newlines are not three or more. The `.pair/llms.txt` half was never a generator bug: the file **is** genuinely regenerated on every run (proved by injecting a `DRIFT-PROBE` line and watching the next `pair update` remove it — a check worth repeating, because "no diff" is also what a file that is never written would show), and it reproduces byte-identically. So #416 can be built on the current bytes.

## Alternatives Considered

- **Copy the dataset file over the mirror** (the mechanical reading of the original story title). Rejected, and verified as wrong on 2026-08-05: copying *destroys* the skill-name rewrite — it reinstates the short `refine-story` where the reader's assistant only knows `/pair-process-refine-story`. It reproduces the exact defect being fixed, one commit later.
- **Keep the byte-equality and make the reference rewriter skip files under an "identical-mirror invariant"** (the other branch the #393 evidence comment offered). Rejected: it makes the KB's correctness depend on an opt-out list, and every file on that list ships commands the reader cannot type. The invariant is what is wrong; exempting files from the transform to preserve it inverts cause and effect.
- **Relax #228 to "identical modulo the skill-reference transform" with a bespoke regex.** Rejected: a second, parallel implementation of the rewrite is precisely what the mirror guards exist to avoid — it would agree with a buggy pipeline, or disagree with a correct one, and nothing would tell you which.
- **Drop the equality assertion, keep only the structural checks** (heading-count parity, seven assessment sections). Rejected: those prove structure, not content. The drift class this repo actually suffers is body text, and #228 introduced the assertion for exactly that reason. The protection is preserved here in full — only its comparison target changed.
- **Guard just `code-review-template.md`.** Rejected: the file was the one instance of a class, and the class ("a mirror byte-identical to a source the transform would change") is cheap to assert over the whole tree. Closing the instance leaves the next hand-port free.

## Consequences

- `packages/knowledge-hub/src/tools/kb-mirror.ts` is the tested production module holding the rule (per the [gate-tooling-in-tested-modules ADL](./2026-07-13-gate-tooling-code-in-tested-modules.md)); the #228 conformance guard and the whole-tree KB guard both call its `assertKbMirrorMatches`, so there is ONE definition of what a KB mirror is compared against and one failure format.
- The whole `.pair/knowledge/**` tree is now guarded — every markdown file against `transform(source)`, every non-markdown file against the source byte for byte — where previously only `skills-guide.md` was. Adding a KB file of either kind adds a case with no test edit.
- **ACCEPTED RESIDUAL — orphans, same shape as the skills mirror's.** The guard is directional (dataset → root), so a root-only KB file with no dataset source is not asserted. It is also not *cleaned*: the registry declares `behavior: "mirror"`, but `handleMirrorCleanup` compares only the immediate children of the target against the source, so a stale file nested under `how-to/` survives every `pair update`. Two such orphans were found and deleted here (`how-to/04-how-to-define-subdomains.md`, `how-to/05-how-to-define-bounded-contexts.md`, dropped from the dataset in #246 and superseded by ADR-012, still indexed by `.pair/llms.txt`). Closing the **class** means making mirror cleanup recursive for non-flatten registries — a change to `pair update`, not to a guard, hence its own story ([#426](https://github.com/foomakers/pair/issues/426)), not a bolt-on here.
- **A new two-step trap, with a self-explaining failure.** `packages/knowledge-hub/dataset/.pair/knowledge/**` is inside format scope; its root twin is not — the same asymmetry already documented for `dataset/.skills/**`. A `pnpm format` that touches a KB dataset file now needs `pair update` in the same commit, and the guard's message says so verbatim ("Regenerate with `pair update` — never hand-edit the mirror"). [DEVELOPMENT.md](../../../DEVELOPMENT.md) and its `development-setup.mdx` twin were widened from `.skills/**` to `dataset/**` in the same edit, keeping that paragraph byte-identical between the two files as their own ADL requires.
- The transform is asserted **idempotent** over the real corpus (re-running it on installed output is a no-op), so repeated regenerations cannot double-prefix a name. This matters more than it reads: the guard compares against `transform(dataset)`, so a non-idempotent transform would make the guard's own expectation unstable.
- #416 inherits a settled baseline: `.pair/llms.txt` on `main` is the generator's current output, byte for byte.
- **This record deliberately writes short skill names WITHOUT the leading slash.** `.pair/adoption/**` is a registry target, so the reference rewriter walks it: hit while writing this file — a first draft spelled the short names slash-prefixed and the next `pair update` rewrote them to the prefixed form, turning "commands that do not exist in the reader's assistant" into a sentence naming commands that do. Same convention the `skills-guide.md` dataset already uses for its self-referential phrases (fenced blocks are skipped by the rewriter; inline backticks are not). Any future document *about* the transform has to dodge its own subject.
- This ADL has no knowledge-base/dataset mirror — it records a decision about *this repo's* guards, like its siblings in `adoption/decision-log/`. The general rule ("a guard compares the output of the transform") is a candidate for framework guidance, but that is a separate, framework-audience call and is not made here.

## Adoption Impact

- [DEVELOPMENT.md](../../../DEVELOPMENT.md) — Quality Gates: the two-step remedy now covers the whole dataset, and names the comparison target ("equals the OUTPUT of the real `pair update` transform — never the dataset source itself").
- `apps/website/content/docs/contributing/development-setup.mdx` — the published twin of that paragraph, kept in sync.
- No `tech/` adoption file changes: this constrains how guards are written, not what the project adopts.
