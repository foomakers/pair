# Decision: Live Run Events and One Audit File for Three Writers

## Date

2026-10-23

## Status

Active

## Category

Process Change

## Context

`pair-cli run` printed one line per iteration and decided the outcome from the engine turn's `result.subtype` alone: a workflow HALT, or a background workflow that `claude -p` stopped, came back as `success`, and a 30-minute wall-clock kill stopped long but healthy stages (#573, absorbing #572 C11, C12, D13, G17). The workflow sandbox cannot write files directly (its audit goes through a relay agent), so a killed run left no trail for the iteration in flight.

## Decision

- **One event protocol**: `pair-loop.js` and `pair-implement-batch.js` print each run event as one `PAIR_EVENT {json}` log line (`loop-start`, `iteration`, `card-start`, `stage`, `card-end`, `loop-end`). The driver looks for those lines in every string of a decoded engine event (engine-agnostic, bounded depth, same walk as the continue-token), dedupes a line quoted twice, and maps them to typed `RunEvent`s. Console, audit and `--json` consume that one source. A `--parallel` child `run --card` prints the same lines (stage dispatches) when the pool sets `PAIR_RUN_EVENTS=1`. **claude engine (r0-3, recorded live 2026-10-23)**: a background Workflow's `log()` never reaches `claude -p` stream-json (only the task output file, at completion); the driver therefore also maps `system/task_progress.workflow_progress` agent entries — labelled `<step>:#<card> …` by `pair-implement-batch` — to `card-start`/`stage`, once per `agentId`. The stage follows the workflow's own `stageLabel`: `prepare:phase #<card>` is `prepare`, a round-tagged `r<n>-g…` prepare/validate/green agent is `fix n/<max>`, an `a0` contract agent is `implement`. `<max>` is the run's fix-round budget: on the loop path `pair-loop` dispatches `pair-implement-batch` with no `pipeline`, so it is the batch's `PIPELINE_DEFAULTS.maxFixRounds` (3); `?` only where no budget is known. No `PAIR_EVENT` closes a progress-opened card, so the iteration's end does (terminal event or stream end): `card-end` with the status the workflow returned (`batch[]` / `log[]` `{id,status}`, also when quoted in prose), else the explicit `unknown` — never a done status it did not report.
- **Outcome from the workflow, not the turn**: a non-`completed` `loop-end`, or `pair-loop: HALT —` in the final text, is `halted`; a `loop-start` with no `loop-end` is `cut`; a watchdog stop is `timed-out`. All three fail the iteration (exit 1). Streams with no event keep the old rule.
- **Idle timeout replaces the wall-clock guard**: every decoded event re-arms it (default 1800 s; `--idle-timeout` > `## Stop Predicate` `idle-timeout:` > `pair.config.json` `engine.idleTimeout` > default). `--iteration-timeout` stays as an opt-in total cap with no default.
- **The driver writes the audit live**: one JSON line `{ts, runId, iteration, card, event, detail}` per event, `O_APPEND`, starting with `loop-start` before the first selection. It shares the `## Audit Location` file with the workflow's own iteration record and the dispatch `key=value` lines. One file, line-oriented, three line shapes: the workflow's resume read is an agent read that accepts all three.
- **An unwritable live audit warns once and the run continues**: it must not kill cards already in flight. The workflow's own audit-write HALT (M5) is unchanged.

## Alternatives Considered

- **A second audit file for the driver**: no mixed shapes, but two places to `tail -f` and a resume read that would have to merge them.
- **Converting the dispatch `key=value` lines to JSON**: one shape, but it rewrites a trail format host adapters already parse (`DISPATCH-RECORD:`). Out of scope here.
- **Per-engine event extraction fields in `EngineDefinition`**: deferred until a live engine stream shows the generic walk is not enough.
- **Fail-closed on an unwritable live audit**: consistent with M5, but it would stop a run whose workflow still audits through its relay.

## Consequences

- `tail -f` on the audit shows card-level progress while the run is still going; a killed run keeps its trail up to the last event.
- A HALT, a cut workflow and an idle timeout exit non-zero; scripts and daemons see the real outcome.
- Fixtures for the event mapping (claude, codex, pi) were built in each engine's documented stream shape, not recorded from a live run. Where an engine puts a background workflow's `log()` output is still to be confirmed live; an engine that shows none gets start/end lines per iteration and a one-time notice.

## Adoption Impact

- KB guideline `automation-policy.md`: `## Stop Predicate` gains `idle-timeout:`; `## Audit Location` documents the live JSONL lines.
- No adoption file changes: the new key is optional and its default applies.
