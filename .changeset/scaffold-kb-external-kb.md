---
'@pair/pair-cli': minor
---

Add `pair scaffold-kb`: scaffolds an external knowledge base repository (pure KB —
`.pair/knowledge/` + `.skills/` + `pair.config.json` + README + `.gitignore` + seed
content) plus a release script/workflow that wraps the existing `pair package`, so a
private/self-hosted/forked KB installs exactly like the official one.

**Behavior change (all commands):** excess positional arguments are now rejected —
`pair <command> ./a ./b` fails with `error: too many arguments for '<command>'` (exit 1)
instead of silently dropping `./b`. This catches unquoted option values (`--name Acme KB`
→ quote it: `--name "Acme KB"`). A wrapper script or CI job that passed a stray argument
must drop it.
