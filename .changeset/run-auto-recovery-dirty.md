---
'@pair/pair-cli': patch
'@pair/knowledge-hub': patch
---

`pair-cli run` auto-recovery: a preparation refused for a dirty story worktree stashes the stray files (`pair-recovery: …`, kept) and retries on one `autoRecoveryRounds` round (`worktree-clean`) instead of parking; the `--watch` loop drives a durable failure again once the base moved.
