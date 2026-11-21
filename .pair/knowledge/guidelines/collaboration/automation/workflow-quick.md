# The `quick` workflow

`quick` implements a card and reviews the result. It ships with pair and needs no configuration.

```bash
pair-cli run quick --card 627 --autonomous
```

## The file

```yaml
version: 1
name: quick
description: Implement a card and review the result.
steps:
  implement:
    kind: implement
  review:
    kind: review
```

| Step        | Kind        | Skill                    | What it does                                      |
| ----------- | ----------- | ------------------------ | ------------------------------------------------- |
| `implement` | `implement` | `pair-process-implement` | Implements the card, opens the PR.                |
| `review`    | `review`    | `pair-process-review`    | Reviews that PR at the head `implement` returned. |

The grammar is in [workflow-grammar.md](workflow-grammar.md), the kinds in [workflow-kinds.md](workflow-kinds.md).

## Before the first run

- The card is Ready. No command checks this: it is yours to verify.
- The skills `pair-process-implement` and `pair-process-review` are installed.

`--dry-run` launches nothing and checks two things: the skills the workflow uses are installed, and every gate key the workflow names is in the Custom Gate Registry. It does not read the card; a real run does, and refuses one that is missing or closed.

```bash
pair-cli run quick --card 627 --dry-run
```

## How it ends

| Outcome                           | Exit | What to do                                             |
| --------------------------------- | ---- | ------------------------------------------------------ |
| Both steps `ok`                   | 0    | The PR is reviewed and approved. Merging is yours.     |
| `review` has a blocking finding   | 1    | Fix the findings, then run the same command again.     |
| A step needs a person             | 0    | Do what the output asks, then run the resume command.  |

`quick` never merges.

## Change it

Copy the file to `.pair/adoption/tech/workflows/quick.yaml` and edit it there: the project copy wins over the shipped one. A copy under another name is another workflow: `name` must equal the file name.

To run gates before the push, list them under `with.gates` of the `implement` step in your copy. Each one is a `Key` of the Custom Gate Registry in `.pair/adoption/tech/way-of-working.md`: a key the registry lacks is refused, and the error names the key.
