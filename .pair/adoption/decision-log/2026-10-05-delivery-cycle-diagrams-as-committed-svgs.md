# Decision: delivery-cycle diagrams ship as committed SVGs, not Mermaid

## Date

2026-10-05

## Status

Active

## Category

Tooling Preference

## Context

Story #493 AC9 needs diagrams that render both in the KB markdown and on the docs site. GitHub renders Mermaid; the docs site (fumadocs) has no Mermaid support, and adding it needs a new dependency and a lockfile change.

## Decision

- Diagrams are SVG files, committed once: KB copy under `.pair/knowledge/guidelines/collaboration/automation/diagrams/` (dataset + mirror), site copy under `apps/website/public/diagrams/`. Both pages reference the same files.
- This PR is 493-A (AC1–AC9, AC11, AC8). AC10, AC12 and AC13 (article set, Workflows section, team scenarios) are deferred to 493-B, per the story's own split recommendation: an article is written only once the story it documents is merged.

## Alternatives Considered

- Mermaid in the KB plus a Mermaid component on the site. Rejected: new dependency, lockfile change, client-side render.

## Consequences

- A diagram change means regenerating the SVG and copying it to both locations.

## Adoption Impact

None.
