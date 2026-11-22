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
| `skill` | Only for `generic`          | The skill that runs. A typed kind has a default skill; `skill` replaces it.     |
| `with` | No                           | Options of the step. The kind declares the keys it accepts.                     |
| `on-failed` | No                      | `stop` (default) or `continue`: what a `failed` step does to the run.           |
| `alias` | No                          | One of `aliases`: the settings the step runs with. A step citing an undeclared alias is an error. |

A step id starts with a lower-case letter and continues with lower-case letters, digits and hyphens: it names a directory of the run.

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

## Rules

- YAML 1.2, declarative only: an anchor, an alias, a tag or a duplicate key is an error.
- An unknown version, top-level key, step key, kind or `with` key is an error.
- An empty `steps` is an error.
- Every error names the file, the line, the key and the fix:

```text
quick.yaml:10: steps.review.kind: unknown value "merge" — fix: use one of "implement", "review", "fix", "generic", "loop"
```

Not in version 1: `context`, `interactive`, `prompt`, `gate`, `approval`, `merge`, `when`, and a step that uses another workflow.

## Validation

A workflow is validated before any step is launched, and by `--dry-run`, which launches nothing. Validation has two parts.

| Part      | What is checked                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------- |
| Form      | The rules above.                                                                                  |
| Coherence | `skill` names an installed skill; a `generic` step has `skill`; `uses` is refused (it is for including a workflow). |
| Coherence | Every input of a step is a launch argument (`--card`) or an output of an earlier step.            |
| Coherence | Every key under `with` is declared by the kind.                                                   |
| Coherence | Every key in `with.gates` is a `Key` of the Custom Gate Registry in `way-of-working.md`.          |
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
