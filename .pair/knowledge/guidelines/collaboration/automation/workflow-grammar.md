# Workflow grammar — version 1

A **workflow** is a YAML file of typed steps. `pair-cli run <workflow> --card <id>` runs its steps on one card, one at a time, in file order. The file is the process: what runs, in which order, with which skill and options.

The step kinds are in [workflow-kinds.md](workflow-kinds.md). The workflow that ships with pair is in [workflow-quick.md](workflow-quick.md).

## Where a workflow lives

`pair-cli run <workflow>` takes the argument as:

1. a path, when that file exists;
2. else `.pair/adoption/tech/workflows/<name>.yaml` of the project;
3. else the knowledge-base default of that name. Quick falls back to its [portable definition](workflow-examples/quick.yaml) when the project has no adopted copy.

A project changes a shipped workflow by editing its copy under `.pair/adoption/tech/workflows/`.

## The file

```yaml
version: 1
name: quick
description: Implement a card and review the result.
steps:
  implement:
    kind: implement
  review:
    kind: review
```

| Key           | Required | Meaning                                                              |
| ------------- | -------- | -------------------------------------------------------------------- |
| `version`     | Yes      | The grammar version. Only `1` is known.                              |
| `name`        | Yes      | The workflow name. It equals the file name without its extension.    |
| `description` | No       | One line for people.                                                 |
| `aliases`     | No       | Names the steps cite, each with its default `engine`, `model`, `effort`; a configuration sets them (see [workflow-configuration.md](workflow-configuration.md)). |
| `steps`       | Yes      | A non-empty map of steps, by id. Execution order is the file order.  |

### Step properties

