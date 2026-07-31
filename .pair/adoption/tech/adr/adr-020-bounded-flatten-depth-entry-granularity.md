# ADR-020: Bounded flatten depth — a registry's entry granularity, opt-in per registry

## Status

Accepted — **amends [ADR-005](adr-005-skills-infrastructure.md)** §Key Design Choices #2 (Naming transforms) and its "Flatten/prefix" rationale bullet. ADR-005 otherwise stands; only the flatten *semantics for the `skills` registry* change here.

> Numbering note: `adr-018` is claimed by two open branches (#234, #236); `019` is left free for whichever of them renumbers.

## Date

2026-07-30

## Context

- ADR-005 introduced `flatten` as "replace every directory separator with a hyphen", because "AI tools expect skills in flat directory structures". At the time every source path was exactly `<category>/<name>`, so *every separator* and *the entry boundary* were the same thing. #238 later generalized flatten/prefix across asset registries and likewise never considered a path deeper than the entry.
- Story #407 is the case where the two stop coinciding. A skill using the standard Agent-Skills progressive-disclosure layout ships `process/review/references/deep.md`. Unbounded flatten installs that as `pair-process-review-references/deep.md` — a **sibling pseudo-skill directory**, outside the skill it belongs to, with the skill's own `./references/deep.md` pointing at nothing and the sub-doc's `../SKILL.md` re-rooted back into the dataset layout. The layout is not hypothetical: the third-party `agent-browser` skill already ships `references/*.md`, and #313's direction is progressive disclosure for the pair corpus.
- The transform is **shared by every asset registry** (`knowledge`, `adoption`, `github`, `agents`, `skills`). A registry whose entries are single-segment is served correctly by full flattening, so redefining flatten globally would silently change behaviour for registries that have no defect.
- Constraint from CLAUDE.md / `/pair-process-review` Step 2.3: a technical decision must be recorded, not left in a PR body. Story #407 explicitly flags this question as ADR-worthy.

## Options Considered

### Option 1: Redefine `flatten` registry-wide as depth-1

- **Description**: flatten only the first separator everywhere; every registry preserves deeper structure.
- **Pros**: no new option; one semantic for the whole pipeline.
- **Cons**: wrong answer for the `skills` registry, whose entry is TWO segments (`process/review`) — depth-1 would install `pair-process/review/`, not `pair-process-review/`. Also a silent behaviour change for every other registry, with no defect to justify it.

### Option 2: `preserveNested: true` (boolean — "flatten the entry, keep the rest")

- **Description**: a boolean meaning "stop flattening below the entry", with the entry inferred.
- **Pros**: no layout number in the caller; reads declaratively.
- **Cons**: the boolean is not self-contained — it still has to *infer* where the entry ends, so it is Option 3 in disguise plus a flag. And "the entry" is exactly what a generic path transform cannot know.

### Option 3: "the directory containing `SKILL.md` is the entry"

- **Description**: detect the entry structurally, from the presence of a marker file.
- **Pros**: semantically the sharpest — it is literally what "a skill" means, and it survives a category level being added or removed.
- **Cons**: leaks **skills-domain knowledge into a generic content transform** shared by four non-skill registries (`naming-transforms.ts` would have to know what `SKILL.md` is). It also makes the installed path depend on file *content discovery* rather than on declared configuration, so the same source tree can install differently depending on which files happen to be present — harder to validate ahead of a copy, and it would have to be re-derived in the mirror guards that reproduce the transform.

### Option 4 (chosen): `flattenDepth: <positive integer>`, opt-in per registry

- **Description**: an explicit numeric depth on the registry config. The first `flattenDepth` segments are joined with hyphens; anything deeper is preserved as a real sub-path. Absent ⇒ unchanged, unbounded flatten.
- **Pros**: the generic transform stays generic (pure path math, no marker-file knowledge); the layout fact lives in the config that already declares that layout (`source`, `prefix`, `targets`); opt-in means no other registry changes behaviour; trivially validatable before any file is copied.
- **Cons**: it encodes a **registry-layout fact as a number in the caller** — if a category level is ever added to or removed from `.skills/`, `flattenDepth` must be updated in step or the transform mis-flattens. It also assumes every entry sits at the SAME depth, and `.skills/` already breaks that (`next/` is one segment, the other 39 are two), so a sub-directory under a registry-root skill is excluded by a loud failure — see Trade-offs. Mitigated by (a) validating it as a positive integer at the CLI boundary and throwing in `flattenPath` on an invalid value, so a typo fails loudly instead of degrading back into the defect, and (b) pinning the value in `SKILL_COPY_OPTS` against `config.json` with a test, so guard and pipeline cannot drift apart.

## Decision

**Adopt `flattenDepth` (Option 4): a positive-integer depth, declared per registry, bounding `flatten` to that registry's entry granularity. `skills` declares `flattenDepth: 2`. Every other registry omits it and keeps the pre-existing unbounded behaviour.**

Option 3 is the semantically better model and was rejected on **coupling**, not on correctness: the flatten transform serves four registries that have no notion of `SKILL.md`, and paying for entry detection there means every consumer of the transform (including the two mirror guards that reproduce it) inherits skills-domain knowledge. A declared number keeps the knowledge where the layout is already declared. Option 1 was rejected as wrong for the very registry that has the defect; Option 2 collapses into Option 3.

The **opt-in default** (absent ⇒ unbounded) is deliberate: it makes this a scoped fix rather than a pipeline-wide semantic change, and it is pinned by a regression-witness test asserting the unbounded result so the old behaviour cannot drift unnoticed.

Corollary, recorded because it is not obvious: once flatten is bounded, a sub-directory below the entry appears in the copy's directory mapping alongside real entries. It is **content, not an entry** — so the skill-name map, the skill link-path map, and the frontmatter `name:` sync all skip it (`isRegistryEntryPath`). Without that, `references` gets registered as a *skill name* mapped to one arbitrary skill's sub-directory, and the `/references` token in an unrelated skill's body is rewritten to it.

## Consequences

### Benefits

- A skill may ship a nested `references/` (or any sub-dir) and it installs **inside** the skill, with both link directions intact — the standard progressive-disclosure layout becomes usable in the pair corpus.
- Non-skill registries are byte-for-byte unaffected; the change is provably scoped by the absence of the option.
- An invalid depth fails loudly at config validation (`pair update`/`install`/`package`) and in `flattenPath` itself, instead of silently reverting to the defect.
- A bounded flatten cannot produce a traversal-unsafe result: a `.`/`..` segment that would survive into the result is rejected rather than joined onto the destination root. Applied by SHAPE, not by branch — the unbounded form's "safe by construction" argument (every separator becomes a hyphen) does not cover a single-segment path, which has no separator, so that case is rejected in both forms. The invariant is that each form is checked exactly where its own output could carry a live `.`/`..`, so neither form is less safe than the other; they are deliberately NOT equally strict, since a preserved tail is live where a hyphenated segment is inert.

### Trade-offs and Limitations

- **The number is a duplicated fact.** `.skills/` layout depth is asserted in `apps/pair-cli/config.json` and mirrored in `SKILL_COPY_OPTS`. A pin test ties the two together, but a `.skills/` reorganization must still update the number deliberately.
- **Two flatten semantics coexist** in one codebase (bounded for `skills`, unbounded elsewhere). Accepted as the price of not changing registries that have no defect; the regression-witness test documents the unbounded branch as intentional, not vestigial.
- Collision detection (`detectCollisions`) now compares sub-paths, not only top-level names. No behaviour change for the current corpus (no dataset skill dir is deeper than two segments) but a future nested-name clash surfaces as a sub-path collision message.
- **Every entry must sit at the declared depth; both deviations abort the copy.** The depth assumes a uniform layout, and `.skills/` already bends it: `next/` is a ONE-segment entry (installed as `pair-next`) beside 39 two-segment ones. The enforced rules, stated as the code enforces them (not only for the case that motivated them):
  - **Too shallow** — *any* directory shallower than `flattenDepth` that holds files directly AND owns a sub-directory. That is broader than "a registry-root skill cannot ship a sub-directory": it equally rejects a **category directory with a file of its own** (a `process/README.md` beside `process/review/`), because entry-vs-category is decided by "holds files directly" — the price of keeping marker-file knowledge (`SKILL.md`) out of a transform four non-skill registries share. The shape is genuinely unrepresentable either way: `next/references` has the same shape as the entry `process/review` and would install as the sibling `pair-next-references/` — the whole defect back. Consequence for authors: giving `next` a sub-directory requires moving it under a category first, which **renames the installed skill users invoke**; a category-level file must move into a skill directory instead.
  - **Too deep** — a directory deeper than `flattenDepth` holding files whose nearest ancestor at the entry depth holds none, i.e. an entry too deep with nothing owning it as content. It would install under a directory with no entrypoint at its root, invisible to the skill loader.
- Both deviations are stated in `nested-sub-documents.md` as the convention's two exclusions, with the way out per shape. The too-deep case is guarded twice: at copy time (above) for a directory nothing owns, and statically over the dataset corpus by the skills conformance gate (`skills:conformance` fails on any `SKILL.md` below the entry depth) — because a `SKILL.md` inside a real skill's `references/` IS legitimately-shaped content for the copy-time guard, and would install silently non-invocable.
- Mirror cleanup descends one level per preserved sub-path under a bounded flatten (it was top-level-only, which a sub-path move made insufficient — a `references/` removed from the source would have stayed installed). Unbounded mirrors keep the exact previous top-level-only behaviour, gated on the option's presence. **ACCEPTED RESIDUAL:** the descent is reachable only under `behavior: 'mirror'`, and the only registry declaring `flattenDepth` today (`skills`) declares `behavior: 'overwrite'`, so on the live `pair update` path a `references/` deleted from the dataset stays installed — consistent with the pre-existing `overwrite` semantics for a whole skill directory, which never deleted either. The descent is kept as forward-compatibility for a `skills` flip to `mirror` (and for any other registry adopting `flattenDepth`), is covered by unit tests, and is NOT claimed as a live fix.

## Adoption Impact

- **`.pair/adoption/tech/adr/adr-005-skills-infrastructure.md`** — amended: Key Design Choice #2 and the "Flatten/prefix" rationale bullet now point here for the bounded form; `config.json`'s registry entry gains `flattenDepth: 2`.
- **`.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/nested-sub-documents.md`** (new, plus its index row in that directory's `README.md`, and the `packages/knowledge-hub/dataset/` source of both) — the authoring convention this enables: a skill may ship a nested `references/` sub-dir, it installs inside the skill, and relative links work in both directions. Written generic/portable per that directory's Scope note, so it does not cite this ADR back.
- No change to `architecture.md`, `tech-stack.md`, or `infrastructure.md` — this is a transform semantic, not a stack or boundary decision.

## References

- Story: #407 · PR: #411
- Amends: ADR-005 (#98, PR #106) · introduced-by context: #238 (flatten/prefix across registries)
- Implementation: `packages/content-ops/src/ops/naming-transforms.ts` (`flattenPath`, `isRegistryEntryPath`), `apps/pair-cli/src/registry/{resolver,validation,operations}.ts`, `apps/pair-cli/config.json`, `packages/knowledge-hub/src/tools/skill-md-mirror.ts`
