---
'@pair/pair-cli': patch
'@pair/website': patch
---

Release flakes and v0.5 validation defects: `tokens.pipe` test no longer spawns the CLI in a hook, website `ts:check` runs after the build that regenerates `.source`, `run --dry-run --profile <unknown>` halts for `--card` and `--root`, 404 message keeps hyphenated prerelease ids, invalid project config prints the error prefix once.
