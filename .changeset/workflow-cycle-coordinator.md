---
'@pair/pair-cli': patch
---

New workflow skill `pair-workflow-cycle`: an in-session coordinator that drives one card's whole delivery cycle (`prepare → validate → implement → green → verify`), or just fix & review on an existing PR, from an interactive Claude Code or Codex session — with no dependency on Claude Code's `Workflow` tool. One stage per subagent, dispatched through the new `cycle-dispatch.mjs` (persistent story worktree, stage argument packet, harness realization probe), and every transition decided by `cycle-state.mjs resolve`. It owns no cycle rule and never merges; a host with no subagent primitive HALTs `realization-unavailable` and is handed the `pair-cli run --card` fallback.

`cycle-state.mjs` (shipped byte-identical in all six workflow skills) gains the cycle's rules as owned data: `CAPS` (the per-story dispatch and consecutive-redirect ceilings, now enforced by `resolve` itself), `policy.deadDispatchRetries`, the effective-inputs composition behind `inputs --story` (so every realization computes the same `$inputs` digest), and `CONTEXT_TABLE` — `next.context` on every transition, `fresh` by default and `reuse` admissible only within one agent role, refused fail-closed anywhere else.
