# Decision: the criticality/overrides delta is authored after domain modeling, as registry state, and quick mode writes no delta

## Date

2026-08-11

## Status

Active

## Category

Convention Adoption

## Context

`tech/risk-matrix.md` holds up to three independent sections (quality-model §6). One of them, `## Tag Projection`, already had a guided authoring path: `/pair-capability-classify` self-proposes it on first run and writes it once confirmed (§5). The other two — `## Criticality Table` (§3.1) and `## Overrides` (§4/§6) — had none, so a project could only hand-copy them from `risk-matrix-example.md`. Story #351 closes that gap.

Two facts constrained the shape. First, the file is **optional by design**: absent, classification resolves entirely from KB defaults and nothing fails (D21), so any authoring flow must not turn an optional file into an implied requirement. Second, the rows are only cheap to propose *after* a domain model exists — bootstrap's Phase 3.5 maps subdomains and bounded contexts, and Step 3.1 (where the other adoption documents are generated) runs before it.

## Decision

Three decisions, asserted in `packages/knowledge-hub/src/conformance/bootstrap-classification-delta.test.ts`:

1. **Position: a new `/pair-process-bootstrap` Phase 3.6, immediately after Phase 3.5.** The rows are keyed by the **deployable a diff resolves to** — that rule is owned by the sibling ADL [criticality rows are keyed by the deployable a diff resolves to](2026-08-11-criticality-rows-are-keyed-by-the-deployable-a-diff-resolves-to.md) and by quality-model §6, not by this decision; what Phase 3.5's position buys is that the subdomains and bounded contexts just mapped **name the candidates and recommend their values** (each offered with a criticality and its reason, confirmed or edited, never invented), instead of the developer being asked from nothing. When Phase 3.5 was skipped or its catalogs are empty, the phase degrades to repository-derived candidates (workspace packages, deployables) reaching the same key space directly, recommended by the same §6 criterion. An **empty answer** stays valid and writes **no section at all**; a written-but-rowless table is refused, since it is an existing table in which every service is unlisted and therefore resolves to conservative High.
2. **Write path: `/pair-capability-classify`'s propose-then-write-if-confirmed registry pattern, not `/pair-capability-record-decision`.** These sections are config-registry state, exactly like the `## Tag Projection` section the same file already carries — not adoption *decision* content. One file, one write behaviour, two writers that agree. The phase owns two sections and never touches `## Tag Projection`.
3. **Quick mode writes no delta.** `$mode: quick` asks nothing and writes nothing here, and the skip is reported once in the Step 4.3 summary. No safe default exists for a project's criticality map; a fabricated one would silently shape every future risk tier, and "no delta, KB defaults apply" is the documented steady state (D21), not a gap. The row is declared in `quick-mode-defaults.md` (per the consequence recorded in the 2026-07-31 bootstrap-depth ADL) and the value is listed among those `bootstrap-checklist.md` deliberately does not default.

**Absence stays legitimate** is a constraint on the feature, not a side note: declining writes nothing, the phase adds no HALT condition, and no Definition of Done may come to require the sections.

## Alternatives Considered

- **Author the sections in Step 3.1, alongside the other adoption documents**: Rejected. At 3.1 the domain model does not exist yet, so the phase could only ask from scratch — which is precisely the friction the story exists to remove. The delta is also not one of the always-generated documents: it is optional by construction, and a fixed generation list would imply otherwise.
- **Route the write through `/pair-capability-record-decision`**: Rejected. It would give one file two writers with two behaviours (`classify` self-writes `## Tag Projection`), and it records a decision where the artifact is registry state. The ADR/ADL log would fill with per-service criticality edits.
- **A separate `/pair-capability-author-risk-matrix` capability**: Rejected for now. The question set is short and its only good input is Phase 3.5's output; a standalone skill would have to re-derive that context, and the flow gains an entry point nobody would run at the right moment. Re-authoring later is already possible by deleting a section and re-running the phase (idempotent per section).
- **Quick mode deriving a criticality map from the subdomain catalog** (`core` ⇒ High, `generic` ⇒ Low): Rejected. It is a plausible heuristic, which is what makes it dangerous — it would write a delta nobody reviewed into the one file that shapes every future tier, and the reviewer count and SLA that follow from it.
- **Restating the section schema inside the skill** so the phase reads standalone: Rejected. The quality model owns the schema (§3.1/§4/§6) and `risk-matrix-example.md` shows it filled in; a second copy drifts. The phase references both and a conformance assertion fails if a table shape is copied inline.

## Consequences

- A project can author both sections without opening `risk-matrix-example.md`, and a re-run on an authored file proposes nothing (idempotent per section).
- **Idempotency covers authored sections only — a decline is deliberately not recorded.** This is the one place decision 2's reuse of the `/pair-capability-classify` pattern stops short of it: `classify` writes `Active: none` on a declined `## Tag Projection` so the proposal is never asked again, whereas here nothing at all is written on a decline, because "declining writes nothing" is the constraint the phase is built on (AC3) and a marker file would make an optional file's absence recordable. The accepted cost: a developer who declines is offered the candidate walk again on a later bootstrap run. Stated in the phase (Step 3.6.1 item 7) and in the Idempotent Re-invocation entry rather than left to be rediscovered.
- A malformed `tech/risk-matrix.md` is reported and left alone — the §6 resolution already warns and falls back to KB defaults, and the phase never rewrites a file over a parse it does not trust. The parse is a **phase-level precondition** (Step 3.6.0) ahead of both per-section presence checks, deliberately: behind them, a `## Criticality Table` heading with an unreadable table would read as "already authored" and the phase would go on to write the other section into a file it just distrusted — a write §6 makes silently inert.
- Quick mode's question count is unchanged by this phase: it adds zero.
- Any future writer of the same file inherits the same split — registry sections self-written by the skill that owns them, adoption decisions through `/pair-capability-record-decision`. That split is now **discoverable** rather than folklore: `skills-guide.md` § Adoption Files carries a `tech/risk-matrix.md` row naming both writers and their sections, with section ownership stated as the invariant.

## Adoption Impact

- No adoption file changes: this records how existing KB conventions (quality-model §5/§6, the guided/quick convention) were applied to one bootstrap phase, and adds no new project rule.
- `.pair/adoption/tech/risk-matrix.md` (this repository's own delta) is unchanged — it declares `## Tag Projection` only, which stays a valid, fully supported state.
- No dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records.
