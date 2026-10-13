# Decision: Claude Code plugin packaging — a bootstrap payload, not the catalog

## Date

2026-07-28

## Status

Active

## Category

Tooling Preference

## Context

Story #277 adds the **native Claude Code channel** (D1): `/plugin marketplace add foomakers/pair` must install pair's skills with no `pair-cli` step, while the CLI stays the tool-agnostic channel (Cursor, Windsurf, Copilot). The plugin/marketplace format is an **external, evolving spec**, so the story required a spike first.

Spike findings (Claude Code docs and `claude plugin validate` on CLI v2.1.220, 2026-07-28):

- `.claude-plugin/marketplace.json` requires `name`, `owner` (with `owner.name`), `plugins[]`; every entry requires `name` + `source`.
- `.claude-plugin/plugin.json` is optional and requires only `name`. With the default `strict: true`, `plugin.json` is the authority for components and the marketplace entry may supplement it.
- A plugin's skills come from its `skills/` directory plus any `./`-relative directories in the `skills` field. pair has no `skills/` directory: installed skills live in `.claude/skills/pair-*` (the `pair update` mirror of `packages/knowledge-hub/dataset/.skills/`).
- Plugin skills are invoked as `/<plugin>:<frontmatter name>`, with bare `/<name>` also resolving when unique — so `/pair-process-implement` keeps working.
- Installed plugins are **copied into `~/.claude/plugins/cache`** and cannot reference files outside the plugin root.
- Published JSON Schemas exist on schemastore (`claude-code-marketplace.json`, `claude-code-plugin-manifest.json`), safe to reference via `$schema` (ignored at load time).

**Revised 2026-07-31, before merge.** The first implementation shipped the whole repository as the plugin (`source: "./"`). Two structural limitations followed: pair's own `.pair/adoption/` travelled in the plugin cache, so a skill resolved *pair's* decisions as the user's (no graceful degradation — the files were present), and `/pair-capability-record-decision` wrote adoption files **into the cache**, destroyed by the next `/plugin update`. The revision removes the cause: the plugin no longer carries the repository. Decisions 1, 3 and 5 changed; 2 and 4 survive.

## Decision

**1. The plugin root is the bootstrap corpus, not the repository.**

`.claude-plugin/marketplace.json` stays at the repo root (where Claude Code looks when resolving `foomakers/pair`), but its single entry's `source` is `./packages/knowledge-hub/dataset/plugin`. That directory is the plugin root: `plugin.json` lives there beside the `skills/` directory it declares — a few kilobytes rather than a ~19 MB repository copy.

The payload contains one skill today: `pair-assistant`. It sets pair up when missing — installs `pair-cli`, creates the repository if absent, runs the install, so the KB and full catalog are produced **by the CLI, in the user's repository** — then turns requests into the right CLI command and answers project questions from the project's own `.pair/llms.txt`. The marketplace is the zero-setup entry point to the CLI, not a second copy of the catalog.

**Its two runtime sources of truth are deliberate, and they are why it does not go stale.** The CLI surface comes from `pair-cli --help`, never a list in the skill: the code and the published reference are already pinned to each other by `docs:staleness`, a third copy would have no guard, and the user's installed version may differ. The project's standards come from its own `.pair/llms.txt`, read from the working directory.

**The assistant is Claude Code-only, deliberately.** The plugin/marketplace format is Claude Code's own (the schemas are `claude-code-marketplace.json` and `claude-code-plugin-manifest.json`). The *skill* format is portable (agentskills.io), which is why the CLI installs the same files into six tool directories (`.claude/`, `.github/`, `.cursor/`, `.agent/`, `.agents/`, `.windsurf/`), but the *delivery* is not. A Cursor or Windsurf user installs with the CLI directly. A second, catalogue-member assistant for the other tools (CLI help without the setup half) was **deferred**: maintainer call, 2026-08-01, "Claude-only is fine for now" — a choice, not an omission.

**Brownfield is a third case, and it asks rather than decides.** A repository with a codebase and no `.pair/` needs adoption files that *describe the project as it is*, so silently installing blank templates is wrong. The assistant states that the adoption registry installs with `add` behaviour (existing decisions never overwritten), then offers install-only or install-and-adopt, the latter handing off to `/pair-process-bootstrap` (owns the checklist, arrives with the install). With no answer it takes install-only: files are recoverable, a half-finished wrong adoption pass is not.

