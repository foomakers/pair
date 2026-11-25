# Refinement workflow

Run `pair-cli run refinement --card 12`, `pair-cli run refinement --card 12,15,9`, or `pair-cli run refinement --root 641`. A root selects its open direct children. `--filter <label>` selects open cards by label or narrows an explicit list or root. `--status` and `--assignee` narrow the selection further.

```yaml
select:
  filter:
    status: [Draft]
  order: [priority, number]
```

A configuration can override the workflow's `filter` and `order` independently. Filters combine keys with AND and match any value in a list. Order applies only among startable cards. Set `parallel` in the configuration, or pass `--parallel N`. With neither, one card runs at a time. An explicit mapping in `pair.config.json` lets `pair-cli run --card 12` choose the first named workflow whose effective filter accepts that card.

The shipped workflow runs autonomous refinement followed by task breakdown. It records evidence-backed answers under `## Assumptions` and parks the card on unresolved product decisions. Its refinement step uses `state: none` so the task-breakdown step moves the card to Ready.

Declared prerequisites combine with the tracker’s native links. Dependencies inside the selection must finish before the dependent card starts. Outside dependencies are reported. A cycle refuses the selection before launch. Each card has its own run and worktree. The command prints the outcomes and writes `summary.json` under `.pair/working/runs/`. Exit code 1 means a card failed. Repeat the command to resume incomplete work and skip completed cards.
