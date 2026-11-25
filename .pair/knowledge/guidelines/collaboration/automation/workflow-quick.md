# The `quick` workflow

`quick` implements a card, reviews the result and fixes the findings. It ships with pair and needs no configuration.

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
    alias: build
    gates: [target:increment]
  review:
    kind: review
    alias: judge
    on-failed: continue
  fix:
    kind: fix
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
| `fix`       | `fix`       | `pair-process-fix`       | Fixes the findings of the review and pushes. With no blocking finding it finds nothing in scope and returns `ok`. |

The grammar is in [workflow-grammar.md](workflow-grammar.md), the kinds in [workflow-kinds.md](workflow-kinds.md).

## Before the first run

- The card is Ready. No command checks this: it is yours to verify.
- The skills `pair-process-implement`, `pair-process-review` and `pair-process-fix` are installed.

`--dry-run` launches nothing and checks two things: the skills the workflow uses are installed, and every gate key the workflow names is in the Custom Gate Registry. It does not read the card; a real run does, and refuses one that is missing or closed.

```bash
pair-cli run quick --card 627 --dry-run
```

## How it ends

| Outcome                           | Exit | What to do                                             |
| --------------------------------- | ---- | ------------------------------------------------------ |
| `fix` is `ok`                     | 0    | The findings are fixed and pushed. Merging is yours.   |
| `fix` is `failed`                 | 1    | A gate is red or a finding is not resolved: see the reason, then run the same command again. |
| A step needs a person             | 0    | Do what the output asks, then run the resume command.  |

The last step decides the run. `quick` never merges and does not review the fixes again.

## Change it

Copy the file to `.pair/adoption/tech/workflows/quick.yaml` and edit it there: the project copy wins over the shipped one. A copy under another name is another workflow: `name` must equal the file name.

To run gates before the push, list them under `with.gates` of the `implement` and `fix` steps in your copy. Each one is a `Key` of the Custom Gate Registry in `.pair/adoption/tech/way-of-working.md`: a key the registry lacks is refused, and the error names the key.
