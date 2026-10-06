# Decision: planned-marker issue state is read live via `gh`, skipped locally when unavailable, fatal in CI

## Date

2026-10-06

## Status

Active

## Category

Tooling Preference

## Context

Story #353 AC8: `docs:staleness` must fail when a planned-capability marker names a closed issue. The gate is otherwise pure and filesystem-only; issue state needs the code host. `docs:staleness` also runs in local pre-push.

## Decision

- Marker: `**Planned** — tracked in #<n>` inside a `<Callout type="info">`; the literal anchor is the contract (`PLANNED_MARKER_RE`).
- State via `gh issue view <n> --json state`, one call per distinct issue, injectable in `runAllChecks` for tests.
- closed → failure naming page; unresolvable (not found) → distinct failure.
- Lookup unavailable (no `gh`, offline, unauthenticated): local run warns and skips; `CI` set → failure. Never a silent pass.

## Alternatives Considered

- Checked-in issue-state cache: offline-pure, but the cache itself goes stale.
- CI-only check: same outcome as chosen, but without the local warning.

## Consequences

- A local pre-push without `gh` auth does not block; CI is the enforcing layer.
