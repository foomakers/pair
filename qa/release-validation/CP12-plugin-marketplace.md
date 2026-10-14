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

## Changelog

- #543: new CP (marketplace channel, README:103 / claude-code integration page).
