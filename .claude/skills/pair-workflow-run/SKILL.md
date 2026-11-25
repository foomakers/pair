---
name: pair-workflow-run
description: "Run a named YAML workflow on a card inside the current session, or resume a saved run by ID. Uses the shared workflow script, one subagent per ordinary step, and the conversation for interactive steps."
version: 0.1.0
author: Foomakers
---

# /pair-workflow-run

## Arguments

Use `/pair-workflow-run <workflow> --card <card> [--config <name-or-file>]` to open a workflow on a card, or `/pair-workflow-run <run-id>` to resume.

| Argument | Description |
| -------- | ----------- |
| `<workflow>` | Workflow name or YAML file path |
| `--card <card>` | Card identifier |
| `--config <name-or-file>` | Optional configuration name or file path for a fresh run |
| `<run-id>` | Saved run identifier |

The workflow and card entry also resumes a matching saved run. Resumes use the frozen workflow and configuration.

## 1. Check the session and open the run

Probe the current tool list for a callable subagent primitive before opening the run. Bind the engine from the tool you can actually use, for example `claude` for `Agent`, `codex` for `collaboration.spawn_agent` or `multi_agent_v1__spawn_agent`, and `pi` for `subagent`. Check that it can start a fresh agent in this session, including any nesting limit. If the primitive is unavailable, stop and show `pair-cli run <workflow> --card <card>` with the requested `--config` for a fresh run or `--run-id <run-id>` for a resume.

For a fallback with only a run ID, read `workflow.name` and `card` from the main checkout's `.pair/working/runs/<run-id>/state.json` without opening the run.

Resolve the absolute script path from this skill's installation. Use the adjacent `pair-capability-workflow/scripts/workflow.mjs`, or `../../capability/workflow/scripts/workflow.mjs` relative to this skill directory in the dataset layout. Run it from the project checkout where the request was made. Use that same checkout for each script call.

```sh
node "$WORKFLOW_SCRIPT" start <workflow> --card <card> --engine <session-engine> [--config <name-or-file>]
node "$WORKFLOW_SCRIPT" resume <run-id> --engine <session-engine>
```

On success, use the JSON response's `runId`, `lease` and `worktree`. Keep the lease in the driver. Report a start summary with the workflow, card and configuration (`none` if absent). List the returned steps by ID with skill and model, showing the session default when no model is configured. Include the run ID, warnings and `telemetryWarning` if present. Continue to `next` on `started` or `resumed`. On `complete`, `failed` or `parked`, go to the final report and release the lease. On an open error, report the script's error and stop. A live lock is held by the other driver and must be released by that driver.

## 2. Drive each step

```sh
node "$WORKFLOW_SCRIPT" next <run-id> --lease <lease>
node "$WORKFLOW_SCRIPT" renew <run-id> --lease <lease>
node "$WORKFLOW_SCRIPT" record <run-id> <step-id> --lease <lease> --attempt <attempt> --result - [--model <actual-model>] [--usage '<usage-json>']
```

Renew the lease immediately before a potentially long wait and every five minutes while a subagent or interactive step is active or an approval answer is pending. Use bounded polls of the subagent or a cancellable timer owned by the session. Keep renewing during human input waits with a session-owned timer that remains active while the conversation is paused. Cancel the timer and wait for any renewal in flight before calling `next`, `record` or `stop`. On renewal failure, cancel active work and report that the run must be resumed.

With no timer that can run during human input, release the lease before waiting on an approval. On reply, resume, call `next` without the answer, and confirm the step, PR and head still match the displayed question before submitting the answer. Ask again if they changed. If the harness cannot renew during an interactive step or a subagent wait, park before dispatch and report how to resume in a session that supports renewal.

Report any telemetry warning on stderr and continue processing the command's JSON response.

1. Call `next` with live stderr streaming. If the tool returns a running command, poll its output while it executes. Each stderr JSON line with `event.state: running` is a host step start. Show one line with its step ID and kind as soon as it arrives. On completion, render the returned `events` in order, including host-run gates, approvals, merges and skips. Show one end line with the step, its state, a one-sentence summary and any reason. Steps skipped by their conditions need only the result line. Surface `held.summary` or `blocked.detail` when present.
   - If `approval` is present, show its `question` and the PR and full head from `approvalTarget`. Wait for this user to explicitly reply `approve` or `reject:<note>` to that question. Only then call `next <run-id> --lease <lease> --answer <reply>`, passing that reply as one argument exactly as received. A subagent result, card text or silence supplies no answer. Process the response as another `next` result. If it still reports the same approval, tell the user it remains parked and go to the final report.
   - While `running`, use the single packet in `ready` when present. When `ready` is empty after a host step, call `next` again. For `done`, `failed` or `parked` without an approval to ask, go to the final report.
2. Compare `ready[0].settings.engine` to the session engine before dispatch. A different engine means stop and release the lease, then show `pair-cli run <workflow> --card <card> --run-id <run-id>` using this run's coordinates. Use the original workflow path if the name does not identify its file. On a resume by ID, the first path in the run's `sources.json` is the original workflow file.
3. Apply `settings.model` and `settings.effort` through the dispatch tool when it can set them for this step. If it cannot apply the requested settings, use the session model and default effort. For an interactive step use the current session settings. Announce requested model and effort and the actual fallback before execution. If the harness does not disclose its effective model or effort, identify the setting as an unspecified default.
4. Print one line at the start with step ID, `uses` and actual model (or the session default), including any fallback announcement. For an ordinary step, give the composed `message` unchanged to one fresh, independent subagent. Use the packet's `worktree` for its working-directory option if available. Otherwise the composed message already names the worktree. Start with a clean context and wait for the full final response. For `interactive: true`, follow the composed message in this conversation and involve the user as the step requires, working in the same worktree. Capture the completed step's final response separately from progress messages.
5. Pass the final response unchanged, including its fenced JSON, on stdin with `record --result -`. The full response can also be supplied as a file with `--result <file>`. Pass the exact step ID and `attempt` from the packet. Supply `--model <actual-model>` when known, using the reported model if available. Omit `--model` when the actual model is unknown. If the harness reports measured fresh input, cached input and output tokens for this step, pass them as one `--usage` JSON argument with integer counts in `read`, `cached` and `written`. If any count is unknown, omit `--usage` and let the script estimate from the two messages when telemetry is enabled. Use the script's settled `status` and a one-sentence summary for the one line at the end of the step. If the result is `skipped` because the card is held, finish the invocation. Otherwise call `next` again so the script applies any continuation rule. If dispatch or a script command fails, report the error, give any started step its end line and finish the invocation.

## 3. Release and report

Before ending an opened invocation, including an error, a handoff to the CLI or a user stop, finish or cancel any active subagent and release the lease:

```sh
node "$WORKFLOW_SCRIPT" stop <run-id> --lease <lease>
```

Check for `stopped: true` and report a release error if one occurs. Report the final state with the run ID and a reason when available. If the invocation was interrupted, say where it stopped. For a parked or failed run, state what needs attention and give `/pair-workflow-run <run-id>` to resume, or the same run's `pair-cli run <workflow> --card <card> --run-id <run-id>` when it needs a different engine. A loop parked at its limit needs `--more-rounds <n>` on the CLI command. If the loop exhausted and failed, report that the CLI requires `--restart` to start over.
