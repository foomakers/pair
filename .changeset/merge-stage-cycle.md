---
'@pair/knowledge-hub': minor
---

Delivery cycle: `merge` is a stage of the cycle itself. `cycle-state.mjs resolve` offers it only when `## Auto-Advance` names the card's tier; `cycle-merge.mjs` (a script, no agent) re-verifies tier, remote head and `pair-review` / `pair-explicit-approval` conclusions, then merges and closes the story or parks the card with a comment on it. `pair-loop` delegates to it instead of deciding inline. Default (no `## Auto-Advance`) is unchanged: no automatic merge.
