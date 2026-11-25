---
name: pair-capability-workflow
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

Resolve the canonical absolute path to `scripts/workflow.mjs` from this skill's installed directory before changing directories. Keep it as `WORKFLOW_SCRIPT`. If the script is missing, stop and ask the user to update the installed skill. Use its `list` and `kinds` commands to inspect available files and step contracts.

## Validate

Resolve the launcher’s main checkout: use the current checkout if it is the main checkout; in a linked worktree use `git config --path --get pair.mainCheckout` when set, otherwise the parent of `git rev-parse --path-format=absolute --git-common-dir`. Verify it is the main checkout; if Git discovery fails because this is a non-Git directory, use the current directory. If Git identifies a repository but main-checkout resolution fails, stop.

Stage outside the real project. For a linked worktree, initialize a temporary Git repository, make an empty commit and add a temporary linked worktree; ensure Git resolves the temporary main checkout from that worktree, including by setting `pair.mainCheckout` to the temporary main if needed. When the current directory is the main checkout or a non-Git directory, use one temporary non-Git directory for both roots. Copy the main checkout `way-of-working.md` and named workflows and named configurations from the main checkout into the temporary main, preserving paths and absence. Copy the current directory project's `pair.config.json`, installed skill references, path-selected files and relevant settings into the temporary worktree, preserving paths and absence. Copy the installed skill files so their references resolve inside staging. Keep path-selected configurations in the temporary worktree even when a named configuration has the same relative path in the temporary main. Preserve relative references; translate absolute paths in the staged mapping to their corresponding temporary paths, without changing the proposed final mapping. Do not copy a main-only file into the worktree or vice versa.

Stage the proposed workflow at its intended main-checkout named path, or its intended explicit path in the temporary worktree. Stage a proposed configuration at its intended named path in the temporary main or path-selected location in the temporary worktree. Stage the proposed `pair.config.json` mapping in the temporary worktree. Run from the staged current root (the temporary worktree when linked) without `--config` so the proposed mapping is tested. Use the intended workflow name or relative path; translate an absolute workflow argument to the staged workflow path:

```sh
node "$WORKFLOW_SCRIPT" validate <workflow>
```

Preserve the intended filename and project context so the launcher resolves the same skills, gates and settings. Compare the absolute `file` in the JSON response with the staged proposal's resolved path to verify the resolved workflow file is the staged proposal before writing. If they differ or either path cannot be verified, stop. Correct errors and validate again, at most three times. If errors remain, show them and stop. Never write an invalid file. Show warnings and obtain confirmation before writing. Show a diff before replacing an existing file. Copy only the validated temporary file after an explicit yes to its approved destination in the main checkout for a named workflow or configuration. Explicit paths resolve from the current directory. Apply the approved mapping to the current directory's `pair.config.json`. Shipped files are never edited. Create a project override instead.

## Create

If no starting point is named, propose the closest shipped workflow. Ask only unanswered questions, one at a time with a recommendation. Skip questions about defaults. Show the complete YAML and explain the same content in words. Validate it as above, then write the approved copy to the main checkout `.pair/adoption/tech/workflows/`. Offer `configure`, then show `/pair-workflow-run <workflow> --card <id>` if installed and `pair-cli run <workflow> --card <id>` for the terminal.

## Configure

Start with the configuration mapped to the workflow, or a shipped one. Use the generated schema to propose changes. Show the complete proposal and validate it with the workflow as above. Apply the same retry limit, installed-skill, warning, diff, explicit yes and no-invalid-file rules as create. Show the diff to `pair.config.json` and obtain approval before updating the workflow's configuration mapping. Never edit shipped files.

## Explain

Read the workflow and its configuration. Use the validation response for each step's skill, engine and model. Use the same script's `expand` command to inspect included steps and identify where the workflow asks for a human response. Report any validation errors or warnings.
