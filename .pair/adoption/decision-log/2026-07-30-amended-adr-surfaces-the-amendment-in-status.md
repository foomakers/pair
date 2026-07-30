# Decision: An amended ADR surfaces the amendment in Status, not only inline in the body

## Date

2026-07-30

## Status

Active

## Category

Convention Adoption

## Context

PR #388 (story #281) amended **ADR-009** (`adr-009-assess-output-only`): its normative contract — "`assess-*` skills write nothing" — was narrowed 16 days after acceptance to "no **adoption** write", because three `assess-*` skills now write one operational report each under `.pair/working/reports/` (D14). The amendment was written inline in the Decision section, following the only in-tree precedent (ADL `2026-07-08-test-file-colocation-multi-module.md`, amended inline in its body).

Review round 4 raised the gap: with the amendment inline only, `## Status` still read plain `Accepted` and `## Date` still `2026-07-12`, so nothing above the fold told a reader that the contract they were about to rely on had changed. All 17 ADRs in `.pair/adoption/tech/adr/` read `Accepted`, and the ADR template's Status enum offered `Proposed | Accepted | Deprecated | Superseded by …` — no form for "still accepted, contract changed". `Superseded` is wrong here: the decision holds, only its edges moved.

## Decision

An ADR whose **normative contract** changes after acceptance is **amended, not superseded**, and the amendment is visible **above the fold**:

- `## Status` → `Accepted (amended YYYY-MM-DD — <what changed>)`.
- `## Date` → the original date, with `(amended YYYY-MM-DD)` beside it. The original acceptance date is never overwritten.
- The amendment itself stays **inline in the body**, in the section that carries the contract (the existing precedent) — Status is a signal, not the record.
- Any earlier text the amendment narrows (an option description the Decision adopts by name, a contract bullet) carries a pointer to it, so a reader following Decision → Option cannot pick up the pre-amendment contract from a section the amendment contradicts.

Applied to ADR-009 in this PR, and registered in the shared **ADR template** (`guidelines/collaboration/templates/adr-template.md`, dataset + root mirror) so it is the convention for every future ADR rather than a one-off. A change that *replaces* a decision keeps using `Superseded by …`; amendment covers changes that leave the decision standing.

## Alternatives Considered

- **Inline body amendment only (status quo)**: Rejected. The amendment is discoverable only by reading the whole ADR to the end; a reader who stops at Status/Date, or who follows Decision → the option it adopts, gets the superseded contract with no signal that anything moved. That was the round-4 finding.
- **Mark the ADR `Superseded by` a new ADR**: Rejected. A new ADR for a three-row exception table fragments one contract across two files and forces every citation of ADR-009 (docs site included) to be re-pointed; the decision itself was not replaced.
- **A `## Amendments` section instead of a Status marker**: Rejected as more structure for the same signal — it still sits below the fold, which is the actual problem, and it would need retrofitting into the template for a case that is rare.

## Consequences

- The ADR template's Status enum gains the amended form plus a one-paragraph rule; future ADR writers get the convention from the template they already resolve (override-first, per the template-resolution convention), with no new page to find.
- Amending an ADR is now a three-touch edit (Status, Date, inline amendment + pointers from any narrowed text). Deliberate: the cost falls on the writer once, not on every later reader.
- Existing ADRs are untouched — this applies going forward, and to ADR-009, which is the only currently amended one.
- `Superseded` keeps its meaning (decision replaced), so the two cases stay distinguishable at a glance instead of both hiding behind `Accepted`.

## Adoption Impact

- KB (dataset + root mirror): `guidelines/collaboration/templates/adr-template.md` — Status enum + amendment rule + optional amended date.
- Adoption: `.pair/adoption/tech/adr/adr-009-assess-output-only.md` — Status/Date markers applied; Option 2's description points at the amendment.
- No skill change: `/pair-capability-record-decision` already writes ADRs from this template (Status is one of the sections it fills).
