# Telemetry of a workflow run

A workflow run can record, per step, how long it took, the tokens it used and how it ended. It is off by default.

```bash
pair-cli run quick --card 627 --telemetry
```

The key `telemetry` of the run's [configuration](workflow-configuration.md) switches it on or off; a flag overrides the key. `--no-telemetry` switches it off for one run. Switching it off changes nothing else: the run state never depends on telemetry. A record that cannot be written never fails a step: the run says so once and goes on.

## The file

One file per run, in the run directory: `.pair/working/runs/<run-id>/telemetry.jsonl`. One JSON record per line. `--restart` archives it with the rest of the run.

### One record per execution of a step

A step that runs again (a resume after a failure) has one record per execution. A card held before the step starts produces no step record or attempt increment.

| Field                        | Content                                              |
| ---------------------------- | ---------------------------------------------------- |
| `type`                       | `step`                                               |
| `schema`                     | `2`. The version of the record format (ADR-033).     |
| `run`, `workflow`, `card`    | The run id, the workflow name, the card.             |
| `step`, `kind`, `uses`       | The step, its kind, the skill it ran.                |
| `host`                       | `pair-run` or `session`.                             |
| `engine`, `model`, `effort`  | The ones the step launched with. `model` and `effort` are absent when none was set. |
| `startedAt`, `durationMs`    | When it started, how long it took.                   |
| `tokens`                     | See [Tokens](#tokens).                               |
| `estimate`                   | `lower-bound-from-text`, only when a token entry is estimated. |
| `status`, `reason`           | The outcome of the step.                             |
| `attempt`                    | The execution number of this step in the run.        |
| `round`                      | The loop round, present for an inner step.           |

### One closing record per run

Written when the run ends (`done`, `failed`, `parked` or `skipped`), as the last line. A held card closes the current invocation as `skipped` and can resume after release. A run that is resumed loses the closing record and gets a new one when it ends again. A run resumed without telemetry loses it and gets none.

| Field                     | Content                                                   |
| ------------------------- | --------------------------------------------------------- |
| `type`                    | `run`                                                     |
| `schema`                  | `2`. The version of the record format (ADR-033).          |
| `run`, `workflow`, `card` | The same identity as the step records.                    |
| `status`                  | `done`, `failed`, `parked` or `skipped`.                  |
| `durationMs`, `tokens`    | The sums of the step records, never a separate measurement. |
| `steps`                   | The number of step executions.                            |

## Tokens

```json
"tokens": {
  "read": { "value": 163531, "source": "measured" },
  "cached": { "value": 5378655, "source": "measured" },
  "written": { "value": 25924, "source": "measured" }
}
```

Three entries, always: `read` (fresh input), `cached` (input served from the cache), `written` (output). Each has a `source`. No number comes without its origin.

| Source      | Meaning                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| `measured`  | Read from the usage the engine reports. `pair-cli run` measures.                          |
| `estimated` | A host that cannot measure: a quarter of the characters, rounded up. `read` from the message sent to the step, `written` from the agent's final message. |
| `unknown`   | Not known: `value` is `null`. `cached` cannot be estimated from text.                     |

An estimate is a lower bound: the text does not show file reads, tool calls or reasoning. The record says so with `estimate: "lower-bound-from-text"`.

A sum is `estimated` when any summed entry is. Unknown entries are never counted as zero: the sum lists the executions it leaves out, as `"unknown": ["review#1"]` (step and attempt).

No cost in currency is stored in a record.

## Reading the runs

The skill `/pair-capability-analyze-workflow-runs` answers what a card or a run cost, where the time goes, how many passes each step took, how two configurations compare and the trend over a set of runs. It is read-only. A script inside the skill computes every number, so the same files give the same numbers; each number is shown with its origin, and measured values are never compared with estimated ones.

Cost needs a price table, kept by hand: per million tokens, per model.

```json
{ "claude-fable-5-2": { "read": 0, "cached": 0, "written": 0 } }
```

Prices are never invented or downloaded. Without a row for the model, tokens are reported and cost reads "not calculated".
