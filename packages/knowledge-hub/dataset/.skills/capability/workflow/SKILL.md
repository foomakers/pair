---
name: workflow
description: "Creates, configures and explains workflows from the validating grammar."
version: 0.1.0
author: Foomakers
---

# Workflow authoring

Accept `create`, `configure`, or `explain`. First read `.pair/knowledge/guidelines/collaboration/automation/workflow-schema.md` and `workflow-kinds.md` in the same directory. Inspect project and shipped workflows and configurations, the project's mapping in `pair.config.json`, and installed skills. Use these references and files as the grammar, not memory. Use only installed skills; report a requested missing skill instead of inventing one. If a request cannot be expressed, name what is missing and propose the closest alternative, saying what it covers and what it does not.

If `pair-cli` is unavailable, propose installing pair-cli and stop validation until it is available.

## Validate

Validate in an isolated temporary project: copy the project's relevant adoption files, configuration, installed skill references and `pair.config.json` there, place the proposed workflow under `.pair/adoption/tech/workflows/<workflow>.yaml`, and use that project as the working directory. Run:

```sh
pair-cli run <workflow> --dry-run
```

For a proposed configuration, place its temporary copy in the isolated project and add `--config <temporary-configuration>` to the command. Preserve the intended filename and project context so the launcher resolves the same skills, gates and settings. Correct errors and validate again, at most three times; if errors remain, show them and stop. Never write an invalid file. Show warnings and obtain confirmation before writing. Show a diff before replacing an existing file. Copy only the validated temporary file after an explicit yes. Shipped files are never edited; create a project override instead.

## Create

If no starting point is named, propose the closest shipped workflow. Ask only unanswered questions, one at a time with a recommendation; do not ask about defaults. Show the complete YAML and explain the same content in words. Validate it as above, then write the approved copy to `.pair/adoption/tech/workflows/`. Offer `configure`, then print the in-session workflow launch skill if installed and `pair run <workflow>` for the terminal.

## Configure

Start with the configuration mapped to the workflow, or a shipped one. Use the generated schema to propose changes. Show the complete proposal and validate it with the workflow as above. Apply the same retry limit, installed-skill, warning, diff, explicit yes and no-invalid-file rules as create. Show the diff to `pair.config.json` and obtain approval before updating the workflow's configuration mapping. Never edit shipped files.

## Explain

Read the workflow and its configuration. Validate them and use the resolved dry-run view to explain each step, its skill, engine and model, and every point where a human is asked. Report validation errors or warnings instead of silently guessing.
