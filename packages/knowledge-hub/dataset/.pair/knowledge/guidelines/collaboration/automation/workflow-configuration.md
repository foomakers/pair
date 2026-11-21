# Configuration of a workflow run

A configuration sets the engine, the model and the effort of each step of `pair run <workflow>`. One workflow runs on different engines and budgets with no edit.

## The file

`.pair/adoption/tech/configurations/<name>.yaml`; the knowledge base ships defaults with the same names. A project file replaces the knowledge-base file of the same name entirely: there is no merge.

```yaml
version: 1
name: claude-medium # equals the file name without extension
defaults: # required
  engine: claude
  model: claude-sonnet-5-5
  effort: medium
aliases: # optional; defines aliases the workflow declares
  build: { model: claude-sonnet-5-5, effort: medium }
  judge: { model: claude-opus-5-5, effort: high }
steps: # optional; an exception for one step id
  implement: { effort: high }
telemetry: true # optional; switches the run's telemetry on or off
```

- An entry takes `engine`, `model`, `effort`. `defaults` needs `engine`.
- `model` is the real model id. There are no model classes.
- Same parsing rules as a workflow: YAML 1.2, no anchors, tags or duplicate keys. Unknown keys are errors.

## Aliases

The workflow declares its aliases, each with a default, and each step cites one with `alias`:

```yaml
aliases:
  build: { effort: medium }
  judge: { effort: high }
steps:
  implement: { kind: implement, alias: build }
  review: { kind: review, alias: judge }
```

- A workflow declares only as many aliases as it needs different settings. A step with no `alias` takes the configuration `defaults`.
- A step citing an undeclared alias, and a configuration alias the workflow does not declare, are errors.
- A workflow meant for any engine leaves `engine` and `model` out of its defaults: the configuration sets them.
- `quick` declares `build` (implement, fix) and `judge` (review).

## Settings of a step

Per field: configuration `steps.<id>`, then configuration `aliases.<alias>`, then the workflow's default for the alias, then configuration `defaults`. The run prints each value with its source (`step`, `alias`, `workflow`, `defaults`):

```text
review: engine=claude (alias) model=claude-opus-5-5 (alias) effort=high (alias)
```

Different engines in one run are allowed.

## Which configuration runs

1. `--config <name|file>`
2. `pair.config.json` `workflows.<workflow>.configuration`
3. `pair.config.json` `workflows.default.configuration`
4. None: the engine from the usual cascade with its default model; the run says so.

```json
"workflows": {
  "default": { "configuration": { "claude": "claude-medium", "codex": "codex-medium" } },
  "quick": { "configuration": "claude-cheap" }
}
```

`configuration` is a name, or a map engine → name. `--engine <id>` picks that engine's entry; it never changes values inside a file. A configuration whose `defaults.engine` differs from `--engine` is refused before any launch.

## Override

`--config-override '<json>'` is deep-merged over the selected configuration, validated like a file and recorded in `state.json`. With no configuration selected it must hold a complete `defaults`. There are no `--model` or `--effort` flags.

## Validation

| Case                                                       | Result                       |
| ---------------------------------------------------------- | ---------------------------- |
| Unknown key, unknown field, wrong type                     | error                        |
| `aliases` names an alias the workflow does not declare     | error                        |
| A step cites an alias the workflow does not declare        | error                        |
| `steps` names an id the workflow lacks                     | warning                      |
| `model` not in the list the engine declares                | error                        |
| Engine declares no model list (every engine today)         | form check, and a warning    |
| `effort` on an engine with no effort flag                  | warning, value ignored       |
| An engine used by a step is unknown or not installed       | refused before any launch    |
| `defaults.engine` differs from `--engine`                  | error                        |

`pair run <workflow> --dry-run --config <name|file>` runs the same checks and launches nothing.

No engine declares a model list today, so a model id is checked by its form only: a misspelt id passes with a warning and fails at launch.

## Frozen copy and resume

The run writes the effective configuration to `runs/<run-id>/configuration.yaml`. A resume uses the copy and warns when the source changed. `--reconfigure` (with `--config` and/or `--config-override`) replaces the copy; steps already `ok` are not run again. A run started with no configuration has no copy and keeps the engine default; when one resolves on resume, the run warns, and `--reconfigure` applies it.

## Shipped set

`claude-cheap`, `claude-medium`, `claude-high`, `codex-cheap`, `codex-medium`, `codex-high`: the six profiles of the delivery cycle with each model class replaced by its model id. `claude` and `codex`: base configurations, equal to the medium ones (`pair run quick --config codex`). Each defines `build` and `judge`.

## Coexistence with profiles

`pair run --card N` keeps reading `workflow-profiles/*.json`, `workflowProfiles` and `## Model Policy`. `--profile` and `--workflow-config` are valid only there; `--config`, `--config-override` and `--reconfigure` only with a workflow name. Mixing them is an error. See ADR-034 in the project adoption (`adoption/tech/adr/`).