| Key | Type and values | Default | Applies to | Example |
| --- | --- | --- | --- | --- |
| `kind` | String. `implement`, `review`, `fix`, `generic`, `gate`, `approval`, `merge`, `refine-story`, `plan-tasks` or `loop`. | Required. | Every step. The kind determines its inputs, `with` keys and result contract. | `kind: implement` |
| `skill` | Installed skill name. | The kind's default. Required for a `generic` step without an include. | Agent steps. Host kinds execute directly. | `skill: pair-process-review` |
| `interactive` | Boolean. | The kind's default. Ordinary agent kinds default to `false`. | A skill step with `true` runs in the session conversation. The terminal parks and prints the session resume command. | `interactive: true` |
| `args` | Reserved outside grammar v1. A YAML `args` key is refused. | Absent. | The launcher supplies inputs from `--card` and earlier outputs. Use `with` for kind options. | `pair-cli run quick --card 627` |
| `when` | Object with card filters (`has`, `lacks`, `status`, `assignee`) or an earlier `output` and an `is` list. | Run unconditionally. | Executable steps other than a loop's `until` child. A mismatch skips the step. | `when: { output: implement.status, is: [failed] }` |
| `uses` | String naming an included workflow. | Absent. | A typed or generic include call. The included steps replace the call in file order. | `uses: shared` |
| `with` | Object of kind-specific options. | Empty object and kind defaults. | Executable steps. On an include, options apply to the selected output step of the same kind. | `with: { question: 'Merge this PR?' }` |
| `gates` | List of gate keys, `target:<name>` values or project-owned `command:<shell line>` entries. | Empty. | Post-success checks for executable steps. On `gate`, it supplies the gate's commands and takes precedence over `with.gates`. | `gates: [target:increment]` |
| `on-failed` | `stop` or `continue`. | `stop`. | Top-level executable steps. Shorthand for `escalate.failed`. Inside loops, use a child `escalate` rule. | `on-failed: continue` |
| `on-resume` | `{ reason, step }` with a non-empty reason and earlier top-level step ID. | Absent. | Top-level executable steps. A stopped failure with that reason refreshes the linked PR head and replays from `step` on resume. | `on-resume: { reason: head-changed, step: review }` |
| `alias` | String declared under `aliases`. | Step or run configuration. | Steps that launch an agent. The alias supplies engine, model and effort defaults. | `alias: build` |
| `state` | `Draft`, `Ready`, `In Progress`, `Review`, `Done` or `none`. | The kind's transition, when defined. | Executable steps. `none` disables the transition. `Ready` and `Done` take effect on success. | `state: none` |
| `until` | String naming a child step. | Required for a loop. | Loops. The child must run, and `ok` ends the loop. | `until: review` |
| `max` | Positive integer counting rounds started. | Required for a loop. | Loops. A run configuration may override the bound. | `max: 3` |
| `on-max` | `escalate` or `fail`. | Supply this or `escalate.exhausted`. | Loops. `escalate` parks. `fail` makes the run failed and cannot be combined with an explicit exhaustion rule. | `on-max: escalate` |
| `steps` | Non-empty ordered map of child IDs to steps. | Required for a loop. | Loops. Nesting another loop is invalid. | `steps: { review: { kind: review } }` |
| `escalate` | Map of status to `stop`, `continue` or `{ do, comment }`. | [Outcome defaults](#outcomes-and-escalation). | Executable steps handle their own outcomes. A loop accepts only `exhausted`. | `escalate: { failed: continue }` |

A step id starts with a lower-case letter and continues with lower-case letters, digits and hyphens: it names a directory of the run.

### Include a workflow

A `uses` step expands before validation and execution. For example, `shared.yaml` selects the output step:

```yaml
version: 1
name: shared
outputs:
  from: repair
steps:
  repair:
    kind: fix
  check:
    kind: generic
    skill: check
```

A caller can include it:

```yaml
steps:
  fix:
    kind: fix
    uses: shared
    with:
      gates: [quality-gate]
    on-failed: stop
```

The expanded IDs are `fix/repair`, then `fix/check`. `outputs.from` selects `repair`. Without it the last step supplies outputs. A typed caller requires the selected step to supply its kind's outputs. `with` applies to the selected step when it has the caller's kind, and `on-failed` applies to the last step. Declare `interactive`, `when`, `gates`, `state`, `on-resume` and `escalate` on included steps.

Includes may nest up to three levels; cycles, unknown names and workflow/skill name clashes fail validation. An include may introduce a loop outside a loop, but loops cannot nest, including through an include. Configuration can target expanded IDs such as `fix/repair`. `--dry-run` shows the expanded order; a run freezes it and warns on resume if an included source changes.

### Loop

```yaml
steps:
  rounds:
    kind: loop
    until: review
    max: 3
    escalate: { exhausted: stop }
    steps:
      review: { kind: review }
      fix: { kind: fix }
```

`until`, `max`, a non-empty child map and an exhaustion policy are required. Child IDs use `rounds/review` and `rounds/fix`.

An `ok` result from `until` exits the loop immediately. By default, a failed `until` makes its outputs available to following children. Another failed child spends the round. A blocked child or one that needs a decision parks at the same step and round unless its rule continues. When the loop exhausts its budget, `rounds.status` is `exhausted` and the last `until` outputs are retained. Extend a parked exhausted loop with `--more-rounds <n>`. Each child result lives under `steps/<loop>/<child>/round-<n>/result.json`.

### Steps the host runs

`gate`, `approval` and `merge` run no agent and spend no token: the host executes them. Their options are in the [kind reference](workflow-kinds.md).

```yaml
  checks:
    kind: gate
    with: { gates: [quality-gate], checks: [ci-green, head-unchanged] }
  approve:
    kind: approval
    with: { question: Merge this PR? }
  merge:
    kind: merge
    with: { method: squash }
```

- **`gate`**: `gates` runs the selected Custom Gate Registry commands in the card worktree. With `head-unchanged`, local commands require a clean worktree at the reviewed commit before and after execution. `ci-green` waits up to `with.timeout-minutes` (30 minutes by default) for every required mechanical context on the PR head. The required contexts come from classic branch protection and active rulesets on the base branch. A pinned context requires a matching GitHub App. An access denial fails the check. When both inventories confirm that requirements are absent, the gate checks the reported non-`pair-*` contexts. Missing evidence stays pending. Other checks are `review-approved` and `prerequisites-done`.
- **`approval`**: parks and posts the PR number and full head SHA on the card. Resume with `--approve <card>`, `--reject "reason"`, a native PR review on the parked head, or a fresh card comment of the form `/approve #<pr> <sha>` or `/reject #<pr> <sha> <reason>`. An eligible PR author with solo approval enabled uses `/approve <sha>`. The platform verifies the actor and target.
- **`merge`**: requires matching review, gate and approval heads. After GitHub confirms the merge, the host closes the story, cascades, confirms Done and cleans up the branch. On a closed card, only unfinished closure on that same merged PR and head can resume.
- **Head changes**: delivery declares an `on-resume` route for `head-changed` at the gate and `head-moved` at approval and merge. The next run fast-forwards a clean card worktree to the same PR's current head before repeating review, gates and approval. Dirty or diverged worktrees require reconciliation. A replayed review loop starts with a fresh configured round budget. Runs use their frozen definition, so a run started before the route was declared needs a restart to adopt it.

### `when` and `skipped`

```yaml
  approve:
    kind: approval
    when: { has: [risk:red, risk:yellow] }
  fix:
    kind: fix
    when: { output: review.verdict, is: [changes-requested] }
```

Card facts are read as the step is about to start. Conditions combine keys with AND and match any value inside a list. For an output condition use `<step>.<name>` or `loop/step.name` with `is: [...]`. The producer must appear first. An unmatched condition records `skipped` and the run continues. Validation refuses an input that only a skippable step produces.

## Outcomes and escalation

| Outcome | Producer | Meaning and default |
| --- | --- | --- |
| `ok` | Step | Work succeeded. The run continues. A loop's `until` step ends the loop. |
| `failed` | Step or host | Work or verification failed. The default stops a top-level run as failed. Unconfigured loop children follow the convergence rules above. |
| `blocked` | Step or host | A prerequisite, permission or environment is missing. The default parks the run. |
| `needs-decision` | Step or host | A human must choose. The default parks the run. |
| `exhausted` | Engine | A loop reached its round limit. Its `escalate.exhausted` or `on-max` policy determines what happens next. |
| `skipped` | Engine | `when` did not match. The run continues and the step produces no outputs. |

A step returns `ok` or the non-success outcomes declared by its [kind](workflow-kinds.md). The engine refuses agent results of `exhausted`, `skipped` or the retired `needs-human` spelling. First runtime reads migrate stored `needs-human` statuses in run state and telemetry to `needs-decision`.

Use `<step>.status` in `when` to read an earlier outcome. This also accepts the status of a completed loop. A skipped producer leaves the status absent, so its reader is skipped. To retry with a stronger model, add a later step with another alias and guard it with the earlier failure status.

```yaml
escalate:
  failed: continue
  blocked: stop
  needs-decision: { do: stop, comment: 'Decision needed: {reason}' }
```

`continue` records the outcome and moves on in file order. `stop` fails the run on `failed` and parks it on `blocked`, `needs-decision` or explicit `exhausted`. A final failed step still makes the run failed when no step follows. Set `on-failed` or `escalate.failed` to the same action when both appear. `on-max: escalate` agrees with `escalate.exhausted: stop`. `on-max: fail` preserves its original hard failure when used alone.

A gate returns `blocked` when it cannot read a required platform fact. A command or check that runs and finds a problem returns `failed`.

The long form also posts to the card. `{reason}` substitutes the step reason or `no reason given` when absent. Retrying the same outcome at the same step and round reuses the comment. The action still applies if the host cannot write the comment, and the run reports the failure.

## Card assignment

When implementing a card directly, omit `$assignee` to claim an unassigned card as the authenticated runner. Use `$assignee=<login>` to assign that user or `$assignee=@me` to assign yourself, even if someone else holds the card. Use `$assignee=none` to leave assignment unchanged.

```text
/pair-process-implement $story=123
/pair-process-implement $story=123 $assignee=alice
/pair-process-implement $story=123 $assignee=none
```

In a workflow, `assign` applies when a step starts. `me` claims an unassigned card as the authenticated runner and skips a card held by another login. A login explicitly assigns that user, `none` leaves assignment unchanged, and `unassign` clears it.

For an `implement` step with no effective `assign`, the host uses `me`. The host checks ownership before applying the step's start state or launching the implementation skill.

In this `quick.yaml`, implementation inherits `me`, review assigns Alice, and the final gate clears assignment when it starts.

```yaml
version: 1
name: quick
assign: me
aliases: { build: { effort: medium }, judge: { effort: high } }
steps:
  implement: { kind: implement, alias: build }
  review: { kind: review, alias: judge, assign: alice, on-failed: continue }
  checks: { kind: gate, assign: unassign, with: { checks: [review-approved] } }
```

A configuration's step value takes precedence over its default, followed by the workflow's step value and then its default. The run prints the resolved value and source. This override leaves assignment unchanged at every step of the example. The command uses `pair` as a local alias for the installed `pair-cli` command.

```bash
pair run quick --card 123 --config-override '{"assign":"none"}'
```

See [workflow configuration](workflow-configuration.md) for configuration files and overrides.

## Rules

- YAML 1.2, declarative only: an anchor, an alias, a tag or a duplicate key is an error.
- An unknown version, top-level key, step key, kind or `with` key is an error.
- An empty `steps` is an error.
- Every error names the file, the line, the key and the fix:

```text
quick.yaml:10: steps.review.kind: unknown value "merge" — fix: use one of "implement", "review", "fix", "generic", "gate", "approval", "merge", "loop"
```

Version 1 rejects `args`, `context`, `prompt` and `goto`. File order governs routing.

## Validation

Validate a workflow by name or file without launching a run:

```bash
pair-cli workflow validate quick
```

`pair-cli run <workflow> --dry-run` also validates and previews the run's configuration. Validation has two parts.

| Part      | What is checked                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------- |
| Form      | The rules above.                                                                                  |
| Coherence | `skill` names an installed skill; a `generic` step has `skill` unless it includes a workflow with `uses`. |
| Coherence | Every input of a step is a launch argument (`--card`) or an output of an earlier step.            |
| Coherence | Every key under `with` is declared by the kind.                                                   |
| Coherence | Gate keys and `target:<name>` resolve through the Custom Gate Registry. Project-owned inline commands use `command:<shell line>`. |
| Coherence | A `gate` has `gates` or `checks`. `when.output` names an earlier step with the named output or `status`. A loop and its `until` child cannot use `when`. |
| Coherence | Escalation keys and actions must be known. Explicit rules and shorthands must agree. |
| Coherence | Every text under `with` is short plain text: no backtick, no `$(`, no line break.                 |

An error refuses the workflow. A warning does not.

| Warning | When |
| ------- | ---- |
| `on-failed: continue` on the last step | Nothing consumes the failure. |
| Unhandled return | A declared return has neither an escalation rule nor a matching shorthand. |
| Unreachable rule or status condition | The step cannot produce that outcome, or the condition cannot read it. |
| Card comment unavailable | The installed host lacks card-comment support. |
| Decision or block continued before merge | A `merge` follows with no prior approval step. |

## Worked examples

### Quick uses the default routing

A review that requests changes continues into the fix. [quick.yaml](workflow-examples/quick.yaml)

```yaml
version: 1
name: quick
aliases:
  build: { effort: medium }
  judge: { effort: high }
steps:
  implement: { kind: implement, alias: build, escalate: { failed: stop, blocked: stop, needs-decision: stop } }
  review: { kind: review, alias: judge, on-failed: continue, escalate: { blocked: stop, needs-decision: stop } }
  fix:
    kind: fix
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
    alias: build
    when: { output: review.verdict, is: [changes-requested] }
```

### Escalating retries with another model

Only a failed first implementation starts the stronger implementation. [escalating.yaml](workflow-examples/escalating.yaml)

```yaml
version: 1
name: escalating
aliases:
  cheap: { engine: claude, model: claude-haiku-5-5, effort: medium }
  strong: { engine: claude, model: claude-opus-5-5, effort: high }
steps:
  implement:
    kind: implement
    alias: cheap
    escalate: { failed: continue, blocked: stop, needs-decision: stop }
  implement-strong:
    kind: implement
    alias: strong
    when: { output: implement.status, is: [failed] }
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
  review: { kind: review, alias: strong, escalate: { failed: stop, blocked: stop, needs-decision: stop } }
```

### Converge takes a final pass after exhaustion

A decision can stop before the loop starts. Exhaustion selects the fallback. A final failure stops the run and posts a card comment. [converge.yaml](workflow-examples/converge.yaml)

```yaml
version: 1
name: converge
aliases:
  build: { effort: medium }
  judge: { effort: medium }
  strong: { effort: high }
steps:
  implement:
    kind: implement
    alias: build
    escalate:
      failed: stop
      blocked: stop
      needs-decision: { do: stop, comment: 'A choice is needed: {reason}' }
  rounds:
    kind: loop
    until: review
    max: 3
    escalate: { exhausted: continue }
    steps:
      review:
        kind: review
        alias: judge
        escalate: { failed: continue, blocked: stop, needs-decision: stop }
      fix:
        kind: fix
        escalate: { failed: continue, blocked: stop, needs-decision: stop }
        alias: build
        when: { output: rounds/review.verdict, is: [changes-requested] }
  last-chance:
    kind: fix
    alias: strong
    when: { output: rounds.status, is: [exhausted] }
    escalate:
      failed: { do: stop, comment: The fix does not converge after the final round. }
      blocked: stop
      needs-decision: stop
```

### Delivery skips approval and merge on a blocked gate

The example simulates a gate that reports blocked. Approval and merge start only when the gate succeeds. [delivery.yaml](workflow-examples/delivery.yaml)

```yaml
version: 1
name: delivery
steps:
  implement:
    kind: implement
    escalate:
      failed: stop
      blocked: stop
      needs-decision: { do: stop, comment: 'Decision needed: {reason}' }
  review: { kind: review, escalate: { failed: stop, blocked: stop, needs-decision: stop } }
  gate:
    kind: gate
    with: { checks: [head-unchanged] }
    escalate: { blocked: continue }
  approval:
    kind: approval
    escalate: { failed: stop, needs-decision: stop }
    when: { output: gate.status, is: [ok] }
  merge:
    kind: merge
    when: { output: gate.status, is: [ok] }
```

## What a run leaves on disk

```text
.pair/working/runs/<run-id>/
  run.lock              one process per run
  workflow.yaml         the workflow, frozen when the run started
  state.json            the state and the outputs of each step
  steps/<step-id>/
    result.json         the validated result of the step
    output.log          the final message of the agent
```

`<run-id>` defaults to `<workflow>-<card>`. A step starts `pending`, becomes `running` when launched and ends with one of the recorded [outcomes](#outcomes-and-escalation).

| When                                | What happens                                                      |
| ----------------------------------- | ----------------------------------------------------------------- |
| The run fails | The command prints the reason and exits `1`. |
| The run parks | The command exits `0` and prints the reason and resume command. |
| A stopped step resumes | The run starts at the stopped step and preserves earlier completed and continued outcomes. Use `--more-rounds` for a parked exhausted loop. |
| The workflow file changed meanwhile | The run uses the frozen copy and reports the change. |
| The run is complete                 | Nothing runs. `--restart` archives the directory and starts over. |
