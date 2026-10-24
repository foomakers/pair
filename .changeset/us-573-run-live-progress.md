---
'@pair/pair-cli': minor
'@pair/knowledge-hub': minor
'@pair/website': patch
---

`pair-cli run` shows live per-card progress: on a terminal each card keeps one line rewritten in place (id, title, stage `prepare` → `implement` → `review` → `fix N/max` → `merge`, PR, elapsed, then `✔ merged` / `⏸ awaiting-human` / `⚠ escalated` / `✖ failed` / `? unknown` when the engine returned no readable card status), with one row per card under `--parallel`. A finished card's line is printed once above the live rows, which show only running cards and never grow past the terminal height. Without a terminal you get one timestamped line per event. `--json` prints the events as NDJSON, `--quiet` gives back the old output, `--no-color` and `NO_COLOR` turn colors off.

The audit file is written live: a `loop-start` line before the first selection, then one JSON line per event, so you can `tail -f` it and a killed run keeps its trail. The banner prints the absolute audit path; the end summary lists cards merged / parked / failed / unknown and how many eligible cards are left.

The run outcome is now truthful: a workflow HALT, a background workflow cut before it finished, or an idle timeout exits non-zero instead of reporting `success`. A run is stopped only after 30 minutes with no engine event (`--idle-timeout`, `## Stop Predicate` `idle-timeout:`, `pair.config.json` `engine.idleTimeout`); `--iteration-timeout` becomes an opt-in total cap with no default. Both timeouts accept at most 2147483 seconds. `claude` runs with `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`.

With the `claude` engine, live stages come from the stage agents of Claude Code's `task_progress` events: a background workflow's log lines never reach `claude -p` output.
