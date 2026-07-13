# Decision: Skill naming verb taxonomy — verify / assess / analyze (analyze-* for report skills)

## Date

2026-07-13

## Status

Active

## Category

Convention Adoption

## Context

The capability-skill corpus uses a verb prefix to signal what a skill *does*. Two verbs were clear, one was overloaded:

- `verify-*` (verify-quality, verify-done, verify-adoption) — a **conformance** check that yields pass/fail against a standard.
- `assess-*` — used for **two different operations** at once: (a) the 8 "decision" skills (assess-stack, assess-architecture, assess-methodology, assess-pm, assess-testing, assess-infrastructure, assess-observability, assess-ai) that evaluate options and **propose an adoption choice** (output-only proposal persisted by `/record-decision` per ADR-009); and (b) 2 "report" skills (assess-debt, assess-code-quality) that **only analyze and report** — they propose no adoption decision and never block a PR.

Folding "propose a decision" and "report only" under one verb blurred the reader's and the LLM router's expectation of a skill's effect, and made the `assess-*` descriptions harder to differentiate (a known #313 finding). The two report skills are conceptually neither conformance gates (`verify-*`) nor decision proposers (`assess-*`).

## Decision

Adopt a **three-verb taxonomy** for capability skills, one verb per operation, not overloaded across branches:

- **`verify-*`** = conformance pass/fail against a standard. (verify-quality, verify-done, verify-adoption) — unchanged.
- **`assess-*`** = evaluate options and **PROPOSE** an adoption choice; output-only proposal, persisted by `/record-decision` (ADR-009). The 8 decision skills — unchanged.
- **`analyze-*`** = analyze and **REPORT** only; proposes no adoption decision, creates nothing, never blocks a PR.

Rename the 2 report skills to the `analyze-*` verb:

- `assess-debt` → **`analyze-debt`**
- `assess-code-quality` → **`analyze-code-quality`**

Applies to both the dataset (`packages/knowledge-hub/dataset/.skills/capability/`) and the installed mirror (`.claude/skills/pair-capability-*`), renamed with `git mv` to preserve history. This is a **rename only** — no behavior change; both skills remain output-only report producers (ADR-009 still governs their output-only contract). The corpus stays at 35 skills.

## Alternatives Considered

- **Keep `assess-*` for all 10**: Rejected. Overloads one verb across "propose a decision" vs "report only", which is the ambiguity #313 set out to remove; leaves the 2 report skills mis-signaling that they might write/decide.
- **Fold the 2 report skills under `verify-*`**: Rejected. They produce a graded report (metrics, prioritized items), not a pass/fail conformance verdict; `verify-*` implies a gate, which debt/quality analysis explicitly is not (debt never blocks a PR, R7.2).
- **A `report-*` verb instead of `analyze-*`**: Rejected. "analyze" names the *operation* (the skills analyze code/debt and emit a report); "report" names only the artifact. `analyze-*` reads as the active capability and pairs cleanly against `verify-*`/`assess-*`.

## Consequences

- **Clear reader/router expectation**: the verb alone tells you whether a skill gates (verify), proposes a decision (assess), or only reports (analyze).
- **Sharper descriptions/eval**: the report skills no longer sit inside the `assess-*` near-clone cluster, aiding trigger differentiation (#313 T3/T7).
- **Migration cost**: every cross-reference to the old names had to move in lockstep — router catalog + cascade, `/review` composition contract, skills-guide categories + Migration Notes, skills-catalog rows, writing-skills naming table, eval trigger-prompts, and the #224 conformance test. All done in the same PR (#313/T8).
- **History preserved, not rewritten**: point-in-time records that predate the rename (ADR-009, the 2026-07-12 eval baseline) keep the old names as historical fact; the forward mapping lives in the skills-guide Migration Notes and this ADL.

## Adoption Impact

- Renamed skill dirs (dataset + mirror): `capability/analyze-debt/`, `capability/analyze-code-quality/`; `.claude/skills/pair-capability-analyze-debt/`, `.claude/skills/pair-capability-analyze-code-quality/`.
- Cross-references updated: `next` router (catalog rows + cascade row 14, category "Analysis"); `process/review` (required composed skill `/analyze-debt`); `skills-guide.md` (new "Analysis Skills" group; Verification = only the 3 `verify-*`; `manage-flags` → Operational; Code Quality bucket dissolved; Migration Notes entry); `apps/website/content/docs/reference/skills-catalog.mdx` (new "Analysis Capabilities" section); `apps/website/content/docs/concepts/skills.mdx`; `apps/website/content/docs/contributing/writing-skills.mdx` (verb taxonomy row + rule); `packages/knowledge-hub/eval/trigger-prompts.json` (family `analyze-report`); `packages/knowledge-hub/src/conformance/assess-output-only.test.ts` (analyze-* output-only + analyze-debt no scan-mode).
- Complements (does not amend) [adr-009-assess-output-only](../tech/adr/adr-009-assess-output-only.md): that decision makes assess-*/analyze-* output-only and names `/record-decision` the sole adoption writer; this ADL only renames the 2 report skills' verb. No dataset mirror of this ADL — sibling ADLs in `adoption/decision-log/` are adoption-only records.
