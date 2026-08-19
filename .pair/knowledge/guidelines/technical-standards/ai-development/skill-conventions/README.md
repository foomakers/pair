# Skill Conventions — Shared KB References

Single-source explanations for patterns that recur across many `SKILL.md` files. Each skill keeps only its **delta** (the part genuinely specific to it) and points here for the generic mechanics — so a convention is edited in one place, not re-derived per skill.

| Convention | File | Restated in (before this pass) |
| --- | --- | --- |
| Resolution cascade (Argument > Adoption > Assessment) | [resolution-cascade.md](resolution-cascade.md) | 10 skills |
| Idempotency | [idempotency.md](idempotency.md) | 28 skills |
| Graceful degradation | [graceful-degradation.md](graceful-degradation.md) | 34 skills |
| Way-of-working / PM-tool **+ code-host** resolution (incl. the PM↔code-host routing table and the `Refs:` cross-linking convention) | [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md) | 18 skills |
| Template resolution (adoption override > KB default, file-existence check) | [template-resolution.md](template-resolution.md) | all template-linking skills |
| `/pair-capability-record-decision` invocation contract | [record-decision-contract.md](record-decision-contract.md) | 19 skills |
| Output Format shapes (Decision / Report) | [output-shapes.md](output-shapes.md) | 10 skills (documentation-only — no logic change) |
| To-issues triage (extend vs create) | [to-issues-triage.md](to-issues-triage.md) | 2 composing skills (new convention — no prior duplication to extract) |
| Guided / Quick setup duality (guided asks; quick accepts defaults) | [guided-quick-setup.md](guided-quick-setup.md) | 2 precedents (`pair package` `--interactive`; the `assess-*` cascade) — documented, not retrofitted |
| Story-local (AC<n>) marker ban (rule, rationale, legitimate shapes) | [story-local-markers.md](story-local-markers.md) | 22 files across skills + KB (purged when the corpus-wide guard landed) |
| Nested sub-documents / progressive disclosure (`references/` inside a skill dir) | [nested-sub-documents.md](nested-sub-documents.md) | 0 skills (authoring convention — describes the installed layout, not a skill step) |
| Adoption-informed generation (decision log + ADR + context map read before drafting) | [adoption-informed-generation.md](adoption-informed-generation.md) | 3 generating skills (new convention — the reading step is defined here, never per skill) |

## Skill `version:` frontmatter — when to bump

Every `SKILL.md` carries a `version:`. It is **semver over the skill's contract**, not over its prose, and the rule is:

| Change                                                                                              | Bump    |
| --------------------------------------------------------------------------------------------------- | ------- |
| New/removed/renamed argument, algorithm step or phase; changed routing, HALT set, or output shape     | **minor** |
| Behavior-preserving correction — wording, a stale link label, a typo'd snippet, a pointer added       | **patch** |
| **Side marker only** — naming which tool an operation already talked to (e.g. "this PR read is a code-host read"), where nothing about the step changes | **patch** |
| **Parametrising a hardcoded value from adoption** — e.g. `git checkout main` → `git checkout <base-branch>`: the literal is replaced by a value the project declares, so the step's *resolved behavior* changes for any adoption whose value isn't the old literal | **minor** |
| Breaking contract change for composers (an argument's meaning changes, a composed skill becomes required) | **major** |
| Nothing about the skill itself (only a guideline it points at moved)                                  | none    |

Two consequences worth stating, because both have been asked in review: a **pure-pointer edit is a patch, not "no bump"** (a reader can tell which copy they have), and a **new algorithm step is always at least a minor** even when the step is optional. The side-marker row is where the two meet: *documenting* which side an operation already talked to — including the pointer to how that side resolves — is a patch, while **moving** an operation to the other side, or changing what it writes there, is a routing change ⇒ minor. **Parametrisation sits on the minor side of that line**: swapping a literal for an adoption-resolved value looks like a snippet fix, but a project that declared a different value now gets different behavior from the same step — which is exactly what a minor bump signals. Sub-docs of a skill (`references/*`, disclosed detail files) have no frontmatter of their own — a change there bumps the owning `SKILL.md`.

## How a skill uses these files

A skill's own section keeps its heading (e.g. `### Step 1: Resolution Cascade`, `## Graceful Degradation`) and states its **delta only**, then points here for the generic mechanics, e.g.:

> See [resolution cascade](resolution-cascade.md) for the generic Path A/B/C mechanics. **This skill's Path B**: ...

This is a context pointer, not a citation: the executor is expected to follow it when it reaches that step, the same way it already follows pointers to guideline files elsewhere in the algorithm. If a pointer ever proves unreliable for must-have material, sharpen its wording first — inline the content again only if sharpening fails.

## Scope note

These files are **generic and portable** — like the rest of `.pair/knowledge/`, they describe how *this skill corpus* works, not any one project's history. They may name skills, arguments, and adoption-file conventions; they never cite this repo's own ADRs, decision-log entries, or issue numbers as authority for the convention itself.
