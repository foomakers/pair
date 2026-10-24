---
'@pair/pair-cli': patch
---

`pair-cli run`: `--parallel` is optional on the loop — `--watch`, `--preset`, `--until`, `--prepare`, `--merge`, `--predicate` with `--root`/`--filter` run it one card at a time (`--parallel 1`).
