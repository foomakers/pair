---
'@pair/pair-cli': minor
---

run: `--cards a,b,c` runs an ordered card list serially, each via its own `--card` lifecycle; unfinished retryable cards are retried in passes when board, linked PR, or cycle state advances. A Pair review conclusion counts when its ready-to-merge label and successful check agree, without requiring a native approval. Card completion is read just before dispatch, so a card finished during an earlier run is skipped. Successful preparation stays retryable; completed and terminal cards do not retry. A no-progress pass stops with per-card reasons, and a safety failure halts at once. Pass cap = `--max-iterations`; exit 0 all at target / 1 any failed / 2 usage. CLI help and `reference/cli/commands.mdx` updated.
