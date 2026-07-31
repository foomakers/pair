# Decision: bootstrap's quick setup is a second resolution depth of the same skill, with guided as bootstrap's declared default

## Date

2026-07-31

## Status

Active

## Category

Convention Adoption

## Context

Story #278 asked for a "Quickstart path" in bootstrap: an opinionated one-command setup that gets an empty project to a first workable story in minutes instead of through the full Phase 0-4 interview. Two shapes were available: ship a separate `/pair-process-quickstart` skill, or add a mode to `/pair-process-bootstrap`.

The Guided / Quick Setup Convention (#276, PR #349) had just landed and already fixes the selector direction, the four-tier defaults cascade (`explicit argument > project state > saved preferences > hardcoded fallback`), and the non-interactive safety rule — while explicitly leaving *which mode is the default* to each adopter. Its two shipped adopters declare opposite defaults (`pair package` → quick; the `assess-*` family → guided), so bootstrap had to declare its own rather than inherit one.

## Decision

Quick setup is an **additive second resolution depth of `/pair-process-bootstrap`**, selected by `$mode: quick`, and **guided is bootstrap's declared default**. Absent `$mode`, Phases 0-4 run exactly as before.

Three constraints follow, and are asserted in `packages/knowledge-hub/src/conformance/bootstrap.test.ts`:

1. **No second skill, no second entry point.** One skill, one catalog row, one frontmatter description; both depths run the same phases, compose the same skills, and write the same files.
2. **No bespoke resolution order.** Bootstrap composes the convention's cascade and declares only its per-adopter delta — which decision points are defaultable, which tier fills each, which are still asked — in the disclosed sibling `quick-mode-defaults.md`. Two decisions stay asked in quick mode because no KB value is safe: the PM tool (organisational, not technical) and the tech stack when the repo is genuinely empty.
3. **No quick-mode-only output.** Every file quick mode writes is a normal adoption file in the normal location and format, with no marker distinguishing it, so an accepted default is editable exactly like any other adopted decision.

Guided is the declared default because bootstrap is human-facing first-time setup — the convention's own recommendation for that shape ("ask rather than silently assume"). The non-interactive path is the convention's, not a bootstrap invention: no TTY warns and falls back to quick rather than hanging, and HALTs if a still-asked decision is then unresolvable.

## Alternatives Considered

- **A separate `/pair-process-quickstart` skill**: Rejected. Two entry points for the same job diverge — a phase added to bootstrap would silently not exist in quickstart, and `/pair-next` would need a rule for which to suggest. It also duplicates the composition table and the already-configured-project detection.
- **Quick as bootstrap's default, guided opt-in via `--interactive`** (the `pair package` shape): Rejected. Bootstrap's first run is a human's first contact with the process; silently assuming an architecture and a project type is a worse failure than asking. It would also be a behaviour change for every existing adopter, not an additive one.
- **A bootstrap-specific resolution order** (e.g. always prefer the checklist fallback for speed): Rejected — it re-invents #276 one week after it landed, and makes an explicit argument losable to a hardcoded default.
- **A third partially-guided depth** (ask only the "important" ones): Rejected for now. The convention permits a documented deviation, but "important" is not definable without adopter data; the still-asked set already covers the only two decisions with no safe default.

## Consequences

- A future setup-oriented skill adopting the same duality follows the convention plus this precedent: mode argument on the existing skill, declared default stated explicitly, per-adopter delta in a disclosed sibling doc.
- Any new bootstrap phase or decision point must also declare its quick-mode resolution in `quick-mode-defaults.md`; the conformance test's per-decision anchors fail if a phase is added without one.
- Bootstrap's frontmatter description is unchanged, so no skills-catalog row moves.
- The <10 minute claim is validated, not asserted: `qa/release-validation/CP9-quickstart-onboarding.md` measures it with an explicit stopwatch protocol and covers the guided-default regression in the same critical path.

## Adoption Impact

- No adoption file changes: this records how an existing KB convention was applied to one skill, and adds no new project rule.
- No knowledge-base/dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records; the dataset (`packages/knowledge-hub/dataset/`) is a curated sample, not an auto-mirror of adoption, so this decision is not copied there.
