---
"@pair/pair-cli": minor
---

feat: `pair-cli run --card <id> [--pr] [--rounds] [--run-id]` — console-side serial delivery-cycle coordinator, dispatching pi/opencode/claude/codex headlessly through the same stages `/pair-workflow-cycle` drives in-session (#487). An unmapped card is routed by its own readiness, read through the adopted `## State Mapping`: Ready ⇒ the cycle, Draft/no breakdown ⇒ the preparation skill (never under `--autonomous`); `## Eligibility` bounds `--autonomous` runs (`--approve-ineligible` overrides one run); `pair.config.json` gains `engine.bin` / `engine.model`; every route that spawns takes the card lock, audits start/end and prints `DISPATCH-RECORD:`; SIGTERM/SIGINT stop the engine, release the lock and exit 143/130
