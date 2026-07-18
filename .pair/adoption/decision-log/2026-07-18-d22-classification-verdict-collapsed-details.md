# Decision: Classification/verdict output is a tag + 1-line summary with details collapsed, never a table dumped inline (D22)

## Date

2026-07-18

## Status

Active

## Category

Convention Adoption

## Context

"D22" is cited 5+ times across the skill corpus (`pair-process-review/SKILL.md`'s Composed Skills table and Security Review step, `pair-capability-assess-security/SKILL.md`'s frontmatter and Step 2, and epic #208's own body AC5/"Related Documentation") as an established decision governing how classification/assessment output is surfaced — but no ADR/ADL/decision-log record for it existed anywhere under `.pair/adoption/`, only prose inside epic #208's body (AC5: "Classification on card = tag + 1 line, no tables in body"; R6.6: "Review template extended: ... 1 line each + `<details>`"). Surfaced during story #227's review (assess-security composes this convention for its own review-mode output) — the PR description scoped a full code-review-template rewrite to sibling story #228, but #227 is the first story to actually implement the convention end-to-end (assess-security's 1-line + collapsed-findings output), so it should not ship citing an unrecorded decision.

## Decision

**Classification, assessment, and verdict output surfaces as a short tag/label plus a one-line summary; supporting detail (findings lists, rule breakdowns, tables) goes in a collapsed `<details>` block, never inline in the main body.** This applies to: the PM-tool card (epic #208 AC5 — tag + 1 line, no tables in the card body), and the PR review report's per-dimension sections (epic #208 R6.6 — 1 line + `<details>` for input validation, output, authn, authz, introduced vulnerabilities, cost, and — per story #227 — security).

Rationale: a reviewer or PM-tool viewer scanning many cards/PRs needs the verdict at a glance; full detail is one click away (collapsed), not competing for attention in the default view. This is a reporting/UX convention, not a structural or business-rule decision — hence ADL, not ADR/DDR.

## Alternatives Considered

- **Leave it as an unrecorded, epic-body-only convention**: rejected — 5+ skill-corpus citations of "D22" with no resolvable record is exactly the drift class this repo's own review process (and #227's own review) flags in other stories; a citable decision-log entry closes the gap cheaply.
- **Record it as part of sibling story #228 only**: rejected as the sole record — #228 (the code-review-template rewrite) is still in-flight and #227 already ships a real D22-citing implementation; recording now doesn't block #228 from extending or refining this ADL later (Step 2 of `record-decision` treats a matching topic as update-candidate, not a duplicate).

## Consequences

- `pair-capability-assess-security/SKILL.md` and `pair-process-review/SKILL.md`'s existing "D22" citations now resolve to a real record instead of only epic-body prose.
- Story #228 (code-review-template rewrite) should update this ADL rather than create a separate one when it lands, since it's the same decision applied to the rest of the review template's dimensions.

## Adoption Impact

No `adoption/tech/*` file update — this is a reporting/output-format convention scoped to the skill corpus and PM-tool card content, not a project-level tech/architecture/way-of-working fact.
