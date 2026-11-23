# Workflow grammar — version 1

A **workflow** is a YAML file of typed steps. `pair-cli run <workflow> --card <id>` runs its steps on one card, one at a time, in file order. The file is the process: what runs, in which order, with which skill and options.

The step kinds are in [workflow-kinds.md](workflow-kinds.md). The workflow that ships with pair is in [workflow-quick.md](workflow-quick.md).

## Where a workflow lives

`pair-cli run <workflow>` takes the argument as:

1. a path, when that file exists;
2. else `.pair/adoption/tech/workflows/<name>.yaml` of the project;
3. else the knowledge-base default of that name.

A project changes a shipped workflow by editing its copy under `.pair/adoption/tech/workflows/`.

## The file

```yaml
version: 1
name: quick
description: Implement a card and review the result.
steps:
  implement:
    kind: implement
    with:
      gates: [quality-gate]
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

Each step:

| Key    | Required                     | Meaning                                                                         |
| ------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `kind` | Yes                          | `implement`, `review`, `fix`, `generic` or `loop`. |
| `uses` | No | Name of a workflow to include in place of this step. |
| `skill` | Only for `generic`          | The skill that runs. A typed kind has a default skill; `skill` replaces it.     |
| `with` | No                           | Options of the step. The kind declares the keys it accepts.                     |
| `on-failed` | No                      | `stop` (default) or `continue`: what a `failed` step does to the run.           |
| `alias` | No                          | One of `aliases`: the settings the step runs with. A step citing an undeclared alias is an error. |

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

The expanded IDs are `fix/repair`, then `fix/check`. `outputs.from` selects `repair`; without it the last step supplies outputs. A typed caller requires the selected step to supply its kind's outputs; a generic caller skips that check. `with` applies to the selected step when it has the caller's kind; `on-failed` applies to the last step. `context`, `prompt`, `interactive`, `when`, `gates` and `state` are rejected on a caller; put them on included steps instead.

Includes may nest up to three levels; cycles, unknown names and workflow/skill name clashes fail validation. An include may introduce a loop outside a loop, but loops cannot nest, including through an include. Configuration can target expanded IDs such as `fix/repair`. `--dry-run` shows the expanded order; a run freezes it and warns on resume if an included source changes.

### Loop

```yaml
steps:
  rounds:
    kind: loop
    until: review
    max: 3
    on-max: escalate
    steps:
      review: { kind: review }
      fix: { kind: fix }
```

`until` names a child step. `max` is a positive number of rounds started. `on-max` is `escalate` (park with the last `until` output) or `fail`. All three keys and a non-empty `steps` map are required. Child ids are addressed as `rounds/review` and `rounds/fix`.

An `ok` result from `until` exits immediately, skipping later steps. A failed `until` lets later steps receive its outputs. A failed other step ends the round. `needs-human` parks at the same step and round. On an exhausted escalation, a plain relaunch does nothing; `--more-rounds <n>` grants and records further rounds. Nested loops and `on-failed` inside a loop are errors. Each child result is saved under `steps/<loop>/<child>/round-<n>/result.json`.

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

- **`gate`**: `gates` are keys of the Custom Gate Registry, run in the card worktree in the given order (never a shell line). `checks` are `ci-green` (waits, 30 minutes by default, `with.timeout-minutes`), `head-unchanged`, `review-approved`, `prerequisites-done`. The first failure fails the step with the command output or the check's reason. At least one of `gates` or `checks`.
- **`approval`**: parks the run and comments once on the card. Resume a parked step with `--approve <card>` or `--reject "reason"`, a card comment starting `/approve` or `/reject reason`, a native PR review. An answer counts only when the platform authorizes its author; others are ignored and reported. The workflow holds no names. A moved PR head requires a fresh approval.
- **`merge`**: merges the PR (`squash` default, `merge`, `rebase`), closes the story, cascades, cleans up. Fails `head-moved` if the PR head is not the `head` it received, and with the platform's reason if the platform refuses. Requires the same head in the review, `head-unchanged` gate and approval results. GitHub remains the authority for required checks. After a confirmed merge, the host closes and cascades the card, confirms Done and cleans up the branch. An incomplete closure can be resumed without merging twice.

### `when` and `skipped`

```yaml
  approve:
    kind: approval
    when: { has: [risk:red, risk:yellow] }
  fix:
    kind: fix
    when: { output: review.verdict, is: [changes-requested] }
```

`when` is valid on any step except a loop and the `until` step of a loop. Card facts: `has`, `lacks`, `status`, `assignee` (AND between keys, any-of inside a list), read when the step is about to start. Output form: `output: <step>.<name>` (a loop child is `loop/step.name`) with `is: [...]`. A step whose `when` does not match is `skipped`: a sixth state, shown in the output, producing no outputs, and the run goes on. A later step that needs an output only a skippable step produces is an error. A transition is a deterministic `when`, not a prompt.

## Rules

- YAML 1.2, declarative only: an anchor, an alias, a tag or a duplicate key is an error.
- An unknown version, top-level key, step key, kind or `with` key is an error.
- An empty `steps` is an error.
- Every error names the file, the line, the key and the fix:

```text
quick.yaml:10: steps.review.kind: unknown value "merge" — fix: use one of "implement", "review", "fix", "generic", "gate", "approval", "merge", "loop"
```

Not in version 1: `context`, `interactive` and `prompt`.

## Validation

A workflow is validated before any step is launched, and by `--dry-run`, which launches nothing. Validation has two parts.

| Part      | What is checked                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------- |
| Form      | The rules above.                                                                                  |
| Coherence | `skill` names an installed skill; a `generic` step has `skill` unless it includes a workflow with `uses`. |
| Coherence | Every input of a step is a launch argument (`--card`) or an output of an earlier step.            |
| Coherence | Every key under `with` is declared by the kind.                                                   |
| Coherence | Every key in `with.gates` is a `Key` of the Custom Gate Registry in `way-of-working.md`.          |
| Coherence | A `gate` has `gates` or `checks`; `when.output` names an earlier step and an output it declares; `when` is not on a loop or its `until` step. |
| Coherence | Every text under `with` is short plain text: no backtick, no `$(`, no line break.                 |

An error refuses the workflow. A warning does not.

| Warning | When |
| ------- | ---- |
| `on-failed: continue` on the last step | Nothing consumes the failure. |

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

`<run-id>` defaults to `<workflow>-<card>`. A step is `pending`, `running`, `ok`, `failed` or `needs-human`.

| When                                | What happens                                                      |
| ----------------------------------- | ----------------------------------------------------------------- |
| A step is `failed`                  | The run stops and the command exits 1.                            |
| A step is `failed`, `on-failed: continue` | The failure is recorded and the next step runs with its outputs. The last step decides the run: `ok` ends it `done`, `failed` ends it `failed`. |
| A step is `needs-human`             | The run parks and the command exits 0, with the resume command, whatever `on-failed` says. |
| The run is launched again           | It resumes at the first step that is not `ok`.                    |
| The workflow file changed meanwhile | The frozen copy is used; a warning says so.                       |
| The run is complete                 | Nothing runs. `--restart` archives the directory and starts over. |
| `merge` with no `approval` step before it | The engine blocks nothing; the file says so. |
| `merge` with no `review` after the last `implement` or `fix` | Same. |
| `merge` with no `gate` carrying `head-unchanged` before it | Same. |