**A known weak spot, recorded.** The assistant's entry into the project's KB is `.pair/llms.txt`, and **no gate checks that index against the KB it describes** — issue #416, filed from #411's review. The skill treats it as a table of contents: an unresolved path means walk `.pair/knowledge/` and report the index stale, never guess. Likewise `--help` is authoritative about flags and silent about conventions, and the skill file can be older than both the CLI and the KB, so both win over it.

**Link versus read — the distinction the isolation rule turns on.** A *link* out of the skill (`../../../.pair/knowledge/...`) resolves inside the plugin cache — the defect this revision removes — so it stays forbidden and asserted against. A *runtime read* of `.pair/llms.txt` relative to the **working directory** reads the user's own installed KB, after the preflight confirms it exists.

Two properties follow:

- **Nothing in the cache can answer for the user's project.** No `.pair/` in the payload: adoption reads cannot resolve pair's decisions, adoption writes cannot land where `/plugin update` erases them.
- **No skill name resolves from two sources.** The bootstrap skill is authored *outside* `dataset/.skills/`, so the CLI never installs it; the 41 distributed skills never travel through the plugin. "Pick one channel, not both" has no subject left.

A plugin cannot read outside its root, which forced `source: "./"` before (distributed skills reference the KB by `../../../.pair/knowledge/...`). Now those skills are not in the payload, and the one that is carries **no** KB reference by design (Decision 3).

**2. `plugin.json` owns the component definition; the marketplace entry stays thin metadata.**

`plugin.json` lists the skills; `marketplace.json` carries name, owner and the single entry (`name: pair`, `source: ./packages/knowledge-hub/dataset/plugin`). One list also keeps the plugin loadable directly (`claude --plugin-dir .`, `claude plugin validate .`).

**3. The `skills` array lists each bootstrap skill explicitly, is hand-maintained (AC3), and every entry must be ISOLATED.**

One explicit `./skills/<name>` entry per directory under the plugin root's `skills/`, never a glob. Count-free: a number here would be a second place to remember.

**Isolation is load-bearing.** A bootstrap skill runs *before* the KB exists in the project, and the only KB in reach would be pair's own. So it carries **no link into `.pair/knowledge/**` and none into `.pair/adoption/**`** — everything is inline. Such a link is dangling at best, answering from the wrong project at worst, and reads as an improvement in review.

**Where these skills are authored.** At the location they are served from (`dataset/plugin/skills/`, beside `.claude-plugin/plugin.json`), not under `dataset/.skills/`. Three shapes considered:

- *In `dataset/.skills/`, excluded from the CLI install by config* — rejected. This repo's mirror is regenerated by `pair update`, the command the exclusion makes skip that entry; with `behavior: overwrite` doing no cleanup, a stale copy would survive and the mirror-equality guard would fail with a remedy that cannot fix it.
- *Hand-authored inside the generated `.claude/skills/` tree* — rejected: an authored file in a build output beside 41 generated siblings makes clean regeneration look like drift.
- *Authored at the plugin root* — chosen: ONE copy, nothing to drift; the CLI's skills registry never reads it; unambiguous provenance.

Cost: these files sit outside `dataset/.skills/`, so `skills:conformance` and the mirror-equality guard do not see them. `assertBootstrapSkillsValid` replaces both: frontmatter present and self-consistent (`name` equals the directory, since no transform assigns it), and isolation asserted on **link targets**, not substrings (the skill explains its isolation in prose).

The catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.ts` + colocated test, per the gate-tooling-in-tested-modules ADL) derives the expected list from the bootstrap corpus **on disk** and fails naming the exact entry to add or remove. It **asserts, never generates**. Adding a skill to the distributed catalog (`dataset/.skills/`) touches no manifest — the release checklist item shrank.

**4. No `version` is pinned, in either manifest.**

Claude Code falls back to the git commit SHA when `version` is absent, so `/plugin update` always yields the current catalog; a pinned version in a hand-maintained file strands users at the last remembered bump. Non-strict `claude plugin validate .` passes with a "no version specified" **warning** — the accepted tradeoff, and what the release checklist runs. `claude plugin validate --strict` **fails** it (`✘ Validation failed (--strict treats warnings as errors)`, non-zero exit — verified on CLI v2.1.220). Therefore: **no gate may run `--strict` while this no-version-pin decision stands.**

**5. Skills only — the manifest key surface is an ALLOWLIST, and the plugin root carries no auto-discovered component.**

This is the normative record for pair's skills-only distribution rule (see the identifier note below).

Manifest level: the allowlist covers **all three hand-edited surfaces**. `.claude-plugin/plugin.json` may declare schema metadata plus `skills`; a `marketplace.json` `plugins[]` entry may declare schema metadata plus `source`/`category`/`tags`/`strict`; `marketplace.json`'s **own top level** may declare marketplace metadata plus `owner`/`plugins` — never `forceRemoveDeletedPlugins` (lets the marketplace uninstall plugins from a user's machine on refresh), `allowCrossMarketplaceDependenciesOn` (extends trust to other marketplaces' plugins — the `dependencies` hole one level up) or `metadata.pluginRoot` (rebases relative plugin sources, silently changing which directory ships from under `source: "./"`; `metadata` stays permitted for descriptive fields, so that sub-key gets its own check). All three pass `claude plugin validate .` unguarded — probe-verified. **Any other key fails**, including keys a future schema adds. The first implementation, a denylist of `agents`/`hooks`/`mcpServers`, was wrong: the schemas declare 13 component/behaviour keys, and `settings` (merged into every user's settings), `dependencies` (auto-enables a third-party plugin, with its own hooks), `monitors` (unsandboxed background scripts, same trust tier as hooks) and `commands` all pass `claude plugin validate` — probe-verified on CLI v2.1.220. `commands` is also forbidden at the plugin root by the payload-level half, so the two halves disagreed.

The marketplace entry is the sharper hole: the schema allows `skills` on the **entry**, where it REPLACES `plugin.json`'s catalog, and the catalog guard reads `plugin.json` only. Verified: injecting `"skills": ["./.claude/skills/agent-browser"]` into the entry installs a **1-skill** plugin (`claude plugin details pair@pair` → `Skills (1) agent-browser`) with every guard passing — voiding AC2's only automatic enforcement (deliberately the only one, since names/descriptions are delegated to the mirror-equality guard per Decision 3).

Payload level, revised with Decision 1: the guard fails if a component path other than the declared `skills/` appears at the plugin root. `skills/` is the ONE exemption because the root moved: it IS the bootstrap corpus's parent, so auto-discovery and the manifest agree by construction. (Before, the manifest `skills` field being **additive** meant an auto-discovered root `skills/` would ship AND load skills absent from `plugin.json`, bypassing the catalog guard — which is why the exemption is now safe: the two lists coincide.) The root path list is **derived from the schema's component keys** (one directory per key, plus `.mcp.json` as the one file form), not hand-enumerated — the hand-enumerated version shipped without `monitors` ("background watch scripts the host arms as persistent Monitor tasks, unsandboxed, same trust tier as hooks"). A key a future schema adds extends the manifest allowlist rejection *and* the root-payload check from the same edit.

Subagents are an anonymous context-isolation mechanic, never a distributed "agent" asset.

**Identifier note.** The identifiers "D23" and "R9.3" are used for this rule in epic #213's requirements triage and resolve to **no record under `.pair/`** — and "D23" already denotes *mechanical isolation* in the skill corpus (`pair-process-implement/SKILL.md`), so the citation is ambiguous as well as unresolvable. Per the precedent in [2026-07-18-d22-classification-verdict-collapsed-details.md](./2026-07-18-d22-classification-verdict-collapsed-details.md), this ADL section is the record: code, tests, release checklists and docs cite **this ADL's Decision 5** in prose, never the bare identifiers.

**6. Registry-level `exclude` ships as a general capability, with no consumer today.**

A registry may declare `exclude: [...]` — source-relative entries the copy never installs — threaded `pair.config.json` → `RegistryConfig` → `SyncOptions` → the copy pipeline, the route `flatten`/`prefix` travel.

Its original motivation (keeping the bootstrap skill out of consuming projects) is **gone** — Decision 3's authoring location does that structurally. Kept anyway (maintainer call, 2026-07-31) as a general capability, honestly recorded as having no consumer.

Decided: matching is **segment-wise**, never a string prefix (excluding `process/setup` leaves `process/setup-helper` alone); an excluded entry's whole subtree is skipped; filtering happens before validation and before any `mkdir`, so an excluded entry cannot contribute a flatten collision, a directory mapping or a link-rewrite pass; **both** copy paths honour it through one shared predicate (a registry may declare it without `flatten`/`prefix`, taking the plain walk); a malformed `exclude` is a config error, checked like `include`. **Limit:** *never install*, not *uninstall* — `behavior: overwrite` performs no cleanup, so an entry already present is left alone.

Verified by unit tests on both paths plus a smoke scenario driving the real packaged CLI (transform path, plain path, invalid config). **The scenario is a manual gate, not a CI guarantee**: `scripts/smoke-tests/` is run by `pnpm smoke-tests` and by no workflow — the reach limitation `assert_pinned_bug` documents, tracked in #400.

> **Update (2026-08-11, story #400):** no longer true. The smoke suite's CI-safe list runs on every pull request (`smoke` job in `ci.yml`), and `registry-exclude.sh` is in it — measured 0.8s, offline-safe. The scenario is now re-run on every change.

## Alternatives Considered

- **A slim plugin directory (`plugin/skills/*`) with symlinks into `.claude/skills/`**: Rejected. Symlinks break on Windows clones without symlink support, and the skills' `.pair/knowledge/` pointers would dangle.
- **Point `skills` at the dataset source (`packages/knowledge-hub/dataset/.skills/...`)**: Rejected. The dataset carries **unprefixed** names (`verify-quality`) and pre-transform cross-references, so the plugin channel would expose different names than the CLI channel and every doc reference (`/pair-capability-verify-quality`) would break.
- **One marketplace entry per skill (40 installable plugins)**: Rejected. Names and descriptions in the manifest (a drift surface), and one install per skill instead of the one-step catalog AC1 promises.
- **Generate the manifest from the dataset at release time**: Rejected by the story (AC3) — not worth a pipeline step; the guard test gives the safety.
- **Pin `version` and add `.claude-plugin/plugin.json` to the `sync-version` gate**: Rejected for now — extends a docs-only (`.md`/`.mdx`) tool to JSON for no consumer benefit while the catalog tracks `main`. Revisit if release-pinned distribution is ever needed.

## Consequences

- **Install flow.** `/plugin marketplace add foomakers/pair` → `/plugin install pair@pair` → `/pair-assistant`. One skill, which installs `pair-cli` and runs it, so the catalog and KB land in **your** repository.
- **Verified live on the new shape** (CLI v2.1.220, sandboxed via `CLAUDE_CONFIG_DIR` against this branch): `claude plugin validate <plugin root>` → passes with the one expected version warning (Decision 4); `claude plugin validate <repo root>` → passes and resolves the entry's manifest through the new `source` (`plugins[0] plugin.json → version` warning — proof the pointer works); `marketplace add <path>` → "Successfully added marketplace: pair"; `plugin install pair@pair` → "Successfully installed"; `claude plugin details pair@pair` → **`Skills (1) pair-assistant`**, `Agents (0)`, `Hooks (0)`, `MCP servers (0)`, `LSP servers (0)`. Residual gap: GitHub-shorthand resolution of `foomakers/pair` only resolves after merge.
- **Payload vs marketplace clone.** The installed plugin cache is 12 KB (`du -sh`), against ~19 MB for the whole-repository shape; always-on cost **~124 tokens** per session. Adding the marketplace is separate: from a **local path** the marketplace directory is **0 B** (referenced in place, verified); from a **GitHub source** the repository is cloned to read `marketplace.json` and resolve the nested `source`. `claude plugin marketplace add --sparse <paths...>` fits this monorepo (`--sparse .claude-plugin packages/knowledge-hub/dataset/plugin`), documented on the integration page.
- **The cache holds `.claude-plugin/` and `skills/` and nothing else** — verified, **no `.pair/`**. Both earlier limitations are structurally absent.
- **Manifest layout constraint:** Claude Code expects `<plugin root>/.claude-plugin/plugin.json`; a bare `<plugin root>/plugin.json` fails with "No manifest found in directory". The first attempt at this revision had that layout — caught by `claude plugin validate`, not by any repo guard.
- **"Pick one channel, not both" is retired** (Decision 1); the docs say both may stay installed.
- **The release checklist shrank** (Decision 3) and gained one line: verify the marketplace entry's `source` still points at the plugin root — pointing it back at `./` silently restores the whole-repo payload and both limitations.
- The bootstrap corpus is covered by `assertBootstrapSkillsValid`, not `skills:conformance`/mirror-equality (Decision 3).
- Project-scoped adoption resolution — removed for the marketplace channel — remains tracked as [#392](https://github.com/foomakers/pair/issues/392).

## Adoption Impact

- No change to `adoption/tech/*`: a distribution/packaging convention. Release-process surfacing lives in [RELEASE.md](../../../RELEASE.md) and the docs-site release-process page.
- No dataset mirror (adoption ADLs are adoption-only records).
- Complements [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md): the catalog guard lives in a tested module.
