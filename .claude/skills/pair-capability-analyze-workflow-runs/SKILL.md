---
name: pair-capability-analyze-workflow-runs
description: "Analyzes the telemetry of workflow runs (`pair-cli run <workflow> --telemetry`): what a card or a run cost in tokens, where the time goes, how many passes each step took, how two configurations compare, the trend over a set of runs. Invoke on demand ('what did card 627 cost', 'where does the time go in quick', 'compare the two runs of 627', 'trend of the last runs'). A deterministic script computes every number and shows its origin (measured, estimated, unknown); measured values are never compared with estimated ones; without a price table cost reads \"not calculated\"."
version: 0.1.0
author: Foomakers
---

# /pair-capability-analyze-workflow-runs — Cost, Time and Passes of Workflow Runs

**Read-only after migration.** The script reads `telemetry.jsonl` under `.pair/working/runs/`. On first read it rewrites legacy step statuses from `needs-human` to `needs-decision`. If the run is locked or the file cannot be replaced, the answer uses the updated status and the next read can retry the rewrite. On request, the skill writes one report under `.pair/working/reports/workflow-runs/`. A run records telemetry only when it is switched on (`pair-cli run <workflow> --card <id> --telemetry`).

**The script computes, the agent comments.** Every number in the answer comes from `scripts/analyze.mjs`: same files, same numbers. The agent never computes, sums, prices or compares a number itself.

## Arguments

| Argument    | Required | Description                                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------------------------- |
| `$question` | Yes      | One of the questions below. Deduced from the request when it is clear, else asked.          |
| `$run`      | No       | One run id (the name of its directory).                                                     |
| `$card`     | No       | The runs of one card.                                                                       |
| `$workflow` | No       | The runs of one workflow.                                                                   |
| `$prices`   | No       | A JSON price table kept by hand: `{ "<model>": { "read": n, "cached": n, "written": n } }`, per million tokens. |
| `$report`   | No       | `true` to also write the answer as a report.                                                |

## Questions

| Question  | Answer                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------- |
| `cost`    | Tokens per step execution and in total; cost when the price table has a row for the model.         |
| `time`    | Duration per step and per kind, the slowest step, the total.                                        |
| `passes`  | Executions per step, re-executions included, with the outcome of each.                              |
| `compare` | The runs of the same card (`--by workflow`: of the same workflow) side by side, with their configuration. |
| `trend`   | Median and range per workflow and per kind over the selected runs, one figure per origin when measured and estimated values are both present. |

## Algorithm

### Step 1: Run the script

From the main checkout:

```bash
node <this skill dir>/scripts/analyze.mjs <question> [--run <id>] [--card <id>] [--workflow <name>] [--prices <file.json>] [--by card|workflow]
```

`--runs <dir>` reads another runs directory. Exit 2: report the cause printed on stderr and stop; there are no numbers to show. An empty `runs` list: say that no selected run holds telemetry and how to switch it on; stop.

### Step 2: Present the numbers with their origin

Each number carries a `source`, and the answer shows it:

- `measured`: read from the engine's own usage, or from the host's clock.
- `estimated`: a quarter of the characters of the text exchanged with the step. A lower bound: it does not see file reads, tool calls or reasoning. Always named as an estimate.
- `unknown`: not known, shown as unknown and never as zero. A sum lists the executions it leaves out (`unknown: ["step#attempt"]`).

A sum with an estimated entry is an estimate, and is presented as one. A cost is an estimate when any of its tokens is.

### Step 3: Keep the script's refusals

- `compare` returns `refused` for a figure whose runs differ in origin, or hold unknown entries. Report the refusal and its reason; never compare those values by hand.
- A cost that reads `"not calculated"` stays "not calculated": the price table is empty, absent or has no row for the model. Prices are never invented or downloaded; ask for a price table instead.
- Relay every line of `notes`. A session run says there that `cached` is unknown and that an efficiency comparison needs `pair-cli run`.

### Step 4: Comment

Comment what the numbers show: the most expensive step, the slowest kind, a step that needed several passes. Every figure quoted is one the script printed.

### Step 5: Report (on request)

With `$report`, write the answer to `.pair/working/reports/workflow-runs/<date>-<question>.md`: the headline first, the script's JSON collapsed below it.

## Safety

Nothing is modified: no run directory, no code, no card. Confirm with `git status` after the run: clean, or the one report.
