---
'@pair/pair-cli': minor
---

Install into a repo that already has its own agent files (#552):

- `pair-cli install --skip-registries <names>` leaves registries out (e.g. `agents` keeps your `AGENTS.md`/`CLAUDE.md`); an unknown name exits 1 and lists valid ones.
- Install now refuses an existing `CLAUDE.md` copy target too (before, a lone `CLAUDE.md` was overwritten silently). Use `--skip-registries agents` to keep it.
- `/pair-assistant` asks keep/overwrite per file; overwrite backs up with `mv X X.bak`.
