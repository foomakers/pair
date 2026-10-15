---
'@pair/pair-cli': patch
---

v0.5.0 blockers from pre.1 validation (#548):

- A fresh install no longer ships pair's own `tech/automation.md` or decision logs, and no `mirrors:regenerate` hook (a conformance test guards the dataset adoption).
- `package` without `--layout` validates and packs the same layout (default `target`), packages the canonical copy only, and unflattens skills to `<category>/<name>` with links rewritten, so `kb-verify`, `kb-validate --layout source` and `install --source` round-trip. `kb-verify` finds file registries (`AGENTS.md`).
- `package --help` and docs show `--pkg-version`, never `--version`.
- `update --persist-backup` keeps `.pair/backups/`.
- `update-link --dry-run` prints what would change (or "No changes") and modifies nothing.
- `kb-info <corrupt.zip>` exits 1 with `Invalid ZIP archive: <path>`.
- A custom KB URL download message names no CLI version.
