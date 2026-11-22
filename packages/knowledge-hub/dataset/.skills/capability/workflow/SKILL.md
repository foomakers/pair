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

Accept `create`, `configure`, or `explain`. Run these from the project root, using the script alongside this skill:

```sh
node .claude/skills/pair-capability-workflow/scripts/workflow.mjs schema
node .claude/skills/pair-capability-workflow/scripts/workflow.mjs kinds
node .claude/skills/pair-capability-workflow/scripts/workflow.mjs list
```

Use the returned grammar, contracts, and available files; do not infer supported features from memory. Use only installed skills. Report a requested missing skill instead of inventing one. When a request cannot be expressed, say what is missing and propose the closest alternative, stating what it covers and what it does not.

## Create

If no starting point is named, propose the closest shipped workflow. Ask only unanswered questions, one at a time with a recommendation; do not ask about defaults. Show the complete YAML and explain the same content in words. Write the proposal to a temporary directory under its intended filename and run:

```sh
node .claude/skills/pair-capability-workflow/scripts/workflow.mjs validate <temporary-workflow>
```

Correct errors and validate again, at most three times; if errors remain, show them and stop. Never write an invalid file. Show validator warnings and obtain confirmation. Show a diff before replacing an existing file. Write the validated temporary copy to `.pair/adoption/tech/workflows/` only after an explicit yes. Shipped files are never edited; make a project file of the same name instead. Offer `configure`, then print the in-session workflow launch skill if installed and `pair run <workflow>` for the terminal.

## Configure

Start with the configuration mapped to the workflow, or a shipped one. Use the discovered configuration schema to propose changes. Show the complete proposal and validate a temporary copy against the workflow with `workflow.mjs validate <workflow> --config <temporary-configuration>`. Apply the same retry limit, installed-skill, warning, diff, explicit yes and no-invalid-file rules as create. Show the diff to `pair.config.json` and obtain approval before updating the workflow's configuration mapping. Never edit shipped files.

## Explain

Read the workflow and its configuration. Validate them and use the resolved view to explain each step, its skill, engine and model, and every point where a human is asked. Report validation errors or warnings instead of silently guessing.
