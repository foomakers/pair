---
'@pair/pair-cli': patch
---

`pair-cli run`: a profile stage's `effort` now reaches `claude` (`--effort`) and `codex` (`-c model_reasoning_effort`, `xhigh`/`max` mapped to `high`); engines without a verified flag warn once and the table marks the stage `ignored`. `--profile` / `--workflow-config` now work with `--root` / `--parallel` / `--watch` and are forwarded to every child card; an unknown profile halts `profile-unresolved` before any child spawns.
