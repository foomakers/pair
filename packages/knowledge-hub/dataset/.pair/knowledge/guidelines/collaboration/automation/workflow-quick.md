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
    with:
      gates: [quality-gate]
  review:
    kind: review
```

| Step        | Kind        | Skill                    | What it does                                                    |
| ----------- | ----------- | ------------------------ | --------------------------------------------------------------- |
| `implement` | `implement` | `pair-process-implement` | Implements the card, runs the `quality-gate` gate, opens the PR. |
| `review`    | `review`    | `pair-process-review`    | Reviews that PR at the head `implement` returned.               |

The grammar is in [workflow-grammar.md](workflow-grammar.md), the kinds in [workflow-kinds.md](workflow-kinds.md).

## Before the first run

- The card is Ready.
- The skills `pair-process-implement` and `pair-process-review` are installed.
- The Custom Gate Registry in `.pair/adoption/tech/way-of-working.md` has a row whose `Key` is `quality-gate`. Without it the workflow is refused, and the error names the key. Either add the key to your gate, or change `gates` in your copy of the file.

Check all three without launching anything:

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
