---
'@pair/pair-cli': minor
---

Keep choice survives `update` (#552):

- `install --skip-registries agents` now writes `"skipRegistries": ["agents"]` into the project's `pair.config.json`; `update` honours it (`skipping agents (from pair.config.json)`), so your own `AGENTS.md`/`CLAUDE.md` are no longer overwritten.
- `update --skip-registries <names>` (same parser as install; names persisted). Unknown flag name exits 1; unknown name in config warns and is ignored.
- Remove the name from `skipRegistries` to opt back in; the next `update` installs pair's files (backup only with `--persist-backup`).
- An unparseable project `pair.config.json`, or a non-string-array `skipRegistries`, now makes install/update exit 1 naming the file (before: warn and continue).
