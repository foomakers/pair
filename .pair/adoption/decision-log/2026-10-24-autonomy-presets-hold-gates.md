# Decision: Autonomy presets, hold-* gate names, natural stop, working cleanup (US-576)

## Date

2026-10-24

## Status

Accepted

## Category

Process Decision

## Context

Unattended runs needed one switch for "process the backlog, stop only where a human is needed", gate values that read the way they behave, and less run-state debris. Story #576.

## Decision

1. Gate values are `hold-always | hold-never | hold-when`; bare `always | never | when` stay deprecated aliases (parsed, with a warning). The parsed gate keeps the bare token as internal `mode`, so `cycle-merge`, `cycle-prepare` and `pair-cli` compare unchanged; every printout uses `hold-*`.
2. Presets `full | escalate-red | supervised | custom` resolve in `autonomy-policy.mjs`. Precedence: argument > explicit adoption key > preset > KB default.
3. `merge: hold-never` waives `pair-explicit-approval` on a `risk:red`/untagged PR (missing or pending); a `failure` still halts. `pair-review` on the reviewed head, green CI and the green tier gate set stay mandatory.
4. No `max-iterations` declared ⇒ no iteration cap (natural stop), replacing the fail-safe `1` in `pair-cli` and `pair-loop.js`. Each card still stops at its own gates.
5. Empty `## Autonomy`: a TTY `pair run` asks the preset (Enter = `supervised`) and writes `preset:`; a non-TTY run writes nothing and runs the KB defaults (every gate held = supervised behaviour) — no preset is injected, so existing projects and child processes keep today's `until`/`filter`.
6. The automation template ships under `knowledge/guidelines/collaboration/templates/`, not `.pair/adoption/` (whose `add` registry would impose `escalate-red` on existing projects at update); bootstrap writes it.
7. `## Working Cleanup` defaults to `after 7d`; Done = issue `CLOSED` (not `NOT_PLANNED`) with `closedAt` read via `gh`; open or unreadable cards are never touched.

## Alternatives Considered

- Rename the internal mode to `hold-*`: rejected — touches every consumer for no behavioural gain.
- Inject `preset: supervised` on non-TTY: rejected — changes `until`/`filter` of existing unattended runs.
- Ship `tech/automation.md` in the adoption dataset: rejected — the `add` registry writes it into existing projects.

## Consequences

`pair run --preset escalate-red` processes the backlog alone and holds red cards; a run with no cap can be long — `max-iterations` bounds it explicitly.

## Adoption Impact

Schema and defaults in `knowledge/guidelines/collaboration/automation/automation-policy.md` (KB); this project's own `tech/automation.md` is unchanged (legacy sections keep working).
