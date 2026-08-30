# Decision: Business impact gets an opt-in `trivial-diff` override — a docs-only or comment-only change resolves green whatever subdomain it lives in

## Date

2026-08-30

## Status

Active

## Category

Convention Adoption

## Context

Third entry in the risk-matrix calibration series (`2026-08-14-risk-matrix-overrides-close-the-zero-green-gap`, `2026-08-14-tier-resolution-downgrades-artifact-yellows-not-observed-ones`). Those two removed the artificial floor on **Service/domain criticality** (a Criticality Table listing every deployable `Low`) and on **overall tier resolution** (yellows that are artifacts of coarse defaults no longer force a yellow tier). Neither reaches the one dimension that still floors trivial work: **Business impact**, which quality-model §3.1 resolves from the subdomain class alone — `generic` → green, `supporting` → yellow, `core` → red.

That rule reads **where** a change lands, never **what** it does. On a docs-as-product repository almost every path maps to a Supporting or Core subdomain, so fixing a typo in a guideline inherits that subdomain's yellow/red floor — the same class of artifact the two earlier entries removed elsewhere, on the dimension they could not touch. The rejected alternative in the first ADL was "change the KB default itself"; what it was missing is that the KB is also allowed to grow a *schema* the adoption delta can then declare — the gap was never that a project-specific delta is wrong, it was that no key existed to express this one.

## Decision

1. **KB (`quality-model.md`) gains a documented, opt-in `## Overrides` key: `business-impact.trivial-diff: green`.** Declared, the Business impact dimension resolves `green` for an objectively trivial change regardless of subdomain. **Undeclared — the KB default — nothing changes for any project** (D21): the dimension resolves from the subdomain class exactly as before. Making trivial-diff-green the KB default was explicitly rejected.
2. **"Trivial" is defined mechanically, checkable from `git diff`**: either every changed file is **non-executable** `.md`/`.mdx` (guarded markdown mirrors included), or every changed hunk in every changed file is comment-only, whitespace-only or formatter-output-only — no changed line altering an executable or declarative statement. **Executable markdown — an agent skill/workflow file, an asset script embedded in markdown — is out of the first branch on purpose**: in pair a `SKILL.md` *is* the procedure, so the second branch decides for it and a hunk altering an instruction is not trivial. Renames, string-literal changes, dependency/version changes, config/data value changes, test-expectation changes and regenerated build artifacts are explicitly **not** trivial, however cosmetic they look: behaviour preservation under a rename is a judgment, not a diff-visible fact.
3. **All-or-nothing per item, raises only.** One non-trivial file or hunk disables the override for the whole story/PR (tier is per item, not per file — §3.2). The key may only move Business impact from yellow/red to green; it touches no other dimension, and the tier stays `max()`, so another dimension's red still decides. At review it obeys confirm-or-raise (D17); at refinement it applies only to an unambiguously trivial declared scope, and an unverifiable diff (binary/truncated) fails safe to the subdomain rule.
4. **`green` is the only accepted value** — the value being the **first token after the colon**, so the inline rationale every `## Overrides` key here is written with does not make the key malformed; anything else, or a malformed key, warns and is treated as absent (§6's malformed rule, D21) — never a HALT.
5. **No skill criterion.** The rule lives entirely in `quality-model.md`; `/pair-capability-classify` already applies `## Overrides` qualitatively through the Argument > Adoption > KB-default cascade, so it gains **no triviality threshold** of its own (D18) — asserted by a conformance test that greps the skill for the triviality vocabulary. Its matrix-output template *does* name the override **key** as a Business-impact `Source` alternative (`[subdomain class | Overrides: business-impact.trivial-diff]`), exactly as every sibling row names its own source, so a greened `core`-subdomain diff records what greened it. Naming a key the model defines is not owning the criterion.
6. **This repo declares the key** in `.pair/adoption/tech/risk-matrix.md`, with the rationale above.

## Alternatives Considered

- **Make trivial-diff-green the KB default for every project**: rejected — the subdomain-class rule is a reasonable baseline for a project that hasn't stated otherwise, and silently re-tiering every adopter's docs work is exactly the blast radius D21 keeps out of the KB. A project-specific delta belongs in adoption; what the KB owes it is a documented key.
- **Declare the override locally without adding it to the KB schema**: rejected — an undocumented key is not resolvable by `classify` (it applies the *documented* `## Overrides` schema), so the declaration would be inert prose. This is the half the earlier ADL's rejected alternative was missing.
- **Per-file granularity (green the trivial files, tier the rest)**: rejected — tier is a property of the story/PR (§3.2); there is no per-file tier to fall back to, and inventing one would fork the model on this one dimension.
- **A subjective definition ("changes nothing important")**: rejected — "how important is this prose" is precisely the judgment the mechanical definition exists to avoid. Accepted consequence: on this repo a *normative* KB **guideline prose** change is `.md`-only and therefore trivial by this definition. It is deliberately tolerated because the other dimensions still fire — a shared-rule edit reads yellow on Change/diff risk — and `max()` keeps it off green. **Executable markdown is not left to that safety net**: a skill/workflow edit is carved out of branch (a) mechanically, because the Change/diff-risk yellow is a judgement (and this repo's own `change-risk.dataset-mirror-pairs` override collapses a skill plus its guarded mirror to one module), so it cannot be relied on to hold a review-gate rewrite off `risk:green` — the tag that also gates unattended auto-advance.
- **Extend `tier-resolution.default-artifact-downgrade` to cover it instead**: rejected — that override acts on tier resolution over already-resolved dimensions and cannot distinguish a trivial diff from a substantive one; it would have to encode triviality anyway, in the wrong place.

## Consequences

- A docs-only or comment-only PR on this repo now resolves Business impact `green` instead of inheriting the touched subdomain's yellow/red, and reaches `risk:green` when no other dimension is yellow — the intended dogfooding signal.
- A project that has not declared the key sees **no** behavioural change whatsoever; the KB default is byte-identical to before.
- The `## Overrides` schema now carries a second family of keys (`business-impact.*` alongside `change-risk.*`), documented with its own §6 subsection, walkthrough rows and hand-traced worked examples — the artefacts a rule applied by an LLM is validated against, since there is no parser to unit-test.
- A future contributor cannot quietly promote the override to a KB default: conformance tests pin both the opt-in wording and the untouched `generic`/`supporting`/`core` mapping.

## Adoption Impact

- `.pair/adoption/tech/risk-matrix.md`: `## Overrides` gains `business-impact.trivial-diff: green` with its rationale (third key in the section).
- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md` (and its `.pair/knowledge/**` mirror): §3.1 Business impact row + a §6 subsection defining the key, four walkthrough rows and three worked examples. This is a KB-schema addition, not a KB default change.
- `packages/knowledge-hub/dataset/.pair/knowledge/assets/risk-matrix-example.md` (and its mirror): the key shown in the example `## Overrides` section, the documented adoption starting point.
- `packages/knowledge-hub/src/conformance/quality-model.test.ts`: assertions for the opt-in default, the definition, all-or-nothing, never-lowers, the walkthrough rows, the worked examples, this repo's declaration, and the D18 grep on `classify`.
- `packages/knowledge-hub/dataset/.skills/capability/classify/SKILL.md` (and its `.claude/skills/pair-capability-classify/SKILL.md` mirror): **one cell** — the matrix template's Business-impact `Source` gains the `Overrides: business-impact.trivial-diff` alternative. No criterion, no threshold; the D18 grep guard is asserted on the same file.
