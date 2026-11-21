# ADR-034: Workflow configuration: files, model ids, replace not merge

## Status

Accepted

## Date

2026-11-21

## Context

- Story #672 (epic #641). A workflow run (`pair run <workflow>`, ADR-031) launched every step on one engine and its default model.
- The delivery cycle has its own system: JSON profiles, `workflowProfiles`, `## Model Policy` and model classes (ADR-030). Two systems side by side confuse; #700 deletes the old one.
- The story named "ADR-033", which #697 took for the telemetry file (ADR-033). This is the next free number.

## Options Considered

1. Extend the JSON profiles to workflows — keeps one system, but carries model classes and stage names that a workflow does not have.
2. New configuration files in the adoption tree, with real model ids — chosen.
3. Per-step `engine` / `model` / `effort` inside the workflow file — one workflow could not run on two engines unedited.

## Decision

- A configuration is a YAML file, `.pair/adoption/tech/configurations/<name>.yaml`: `defaults` (required), `aliases`, `steps`, `telemetry`. Same parsing rules as a workflow: YAML 1.2, no anchors, tags or duplicate keys, unknown keys are errors.
- A workflow declares `aliases` (name → default `engine`, `model`, `effort`); each step cites one with `alias`. A configuration defines those aliases instead of kinds. A step citing an undeclared alias, and a configuration alias the workflow does not declare, are errors.
- Per field (`engine`, `model`, `effort`): configuration `steps.<id>` > configuration `aliases.<alias>` > the workflow's default for the alias > configuration `defaults`. The run prints each value with its source.
- `model` is the real model id. There are no model classes; they return only if #707 needs them.
- The knowledge base ships defaults with the same names. A project file with the same name **replaces** the knowledge-base file entirely: no merge between the two. The same rule holds for workflows.
- Which file runs: `--config <name|file>`, then `pair.config.json` `workflows.<workflow>.configuration`, then `workflows.default.configuration`. `configuration` is a name or a map engine → name. `--engine` picks the entry of that engine and never changes values inside a file.
- `--config-override '<json>'` is deep-merged over the selected file and validated like a file. There are no `--model` / `--effort` flags.
- The effective configuration is frozen in the run directory (`configuration.yaml`); a resume uses it and reports a changed source. `--reconfigure` replaces it and records it in `state.json`. Steps already `ok` are not run again.
- Engine facts (installed, model list, effort support) come from the host through an injected interface; the package holds no engine table. No engine declares a model list today: a model id is checked by its form only, with a warning; a misspelt id fails at launch. A list turns the check into an error.
- The new path reads only `configurations/*.yaml` and the `workflows` key. The old path (`pair run --card N`) keeps reading the profiles. Neither reads the other's files; no conversion at run time. Supersedes ADR-030 when #700 deletes the profiles.

## Consequences

- One workflow runs on different engines and budgets with no edit.
- A mixed-engine run is possible (`aliases.judge.engine: codex`); the host asks each step's engine for its invocation style.
- Six shipped configurations are written by hand from the six profiles; they can drift from the profiles until #700. Two base configurations, `claude` and `codex`, equal the medium ones. All define `build` and `judge`, the aliases of `quick`.
- A workflow meant for any engine leaves `engine` and `model` out of its alias defaults.
