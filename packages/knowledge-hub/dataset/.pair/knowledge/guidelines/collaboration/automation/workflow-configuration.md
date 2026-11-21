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
kinds: # optional; applies in any workflow
  review: { model: claude-opus-5-5, effort: high }
steps: # optional; an exception for one step id
  implement: { effort: high }
telemetry: true # optional; switches the run's telemetry on or off
```

- An entry takes `engine`, `model`, `effort`. `defaults` needs `engine`.
- `model` is the real model id. There are no model classes.
- Same parsing rules as a workflow: YAML 1.2, no anchors, tags or duplicate keys. Unknown keys are errors.

## Settings of a step

Per field: `steps.<id>`, then `kinds.<kind>`, then `defaults`. The run prints each value with its source:

```text
review: engine=claude (defaults) model=claude-opus-5-5 (kind) effort=high (kind)
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
| Unknown key, unknown kind, wrong type                      | error                        |
| `steps` names an id the workflow lacks                     | warning                      |
| `model` not in the list the engine declares                | error                        |
| Engine declares no model list                              | form check, and a warning    |
| `effort` on an engine with no effort flag                  | warning, value ignored       |
| An engine used by a step is unknown or not installed       | refused before any launch    |
| `defaults.engine` differs from `--engine`                  | error                        |

`pair run <workflow> --dry-run --config <name|file>` runs the same checks and launches nothing.

## Frozen copy and resume

The run writes the effective configuration to `runs/<run-id>/configuration.yaml`. A resume uses the copy and warns when the source changed. `--reconfigure` (with `--config` and/or `--config-override`) replaces the copy; steps already `ok` are not run again. A run started before configurations existed has no copy and keeps the engine default.

## Shipped set

`claude-cheap`, `claude-medium`, `claude-high`, `codex-cheap`, `codex-medium`, `codex-high`: the six profiles of the delivery cycle with each model class replaced by its model id.

## Coexistence with profiles

`pair run --card N` keeps reading `workflow-profiles/*.json`, `workflowProfiles` and `## Model Policy`. `--profile` and `--workflow-config` are valid only there; `--config`, `--config-override` and `--reconfigure` only with a workflow name. Mixing them is an error. See ADR-034 in the project adoption (`adoption/tech/adr/`).
