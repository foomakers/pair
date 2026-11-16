# Decision: telemetry price table lives in `automation.md` `## Telemetry`, USD per million tokens

## Date

2026-11-16

## Status

Active

## Category

Process

## Context

Story #661 AC-4: cost = tokens × price. Prices change; the KB must not ship stale ones.

## Decision

- A fenced `json` block in the adopting project's `automation.md` `## Telemetry`: `{"prices": {"<model-id>": {"fresh", "cached", "out"}}}`, USD per million tokens (fresh input / cached input / output). Parsed by `telemetry-policy.ts` (the section it already reads).
- Absent, malformed or per-model-incomplete ⇒ that model is unpriced and its cost is `not measured`; never estimated.
- Overturn: move it to `pair.config.json` if #617 owns per-model settings.
