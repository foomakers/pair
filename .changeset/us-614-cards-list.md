---
"@pair/pair-cli": minor
---

run: `--cards a,b,c` runs an ordered card list serially, each via its own `--card` lifecycle; unfinished retryable cards are retried in passes while durable state shows progress, a no-progress pass stops with per-card reasons, terminal cards are never retried, a safety failure halts at once. Pass cap = `--max-iterations`; exit 0 all at target / 1 any failed / 2 usage. CLI help and `reference/cli/commands.mdx` updated.
