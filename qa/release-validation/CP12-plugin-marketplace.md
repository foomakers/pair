# CP12 — Plugin Marketplace Channel

**Priority**: P1
**Scope**: Claude Code marketplace entry point: add marketplace, install `pair@pair`, `/pair-assistant` runs
**Channels**: all (the marketplace serves the repository's current catalog, independent of the npm channel). **Manual, run inside Claude Code.**
**Preconditions**: Claude Code with network access, an empty scratch project directory outside the repo. No credential is needed or recorded.

---

## MT-CP1201: marketplace add and plugin install

**Priority**: P1
**Preconditions**: none
**Category**: Plugin

### Steps

1. In Claude Code: `/plugin marketplace add foomakers/pair`
2. `/plugin install pair@pair`
3. `/plugin` and open the installed list

### Expected Result

- Both commands succeed without error
- `pair@pair` listed as installed, exposing one skill

---

## MT-CP1202: `/pair-assistant` is available and runs

**Priority**: P1
**Preconditions**: MT-CP1201 passes; scratch project open
**Category**: Plugin

### Steps

1. Type `/pair-assistant`

### Expected Result

- The skill is offered and starts (it proposes installing the CLI / running `pair-cli install`)
- No other pair skill is exposed by the plugin (bootstrap corpus only)

---

## MT-CP1203: `/pair-assistant` on a repo with own agent files

**Priority**: P1
**Preconditions**: MT-CP1201 passes; scratch repo with own `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` and code (`git init`, commit)
**Category**: Plugin

### Steps

1. Run `/pair-assistant`
2. Answer **keep** for both files. Check the install ran with `--skip-registries agents`, own files byte-identical, `.pair/` present
3. Reset the repo (`git clean -fdx && git checkout .`), run `/pair-assistant` again, answer **overwrite**, confirm the `mv` backups

### Expected Result

- Asks keep/overwrite per file; `CLAUDE.md` is never overwritten silently
- Keep: install succeeds, tells you pair is not reachable from your `AGENTS.md` and what to add (does not edit it)
- Overwrite: `AGENTS.md.bak` / `CLAUDE.md.bak` hold your originals, pair's files installed
- No text says `AGENTS.md` is "REPLACED"

---

## MT-CP1204: code-only repo, skill vs CLI parity

**Priority**: P1
**Preconditions**: MT-CP1201 passes; two copies of a repo with code only (no `AGENTS.md`/`CLAUDE.md`)
**Category**: Plugin

### Steps

1. Copy A: run `/pair-assistant`, accept install
2. Copy B: run `pair-cli install` directly
3. Compare: `diff <(cd A && find . -path ./.git -prune -o -type f -print | sort) <(cd B && find . -path ./.git -prune -o -type f -print | sort)`; compare symlink targets with `find . -type l -exec readlink {} \;`

### Expected Result

- Equal file lists and equal link targets

---

## MT-CP1205: keep choice survives a later `update`

**Priority**: P1
**Preconditions**: MT-CP1203 keep path done (own files kept, `.pair/` installed)
**Category**: Plugin

### Steps

1. Check `pair.config.json` has `"skipRegistries": ["agents"]`
2. Run `/pair-assistant`, ask to update the KB (or run `pair-cli update`)

### Expected Result

- Own `AGENTS.md`/`CLAUDE.md` byte-identical after the update; output says `skipping agents (from pair.config.json)`
- The skill states the choice lives in `pair.config.json` and how to opt back in (remove the name; `mv X X.bak` first or `--persist-backup`)

---

## Changelog

- #543: new CP (marketplace channel, README:103 / claude-code integration page).
- #552: MT-CP1203 (keep/overwrite on own-files repo), MT-CP1204 (skill vs CLI parity).
- #552: MT-CP1205 (keep persisted, later update).
