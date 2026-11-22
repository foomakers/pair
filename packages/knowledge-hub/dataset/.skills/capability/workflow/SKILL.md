---
name: workflow
description: "Creates, configures and explains workflows from the validating grammar."
version: 0.1.0
author: Foomakers
---

# Workflow authoring

## Arguments

| Argument | Description |
| --- | --- |
| mode | `create`, `configure`, or `explain` |

Accept `create`, `configure`, or `explain`. First read `.pair/knowledge/guidelines/collaboration/automation/workflow-schema.md` and `workflow-kinds.md` in the same directory. Inspect project and shipped workflows and configurations, the project's mapping in `pair.config.json`, and installed skills. Use these references and files as the grammar, not memory. Use only installed skills; report a requested missing skill instead of inventing one. If a request cannot be expressed, name what is missing and propose the closest alternative, saying what it covers and what it does not.

If `pair-cli` is unavailable, propose installing pair-cli and stop validation until it is available.

## Validate

Validate in an isolated temporary project outside any Git repository. Resolve the launcher’s main checkout: use the current checkout if it is the main checkout; in a linked worktree use `git config --path --get pair.mainCheckout` when set, otherwise the parent of `git rev-parse --path-format=absolute --git-common-dir`. Verify it is the main checkout; if Git discovery fails because this is a non-Git directory, use the current directory. If Git identifies a repository but main-checkout resolution fails, stop. Copy the main checkout `.pair/adoption/tech/way-of-working.md` into the temporary project (including its absence), so gate keys and targets match. Copy named workflows and named configurations from the main checkout into the temporary project, preserving their paths and absence. Copy the current directory project’s `pair.config.json`, installed skill references, path-selected files and other relevant settings there, preserving paths and relative references; do not overwrite the main checkout registry or named files. The launcher searches an explicit workflow path in the current directory before named workflows in the main checkout and shipped defaults; configuration paths resolve from the current directory, while configuration names resolve from the main checkout then shipped defaults. Preserve those precedence rules and absence when staging, including mappings from `pair.config.json`. Place the proposed workflow under `.pair/adoption/tech/workflows/<workflow>.yaml`, and use that project as the working directory. Run:

```sh
pair-cli run <workflow> --card 1 --dry-run
```

For a proposed configuration, place its temporary copy in the isolated project and add `--config <temporary-configuration>` to the command. Preserve the intended filename and project context so the launcher resolves the same skills, gates and settings. Correct errors and validate again, at most three times; if errors remain, show them and stop. Never write an invalid file. Show warnings and obtain confirmation before writing. Show a diff before replacing an existing file. Copy only the validated temporary file after an explicit yes to its approved destination in the main checkout for a named workflow or configuration; explicit paths resolve from the current directory. Shipped files are never edited; create a project override instead.

## Create

If no starting point is named, propose the closest shipped workflow. Ask only unanswered questions, one at a time with a recommendation; do not ask about defaults. Show the complete YAML and explain the same content in words. Validate it as above, then write the approved copy to the main checkout `.pair/adoption/tech/workflows/`. Offer `configure`, then print the in-session workflow launch skill if installed and `pair-cli run <workflow> --card <id>` for the terminal.

## Configure

Start with the configuration mapped to the workflow, or a shipped one. Use the generated schema to propose changes. Show the complete proposal and validate it with the workflow as above. Apply the same retry limit, installed-skill, warning, diff, explicit yes and no-invalid-file rules as create. Show the diff to `pair.config.json` and obtain approval before updating the workflow's configuration mapping. Never edit shipped files.

## Explain

Read the workflow and its configuration. Validate them and use the resolved dry-run view to explain each step, its skill, engine and model, and every point where a human is asked. Report validation errors or warnings instead of silently guessing.
