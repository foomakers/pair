# Decision: tier resolution downgrades a would-be-yellow to green when the only yellows are default-artifact dimensions, never when they're observed-in-diff dimensions

## Date

2026-08-14

## Status

Active

## Category

Adoption Delta

## Context

Follow-up to `2026-08-14-risk-matrix-overrides-close-the-zero-green-gap.md` (Criticality Table + `change-risk.dataset-mirror-pairs` override) and to a breakdown of the 28 currently-open stories' classification matrices: even after that fix, no story could resolve `risk:green` in practice, because the plain `max` rule (quality-model §3.2) treats a single yellow dimension the same regardless of *why* it's yellow.

The maintainer proposed a majority-vote rule ("no red, more green than yellow ⇒ green"), which was examined and rejected: it would let a genuinely-observed signal (e.g. Security relevance yellow — "new external dependency") be voted away by unrelated green dimensions, defeating the reason that dimension exists independently. The follow-up question — "does security really matter more than the others?" — surfaced the real distinction, which isn't security-specific: Change-risk, Security-relevance and Coupling-balance yellows reflect something the classifier actually observed in *this* diff (shared code touched, a new dependency, an unbalanced integration), while Service/domain-criticality and Business-impact yellows are, on this repo, frequently just an artifact of coarse KB defaults / subdomain granularity (exactly what the Criticality Table and the `Development Tooling Standards` Generic subdomain exist to correct) — not a judgment about the diff itself.

## Decision

**`tech/risk-matrix.md` Overrides gains `tier-resolution.default-artifact-downgrade`**: a diff with zero red dimensions resolves overall tier to green if every present yellow is Service/domain-criticality and/or Business-impact — never Change/diff-risk, Security-relevance, or Coupling-balance, which stay pure weakest-link regardless of how many other dimensions are green. A red on any dimension is unaffected (this override only ever raises a would-be-yellow, never lowers a red).

## Alternatives Considered

- **Majority-vote (no red, more green than yellow ⇒ green)**: rejected — treats all 5 dimensions as interchangeable votes; a single observed-in-diff yellow (e.g. a new external dependency) could be diluted away by three unrelated green dimensions, which defeats having 5 independent dimensions in the first place.
- **Security-only carve-out (green cannot come from voting away a security yellow, but other dimensions can)**: rejected on further scrutiny — Change-risk and Coupling-balance yellows are equally "observed, not artifact," and singling out security alone was arbitrary, not principled.
- **Do nothing further (accept that most stories stay yellow even after the Criticality Table fix)**: rejected — the breakdown showed 24/28 open stories at yellow with only Service-criticality and/or Business-impact yellow, zero real risk signal, purely artifact-driven; leaving this unfixed keeps `risk:green` structurally unreachable for the common case.

## Consequences

- A story/PR whose only yellows are Service-criticality/Business-impact (both default-artifact-prone dimensions) now resolves green — the common case for small, non-security, non-shared-code, non-architecturally-relevant changes.
- Any yellow on Change-risk, Security-relevance, or Coupling-balance still forces yellow-or-above, exactly as before — no dilution of a genuinely observed signal.
- Existing open stories' classification matrices predate this change and the Criticality Table fix; they reflect stale numbers until next touched by refinement/review.

## Adoption Impact

- `.pair/adoption/tech/risk-matrix.md`: `## Overrides` gains `tier-resolution.default-artifact-downgrade`.
- No KB/dataset change — project-local adoption delta only (D21), same as the sibling decision this follows up on.
