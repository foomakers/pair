# The `quick` workflow

`quick` implements a card, reviews the result, fixes findings when needed and runs the PR gate. The seeded project workflow uses the `increment` and `pr` targets in the Custom Gate Registry.

```bash
pair-cli run quick --card 627
```

## The file

```yaml
version: 1
name: quick
description: Implement a card, review it and fix the findings.
# Defaults name no engine or model: the configuration sets them, so quick runs unedited on any engine.
aliases:
  build: { effort: medium }
  judge: { effort: high }
steps:
  implement:
    kind: implement
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
    alias: build
    gates: [target:increment]
  review:
    kind: review
    alias: judge
    on-failed: continue
    escalate: { blocked: stop, needs-decision: stop }
  fix:
    kind: fix
    escalate: { failed: stop, blocked: stop, needs-decision: stop }
    alias: build
    gates: [target:increment]
    when: { output: review.verdict, is: [changes-requested] }
  gate:
    kind: gate
    with: { gates: [target:pr] }
```

`implement` and `fix` run with the alias `build`, `review` with `judge`. A configuration sets their engine, model and effort: `pair-cli run quick --card 627 --config codex`. See [workflow-configuration.md](workflow-configuration.md).

| Step        | Kind        | Skill                    | What it does                                      |
| ----------- | ----------- | ------------------------ | ------------------------------------------------- |
| `implement` | `implement` | `pair-process-implement` | Implements the card, opens the PR.                |
| `review`    | `review`    | `pair-process-review`    | Reviews that PR at the head `implement` returned. A blocking finding does not stop the run (`on-failed: continue`). |
| `fix`       | `fix`       | `pair-process-fix`       | Runs when the review requests changes. It fixes the findings and pushes. |
| `gate`      | `gate`      | Runs in the host.        | Runs the registry's `pr` target. |

The grammar is in [workflow-grammar.md](workflow-grammar.md), the kinds in [workflow-kinds.md](workflow-kinds.md).

## Before the first run

- Use a Ready card.
- The skills `pair-process-implement`, `pair-process-review` and `pair-process-fix` are installed.
- The project registry supplies the `increment` and `pr` targets. The seeded registry assigns `formatting` to both. Point the registry commands at the checks your project uses.

Validate the definition with `pair-cli workflow validate quick`. Use `--dry-run` to preview settings and step order. A real run reads the card and refuses a missing or closed card.

```bash
pair-cli run quick --card 627 --dry-run
```

## How it ends

| Outcome                           | Exit | What to do                                             |
| --------------------------------- | ---- | ------------------------------------------------------ |
| The PR gate succeeds | 0 | Review the resulting PR. |
| An unhandled failure stops the run | 1 | Read the reason and run the same command after addressing it. |
| A step is `blocked` or `needs-decision` | 0 | Resolve the missing prerequisite or decision, then use the printed resume command. |

The review's `on-failed: continue` keeps its verdict available to `fix`. A different routing policy can use [`escalate` and `when`](workflow-grammar.md#outcomes-and-escalation).

## Change it

Edit `.pair/adoption/tech/workflows/quick.yaml` in your project. The project copy takes precedence. Keep `name` equal to the file name when renaming or copying a workflow. If the project has no adopted Quick, the command uses the [portable Quick example](workflow-examples/quick.yaml), which uses the original three steps and needs no gate targets.

To change the attached checks, edit `gates` on `implement` and `fix`. Edit `with.gates` on `gate` to choose the final checks. Validation reports unknown registry keys and targets.
