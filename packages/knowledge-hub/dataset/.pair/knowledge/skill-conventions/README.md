# Skill Conventions — Shared KB References

Single-source explanations for patterns that recur across many `SKILL.md` files. Each skill keeps only its **delta** (the part genuinely specific to it) and points here for the generic mechanics — so a convention is edited in one place, not re-derived per skill.

| Convention | File | Restated in (before this pass) |
| --- | --- | --- |
| Resolution cascade (Argument > Adoption > Assessment) | [resolution-cascade.md](resolution-cascade.md) | 10 skills |
| Idempotency | [idempotency.md](idempotency.md) | 28 skills |
| Graceful degradation | [graceful-degradation.md](graceful-degradation.md) | 34 skills |
| Way-of-working / PM-tool resolution | [way-of-working-pm-resolution.md](way-of-working-pm-resolution.md) | 18 skills |
| `/record-decision` invocation contract | [record-decision-contract.md](record-decision-contract.md) | 19 skills |
| Output Format shapes (Decision / Report) | [output-shapes.md](output-shapes.md) | 10 skills (documentation-only — no logic change) |
| To-issues triage (extend vs create) | [to-issues-triage.md](to-issues-triage.md) | 2 skills |

## How a skill uses these files

A skill's own section keeps its heading (e.g. `### Step 1: Resolution Cascade`, `## Graceful Degradation`) and states its **delta only**, then points here for the generic mechanics, e.g.:

> See [resolution cascade](resolution-cascade.md) for the generic Path A/B/C mechanics. **This skill's Path B**: ...

This is a context pointer, not a citation: the executor is expected to follow it when it reaches that step, the same way it already follows pointers to guideline files elsewhere in the algorithm. If a pointer ever proves unreliable for must-have material, sharpen its wording first — inline the content again only if sharpening fails.

## Scope note

These files are **generic and portable** — like the rest of `.pair/knowledge/`, they describe how *this skill corpus* works, not any one project's history. They may name skills, arguments, and adoption-file conventions; they never cite this repo's own ADRs, decision-log entries, or issue numbers as authority for the convention itself.
