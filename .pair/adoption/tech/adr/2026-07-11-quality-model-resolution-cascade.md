# ADR: Quality Model — Single-Document Resolution Cascade (Argument > Adoption > KB Default)

## Status

Accepted

## Date

2026-07-11

## Context

- Quality criteria for this repo (and any pair-adopting project) — risk classification, cost class, security relevance, per-tier gate/review requirements — were previously fragmented: implicit in review habits and skill prose rather than written down in one resolvable place.
- Multiple skills need the *same* rules: `classify`, `assess-cost` (#226), `assess-security` (#227), `pair-process-review`, `pair-capability-setup-gates`, and `pair-process-bootstrap` all need to classify risk/cost/tier consistently. Without one source, each would re-derive or duplicate criteria, and drift between skills becomes inevitable and hard to detect.
- Epic #208 (Unified classification & assessments → tags) requires a shared classification model whose tier and tag output every consuming skill and downstream automation (CI gates, `pair-next --filter`) reads identically.
- The KB already has an established convention-over-configuration principle (D21, "Adoption = solo delta"): a new schema should have a complete default in the KB, with adoption files holding only the delta a project actually needs — no new artifact should be mandatory.
- D13 (prior decision, referenced in story #221) rejected splitting this into a separate "quality grid" one-pager alongside the resolution logic — two artifacts that could drift apart.

## Options Considered

### Option 1: Per-skill embedded criteria

- **Description**: Each consuming skill (`classify`, `assess-cost`, `assess-security`, `pair-process-review`, `setup-gates`, `pair-process-bootstrap`) defines its own thresholds and classification rules inline in its own `SKILL.md`.
- **Pros**: No shared document to author or keep in sync; each skill is self-contained.
- **Cons**: Six-plus independent copies of "what counts as high risk" or "what tier requires how many reviewers" — drift across skills is inevitable and undetectable by inspection; no single audit point for "what are pair's quality rules"; violates the KB's own DRY conventions for shared rules.

### Option 2: Dedicated "quality grid" artifact, separate from resolution logic

- **Description**: A standalone visual/tabular "quality grid" document distinct from the prose resolution rules (the shape rejected by prior decision D13).
- **Pros**: Simpler to skim as a grid.
- **Cons**: Explicitly rejected per D13 — creates two artifacts (grid + logic) that can silently drift from each other; the grid becomes stale the moment resolution logic changes without a corresponding grid edit.

### Option 3: Single `quality-model.md` document + `Argument > Adoption > KB default` resolution cascade (chosen)

- **Description**: One document (`packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md`) holds the 3-layer principle, 3 pillars, all classification dimensions, tier resolution (`tier = max(assessed dimensions)`, never lowered once raised — D17), per-tier requirements, and the nested taxonomy. Every consuming skill resolves quality rules through the same three-level cascade: an explicit argument overrides adoption, which overrides the KB default. Tag emission (`risk:*`, `cost:*`) is chromatic-only and gated on an adoption declaration — no tag is emitted unless a project opts in. `tech/risk-matrix.md` is an *optional* adoption delta (criticality table + threshold overrides only); its total absence means KB defaults apply completely and nothing fails (D21).
- **Pros**: Single source of truth — one document every consuming skill points at; zero mandatory adoption footprint (a project using pair's defaults writes nothing extra); grep-verifiable, chromatic-only tag scheme instead of ad hoc per-project vocabularies; automation eligibility is a plain adoption-declared filter over existing tags rather than a bespoke tag family, keeping the tag surface small.
- **Cons**: Every consuming skill (`assess-cost` #226, `assess-security` #227, `classify` #233, extended review template #228) must independently implement the *same* resolution cascade correctly — the KB is prose, not executable code, so nothing mechanically enforces that all six skills apply the cascade identically; drift is possible if a future skill author misreads the order. Two nested-taxonomy entries (Architecture/modularity → `coupling-balance.md`, Cost signals → the cost-assessment guideline) are forward references to guidelines not yet published (tracked via #263 and #226 respectively).

## Decision

Adopt Option 3. `quality-model.md` is the single KB source of truth for quality classification. Resolution order for every rule in the document is **Argument > Adoption > KB default**: an explicit argument passed to a skill invocation wins; failing that, `tech/risk-matrix.md` (the adoption delta) wins; failing that, the KB default in `quality-model.md` applies. A malformed adoption delta is treated as absent — skills warn and fall back to KB defaults entirely, never partially.

This decision also settles three refinement-session questions cited inline in the story (not previously recorded in a durable decision):

- **Q1 (document location)**: the model lives under `knowledge/guidelines/quality-assurance/`, alongside the guidelines it governs, not in a separate top-level location.
- **Q2 (tag naming scheme)**: tags are chromatic-only (`risk:green|yellow|red`, `cost:green|yellow|orange|red`) — no semantic tag names beyond color, keeping the scheme small and provider-agnostic.
- **Q2b (no dedicated eligibility tag)**: automation eligibility (e.g., what `pair-next --filter` treats as auto-mergeable) is an adoption-declared *filter* over the classification tags above (e.g., `risk:green`), not its own tag family — one fewer tag surface to maintain.

The risk tier is `max(assessed dimensions)` across service/domain criticality, change/diff risk, business impact, security relevance, and coupling balance; built twice per story (D17) — once from story context at refinement, once from the diff at review — and the review value is a floor: it may raise the tier but never lower it.

## Consequences

### Benefits

- One document every consuming skill (`classify`, `assess-cost`, `assess-security`, `pair-process-review`, `setup-gates`, `pair-process-bootstrap`) reads from — no re-derivation, no duplicated thresholds.
- Zero mandatory adoption footprint: a project accepting KB defaults writes nothing to `tech/risk-matrix.md` at all (D21).
- Grep-verifiable, chromatic-only tag scheme instead of bespoke per-project vocabularies.
- Automation eligibility stays a plain tag filter, not a new tag family — smaller surface for `pair-next` and CI gates to reason about.

### Trade-offs and Limitations

- No shared executable code enforces that every consuming skill implements the cascade identically — each of #226/#227/#233/#228 must independently apply `Argument > Adoption > KB default` correctly; a future review of those stories should explicitly check this against `quality-model.md`, not just against each skill's own prose.
- Two taxonomy entries are forward references to not-yet-published guidelines (coupling-balance under #263, cost-assessment guideline under #226) — deliberately left as non-hyperlinked code spans (tested for) until those land.
- The coupling dimension depends on `assess-coupling` (#263) and scoped `map-contexts` output; until those exist, coupling is reported "not assessed" and excluded from the tier calculation, never blocking (D21).

## Adoption Impact

- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md` (new) — the resolution cascade, classification dimensions, tier/SLA table, tag projection, and nested taxonomy.
- `packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/README.md` — indexes the new document.
- `packages/knowledge-hub/dataset/.pair/knowledge/assets/risk-matrix-example.md` (new) — a filled-in `tech/risk-matrix.md` example usable as a real adoption starting point.
- No project's `way-of-working.md` or other adoption files require any change to adopt this decision — the resolution cascade and KB defaults apply with zero footprint until a project chooses to add a `tech/risk-matrix.md` delta.
