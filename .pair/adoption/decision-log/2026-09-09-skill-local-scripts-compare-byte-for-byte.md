# Decision: A skill-local script's mirror is compared byte-for-byte, because the pipeline's content rewrites are markdown-gated

## Date

2026-09-09

## Status

Active

## Category

Convention Adoption

## Context

Story #482 adds a conformance check that every dataset skill-local script (`dataset/.skills/<category>/<name>/scripts/*`) has an identical installed twin under `.claude/skills/pair-<category>-<name>/scripts/*`. It compares the two files' raw bytes.

That looks like a direct contradiction of ADL [2026-08-11-a-mirror-guard-compares-the-transform.md](./2026-08-11-a-mirror-guard-compares-the-transform.md), whose rule is: **a mirror guard compares the OUTPUT of the transform, never the source.** That ADL was written after a guard asserted byte-identity between an installed template and its dataset source, and thereby froze a defect into an invariant — the installed file was supposed to be rewritten by the pipeline, and the guard defended the un-rewritten copy.

The distinction that ADL already draws is the one that applies here: it measured 441 markdown files of which the transform changes 42, and states explicitly that for the other 399 `transform(x) === x`, so byte-identity with the source is *correct* there. The rule forbids byte-identity with a source the transform **would** have changed — not byte-identity as such.

So the question is empirical and about the producer, not about this check: **does `pair update` rewrite the content of a non-markdown file?** It must be answered at the pipeline, since a unit test of the new checker cannot establish it.

Verified on this branch, at the real producer, `packages/content-ops`:

- `applySkillReferenceRewrites` (`src/ops/copy/copy-directory-transforms.ts`) collects its target set behind `if (f.endsWith('.md')) allMdFiles.push(f)` — the `/command` token rewrite reaches markdown only.
- The link-path rewrite runs through `walkMarkdownFiles` (`src/markdown/link-processor.ts`) — markdown only by construction.
- `skill-md-mirror.ts` states the same boundary from the consuming side, calling non-markdown assets an ACCEPTED RESIDUAL: "real content whose equality is NOT guarded", precisely because only markdown goes through the content rewrites.

For a `.mjs` file the pipeline therefore applies the identity transform: the file's *path* is transformed (the flatten/prefix that maps `workflow/red-seal` to `pair-workflow-red-seal`), its *bytes* are not.

## Decision

**Compare skill-local scripts byte-for-byte against the dataset source, and derive the installed PATH through the registry's transform.** This satisfies the 2026-08-11 rule rather than excepting it: the comparison is still `installed === transform(source)`, and for non-markdown files `transform` is the identity on content.

The path half is where the transform is real, so it is not hand-rolled twice: `installedSkillDirName` is pinned by test to `skill-md-mirror.ts`'s `installedSkillDir` — which composes the actual `transformPath` with the registry's `SKILL_COPY_OPTS` — for every skill dir in the live corpus.

**The rule's validity is conditional, and the condition is named**: if the pipeline ever gains a content rewrite for non-markdown files (a token rewrite in `.mjs`, an `.sh` shebang fixup), byte-equality becomes exactly the defect the 2026-08-11 ADL describes, and this check must move to comparing against the regenerated output — the in-memory pipeline clone `skill-md-mirror.ts` already runs for markdown.

## Alternatives Considered

- **Run the real copy pipeline over an in-memory clone and compare against its output** (what `skill-md-mirror.ts` does for markdown): unconditionally correct and immune to the pipeline change above. Not chosen for this check because `skills:conformance` is a standalone gate run via `ts-node` **before any build** — importing `@pair/content-ops` would make it depend on that package's `dist`, which is exactly why `ENTRY_DEPTH` is already pinned-by-test rather than imported. The test-level pin buys most of the protection at none of the runtime cost.
- **Extend the existing markdown mirror guard to non-markdown files**: rejected as a wider change than the story, and it would still leave the "does a script the SKILL.md links actually ship?" half unanswered — that half is not a mirror question at all.
- **Leave scripts unguarded (keep the ACCEPTED RESIDUAL as-is)**: rejected. The residual was accepted when the only non-markdown assets were a third-party skill's templates. Skill-local scripts are now executable instructions a skill runs (`red-snapshot.mjs`, `ensure-contract.mjs`), so a one-byte divergence is a wrong result at run time, not a cosmetic diff.

## Consequences

- `pnpm skills:conformance` gains a failure class naming both paths and distinguishing `missing` from `drifted`. Verified at the real CLI: drifting an installed script exits 1 as `drifted`, removing one exits 1 as `missing`, and the restored corpus PASSes.
- The residual documented in `skill-md-mirror.ts` narrows: non-markdown assets under a skill's own `scripts/` are now guarded; non-markdown assets elsewhere remain unguarded.
- A checkout with no `.claude/skills` (dataset-only) reports one informational note and does not fail — the twin check needs both trees.
- If the pipeline gains non-markdown content rewrites, this check must be migrated per the condition named above.

## Adoption Impact

None. This records why an existing convention (2026-08-11) is satisfied rather than excepted; it changes no adopted process, tool, or library. The gate command list in `adoption/tech/way-of-working.md` already names `skills:conformance` as a root gate step, and that entry is unchanged — the check gained a rule, not a command.
