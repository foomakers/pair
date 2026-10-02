---
'@pair/pair-cli': minor
---

`pair-cli run --parallel` becomes a portable loop: `--watch` / `--no-watch` / `--interval`, re-selection per iteration, `--root` optional with `--filter`, `--assignee` / `--status`, `--max-iterations`; skips escalated, locked and already-driven cards; stops at the Stop Predicate, the iteration cap or Ctrl-C. No change without the new flags.
