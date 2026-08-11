# Decision: Claude Code plugin packaging — a bootstrap payload, not the catalog

## Date

2026-07-28

## Status

Active

## Category

Tooling Preference

## Context

Story #277 adds the **native Claude Code channel** (D1): `/plugin marketplace add foomakers/pair` must install pair's skills with no `pair-cli` step, while the CLI stays the tool-agnostic channel (Cursor, Windsurf, Copilot). Claude Code's plugin/marketplace format is an **external, evolving spec**, so the story required a spike before writing anything.

Spike findings (verified against Claude Code's own docs and `claude plugin validate` on CLI v2.1.220, 2026-07-28):

- `.claude-plugin/marketplace.json` requires `name`, `owner` (with `owner.name`), `plugins[]`; every entry requires `name` + `source`.
- `.claude-plugin/plugin.json` is optional and requires only `name`. With the default `strict: true`, `plugin.json` is the authority for components and the marketplace entry may supplement it.
- A plugin's skills come from its `skills/` directory, plus any `./`-relative directories listed in the `skills` field. pair has no `skills/` directory: its installed skills live in `.claude/skills/pair-*` (the `pair update` mirror of `packages/knowledge-hub/dataset/.skills/`).
- Plugin skills are invoked as `/<plugin>:<frontmatter name>`, with the bare `/<name>` also resolving when unique — so `/pair-process-implement`, the form every pair doc and every cross-skill composition reference uses, keeps working.
- Installed plugins are **copied into `~/.claude/plugins/cache`** and cannot reference files outside the plugin root.
- Published JSON Schemas exist on schemastore (`claude-code-marketplace.json`, `claude-code-plugin-manifest.json`) and are safe to reference via `$schema` (Claude Code ignores the field at load time).

**Revised 2026-07-31, before merge.** The first implementation shipped the whole repository as the plugin (`source: "./"`) so that the full catalog installed natively. Building it surfaced two limitations that were documented rather than fixed, and both were structural: pair's own `.pair/adoption/` travelled inside the plugin cache, so a skill step resolved *pair's* decisions as if they were the user's (no graceful degradation — from the skill's point of view the files were present), and `/pair-capability-record-decision` wrote adoption files **into the cache**, where the next `/plugin update` destroyed them. The revision below removes the cause instead of documenting the effect: the plugin no longer carries the repository. Decisions 1, 3 and 5 changed; 2 and 4 survive.

## Decision

**1. The plugin root is the bootstrap corpus, not the repository.**

`.claude-plugin/marketplace.json` stays at the repo root — that is where Claude Code looks when it resolves `foomakers/pair` — but its single entry's `source` is `./packages/knowledge-hub/dataset/plugin`. That directory is therefore the plugin root: `plugin.json` lives there, beside the `skills/` directory it declares, and the payload is those few kilobytes rather than a ~19 MB repository copy.

The payload contains exactly one skill today: `pair-assistant`. It sets pair up when it is missing — installs `pair-cli`, creates the repository if absent, runs the install, so the knowledge base and the full catalog are produced **by the CLI, in the user's repository** — and then keeps working: it turns a request into the right CLI command, and answers questions about the project from the project's own `.pair/llms.txt`. The marketplace is the zero-setup entry point to the CLI, not a second copy of the catalog.

**Its two runtime sources of truth are deliberate, and they are why it does not go stale.** The CLI's surface comes from `pair-cli --help`, never from a list written into the skill: the repo already has two copies of that surface (the code and the published reference, pinned to each other by `docs:staleness`), and a third inside the plugin would have no guard at all — plus the version installed in a user's project may differ from the one the skill was written against. The project's standards come from its own `.pair/llms.txt`, read from the working directory.

**The assistant is Claude Code-only, deliberately.** The plugin/marketplace format is Claude Code's own — the schemas are literally `claude-code-marketplace.json` and `claude-code-plugin-manifest.json`, not a cross-tool standard. The *skill* format is portable (agentskills.io), which is why the CLI can install the same files into six tool directories (`.claude/`, `.github/`, `.cursor/`, `.agent/`, `.agents/`, `.windsurf/`), but the *delivery* is not. So `/pair-assistant` reaches Claude Code users and nobody else: a Cursor or Windsurf user installs with the CLI directly, which is coherent — they are already at a command line and do not need a skill to run one. A second, catalogue-member assistant for the other tools (CLI help without the setup half, since they have already done it) was considered and **deferred**: maintainer call, 2026-08-01, "Claude-only is fine for now". Recorded so the asymmetry reads as a choice rather than an omission.

**Brownfield is a third case, and it asks rather than decides.** A repository that already has a codebase and no `.pair/` is not the greenfield path: the value of pair's adoption files there is that they *describe the project as it is*, so installing blank templates silently is the wrong default. The assistant states the fact that makes the choice safe — the adoption registry installs with `add` behaviour, so existing decisions are never overwritten — then offers install-only or install-and-adopt, the second handing off to `/pair-process-bootstrap` (which owns the checklist and arrives with the install). With no answer it takes install-only: files are recoverable, a half-finished adoption pass that describes the project wrongly is not.

**A known weak spot, recorded rather than glossed.** The assistant's entry point into the project's KB is `.pair/llms.txt`, and **no gate checks that index against the knowledge base it describes** — that is issue #416, filed from #411's review. So the skill is written to treat it as a table of contents: a path that does not resolve means walk `.pair/knowledge/` and report the index as stale, never guess. The same discipline covers the other two asymmetries: `--help` is authoritative about flags and silent about conventions, and this skill file itself can be older than both the CLI and the KB, so both win over it.

**Link versus read — the distinction the isolation rule turns on.** A *link* out of the skill (`../../../.pair/knowledge/...`) resolves inside the plugin cache, which is precisely the defect this revision removes, so it stays forbidden and is asserted against. A *runtime read* of `.pair/llms.txt` relative to the **working directory** is the opposite: it reads the user's own installed KB, after the preflight has confirmed it exists. Encouraging the second while banning the first is what lets an isolated skill still be useful.

Two properties follow, and they are the reason for the shape:

- **Nothing in the cache can answer for the user's project.** There is no `.pair/` in the payload, so adoption reads cannot resolve pair's decisions and adoption writes cannot land somewhere `/plugin update` will erase. The two limitations the previous shape documented do not exist here.
- **No skill name resolves from two sources.** The bootstrap skill is authored *outside* `dataset/.skills/`, so the CLI never installs it; the 41 distributed skills never travel through the plugin. "Pick one channel, not both" was a rule about an ambiguity that now has no subject — the two are safe to keep installed together.

A plugin cannot read outside its own root, which is what forced `source: "./"` before: the distributed skills reference the knowledge base by relative path (`../../../.pair/knowledge/...`) and would dangle in a smaller root. That constraint is satisfied differently now — those skills are not in the payload at all, and the one that is carries **no** knowledge-base reference by design (see Decision 3).

**2. `plugin.json` owns the component definition; the marketplace entry stays thin metadata.**

`plugin.json` lists the skills; `marketplace.json` carries name, owner, and the single entry (`name: pair`, `source: ./packages/knowledge-hub/dataset/plugin`). Keeping the list in one place also makes the plugin loadable directly (`claude --plugin-dir .`, `claude plugin validate .`) without going through a marketplace.

**3. The `skills` array lists each bootstrap skill explicitly, is hand-maintained (AC3), and every entry must be ISOLATED.**

One explicit `./skills/<name>` entry per directory under the plugin root's `skills/`, never a glob. Deliberately count-free: a number written here would be a second place to remember.

**Isolation is the load-bearing property, not a style preference.** A bootstrap skill runs *before* the knowledge base exists in the project, and on this channel the only knowledge base within reach would be pair's own. So a bootstrap skill carries **no link into `.pair/knowledge/**` and none into `.pair/adoption/**`** — everything it needs is stated inline. A link there would be dangling at best and answering from the wrong project at worst, and it is exactly the kind of edit that reads as an improvement in review.

**Where these skills are authored, and why not in the dataset.** They live at the location they are served from (`dataset/plugin/skills/`, beside the `.claude-plugin/plugin.json` that declares them), not under `dataset/.skills/`. Three shapes were considered and two were rejected:

- *In `dataset/.skills/`, excluded from the CLI install by config* — rejected. It works for a consuming project, but this repository's own mirror is regenerated by `pair update`, the very command the exclusion makes skip that entry; with `behavior: overwrite` performing no cleanup, a stale copy would survive and the mirror-equality guard would fail with a remedy that cannot fix it.
- *Hand-authored inside the generated `.claude/skills/` tree* — rejected. It puts an authored file inside a build output, next to 41 generated siblings, which normalises exactly the mixed provenance that makes a clean regeneration look like drift.
- *Authored at the plugin root* — chosen. There is only ONE copy, so nothing can drift from anything; the CLI's skills registry never reads that directory, so no exclusion is needed; and the provenance is unambiguous.

The cost is that these files sit outside `dataset/.skills/`, so `skills:conformance` and the mirror-equality guard do not see them. `assertBootstrapSkillsValid` replaces both: frontmatter present and self-consistent (`name` equals the directory, since no transform assigns it here), and the isolation invariant asserted on **link targets** rather than substrings — the skill legitimately explains its own isolation in prose, and a substring match would redden on the sentence documenting the rule it obeys.

The manual process keeps its automatic backstop: the catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.ts` + colocated test, per the gate-tooling-in-tested-modules ADL) derives the expected list from the bootstrap corpus **on disk** and fails naming the exact entry to add or remove. It **asserts, never generates**. Because the list is derived, adding a skill to the distributed catalog (`dataset/.skills/`) now touches no manifest at all — the release checklist item shrank accordingly.

**4. No `version` is pinned, in either manifest.**

Claude Code falls back to the git commit SHA when `version` is absent, so `/plugin update` always yields the current catalog. A pinned version in a hand-maintained file would strand every user at the last version somebody remembered to bump — a worse failure than no pin. Non-strict `claude plugin validate .` passes with a "no version specified" **warning** — that warning is the accepted tradeoff, and it is what the release checklist runs. `claude plugin validate --strict` does **not** warn about the omission, it **fails** it (`✘ Validation failed (--strict treats warnings as errors)`, non-zero exit — verified on CLI v2.1.220). Therefore: **no gate may run `--strict` while this no-version-pin decision stands.** Adding it would break the build on a deliberate design choice.

**5. Skills only — the manifest key surface is an ALLOWLIST, and the plugin root carries no auto-discovered component.**

This is the normative record for pair's skills-only distribution rule (see the identifier note below).

Manifest level: the allowlist covers **all three hand-edited surfaces**. `.claude-plugin/plugin.json` may declare schema metadata plus `skills`; a `marketplace.json` `plugins[]` entry may declare schema metadata plus `source`/`category`/`tags`/`strict`; and `marketplace.json`'s **own top level** may declare marketplace metadata plus `owner`/`plugins` — never `forceRemoveDeletedPlugins` (lets the marketplace uninstall plugins from a user's machine on refresh), `allowCrossMarketplaceDependenciesOn` (extends trust to other marketplaces' plugins — the `dependencies` hole one level up) or `metadata.pluginRoot` (rebases relative plugin sources, so it silently changes which directory ships as the payload from under `source: "./"`; `metadata` itself stays permitted for its descriptive fields, so that sub-key gets its own check). All three pass `claude plugin validate .` unguarded — probe-verified. **Any other key fails**, including keys a future schema revision introduces. A denylist of `agents`/`hooks`/`mcpServers` was the first implementation and was wrong: the published schemas declare 13 component/behaviour keys, and `settings` (merged into every user's settings), `dependencies` (auto-enables a third-party plugin, with its own hooks, on every user's machine), `monitors` (unsandboxed background scripts, explicitly the same trust tier as hooks) and `commands` all pass `claude plugin validate` — probe-verified on CLI v2.1.220. `commands` is also the key the payload-level half already forbids at the plugin root, so the two halves of one rule disagreed.

The marketplace entry is the sharper hole the allowlist closes: the schema allows `skills` on the **entry**, where it REPLACES `plugin.json`'s catalog, and the catalog guard reads `plugin.json` only. Verified: injecting `"skills": ["./.claude/skills/agent-browser"]` into the entry installs a **1-skill** plugin (`claude plugin details pair@pair` → `Skills (1) agent-browser`) instead of the whole catalog, with `claude plugin validate` and every other guard still passing — one hand-edited key would void AC2's only automatic enforcement (deliberately the only one, since names/descriptions are delegated to the mirror-equality guard per Decision 3).

Payload level, revised with Decision 1: the guard fails if a component path other than the declared `skills/` appears at the plugin root. `skills/` is now the ONE exemption, and only because the root moved: it IS the bootstrap corpus's parent, so auto-discovery and the manifest agree by construction instead of competing — the entire payload is the files we mean to ship, leaving no undeclared skill for auto-discovery to leak. Under the previous shape the same directory name was a genuine hazard, which is why the exemption is stated rather than quietly taken. The guard also fails if a root-level component path ever appears in the plugin root. That path list is **derived from the schema's component keys** (one directory per key, plus `.mcp.json` as the one file form) rather than hand-enumerated — the hand-enumerated version lagged the schema one corner at a time (it shipped without `monitors`, "background watch scripts the host arms as persistent Monitor tasks, unsandboxed, same trust tier as hooks"). Deriving it means a key a future schema adds extends the manifest allowlist rejection *and* the root-payload check from the same edit, so the two halves of this rule cannot drift apart again. (Before the root moved, `skills/` was covered for a specific reason: the manifest `skills` field is **additive**, so an auto-discovered root `skills/` dir would have shipped AND loaded skills absent from `plugin.json`, bypassing the catalog guard. That reasoning is what makes the exemption safe now rather than merely convenient — the two lists coincide.)

Subagents are an anonymous context-isolation mechanic, never a distributed "agent" asset.

**Identifier note.** The identifiers "D23" and "R9.3" are used for this rule in epic #213's requirements triage and resolve to **no record under `.pair/`** — and "D23" already denotes *mechanical isolation* in the skill corpus (`pair-process-implement/SKILL.md`), so the citation is ambiguous as well as unresolvable. Per the precedent in [2026-07-18-d22-classification-verdict-collapsed-details.md](./2026-07-18-d22-classification-verdict-collapsed-details.md), this ADL section is the record: code, tests, release checklists and docs cite **this ADL's Decision 5** in prose, never the bare identifiers.

**6. Registry-level `exclude` ships as a general capability, with no consumer today.**

A registry may declare `exclude: [...]` — source-relative entries the copy never installs — threaded `pair.config.json` → `RegistryConfig` → `SyncOptions` → the copy pipeline, the route `flatten`/`prefix` already travel.

Its original motivation is **gone**: it was going to keep the bootstrap skill out of consuming projects, and Decision 3's authoring location does that structurally instead. It is kept anyway, deliberately (maintainer call, 2026-07-31), as a capability a registry may want for its own reasons — and it is kept honestly: no consumer exists, and this record says so rather than attaching it to a motivation that no longer holds.

What is decided about it, because each part is a place it could have gone wrong: matching is **segment-wise**, never a string prefix (excluding `process/setup` leaves `process/setup-helper` alone); an excluded entry's whole subtree is skipped; filtering happens before validation and before any `mkdir`, so an excluded entry cannot contribute a flatten collision, a directory mapping or a link-rewrite pass; **both** copy paths honour it through one shared predicate, since a registry may declare it without `flatten`/`prefix` and that takes the plain walk; a malformed `exclude` is a config error, checked like `include`. **Limit:** it means *never install*, not *uninstall* — `behavior: overwrite` performs no cleanup, so an entry already present is left alone.

Verified by unit tests on both paths plus a smoke scenario driving the real packaged CLI (transform path, plain path, invalid config). **The scenario is a manual gate, not a CI guarantee**: `scripts/smoke-tests/` is run by `pnpm smoke-tests` and by no workflow — the same reach limitation `assert_pinned_bug` documents, tracked in #400. It was run against this branch and passes; nothing re-runs it on the next change.

> **Update (2026-08-11, story #400):** no longer true. The smoke suite's CI-safe list runs on every pull request (`smoke` job in `ci.yml`), and `registry-exclude.sh` is in it — measured 0.8s, offline-safe. The scenario is now re-run on every change.

## Alternatives Considered

- **A slim plugin directory (`plugin/skills/*`) with symlinks into `.claude/skills/`**: Rejected. Copies less into the cache, but symlinks break on Windows clones without symlink support, and the skills' `.pair/knowledge/` pointers would dangle (the symlinked skill dir would not carry the KB).
- **Point `skills` at the dataset source (`packages/knowledge-hub/dataset/.skills/...`)**: Rejected. The dataset carries **unprefixed** skill names (`verify-quality`) and pre-transform cross-references, so the plugin channel would expose different skill names than the CLI channel and every doc reference (`/pair-capability-verify-quality`) would break.
- **One marketplace entry per skill (40 installable plugins)**: Rejected. It would put names and descriptions in the manifest (a drift surface) and force users to install one plugin per skill to get the catalog AC1 promises in one step.
- **Generate the manifest from the dataset at release time**: Rejected by the story itself (AC3) — a low-frequency-change manifest is not worth a pipeline step. The guard test gives the safety without the generation.
- **Pin `version` and add `.claude-plugin/plugin.json` to the `sync-version` gate**: Rejected for now. It would extend a docs-only (`.md`/`.mdx`) version-sync tool to JSON for a value that has no consumer benefit while the catalog tracks `main`. Revisit if the marketplace channel ever needs release-pinned distribution.

## Consequences

- **Install flow.** `/plugin marketplace add foomakers/pair` → `/plugin install pair@pair` → `/pair-assistant`. The plugin gives you one skill; that skill installs `pair-cli` and runs it, so the catalog and knowledge base land in **your** repository.
- **Verified live on the new shape, not inferred** (CLI v2.1.220, sandboxed via `CLAUDE_CONFIG_DIR` against this branch): `claude plugin validate <plugin root>` → passes with the one expected version warning (Decision 4); `claude plugin validate <repo root>` → passes and resolves the entry's manifest through the new `source` (`plugins[0] plugin.json → version` warning, which is how we know the pointer works); `marketplace add <path>` → "Successfully added marketplace: pair"; `plugin install pair@pair` → "Successfully installed"; `claude plugin details pair@pair` → **`Skills (1) pair-assistant`**, `Agents (0)`, `Hooks (0)`, `MCP servers (0)`, `LSP servers (0)`. The residual gap is unchanged: GitHub-shorthand resolution of `foomakers/pair` only resolves after merge.
- **Payload vs marketplace clone — do not conflate them.** The installed plugin cache is 12 KB, measured. Adding the marketplace is a separate step with its own cost: from a **local path** the marketplace directory is **0 B** (the path is referenced in place, verified), but from a **GitHub source** the repository is cloned there to read `marketplace.json` and resolve the entry's nested `source`. `claude plugin marketplace add` provides `--sparse <paths...>` for precisely this monorepo shape (`--sparse .claude-plugin packages/knowledge-hub/dataset/plugin`), and the integration page documents it. The shrunken payload is what removes the adoption-file limitations; it is not a claim that nothing else is fetched.
- **The payload is 12 KB, measured** (`du -sh` on the plugin cache), against ~19 MB for the whole-repository shape. Always-on token cost, as the CLI reports it: **~124 tokens** per session.
- **The cache holds `.claude-plugin/` and `skills/` and nothing else** — verified by walking it: there is **no `.pair/`**. So the two limitations the previous shape documented are structurally absent rather than mitigated: no adoption file can be read from the cache as if it were the project's, and `/pair-capability-record-decision` has nothing there to write into and lose.
- **A manifest layout constraint, learned the hard way and worth recording:** Claude Code expects the plugin manifest at `<plugin root>/.claude-plugin/plugin.json`, not at `<plugin root>/plugin.json`. A bare `plugin.json` at the root fails with "No manifest found in directory". The first attempt at this revision had exactly that layout and would have shipped a plugin nobody could install — caught by running `claude plugin validate`, not by any repo guard.
- **"Pick one channel, not both" is retired.** No skill name resolves from two sources: the plugin declares only the bootstrap skill, which is authored outside `dataset/.skills/` and therefore never installed by the CLI. Keeping both installed is fine, and the docs say so instead of warning about an ambiguity that no longer has a subject.
- **The release checklist shrank.** Adding a skill to the distributed catalog touches no manifest at all — the hand-maintained list is now the bootstrap corpus, which changes only when a bootstrap skill is added. What the checklist gained instead is one line worth having: verify the marketplace entry's `source` still points at the plugin root, because pointing it back at `./` would silently restore the whole-repo payload and both of its limitations.
- The bootstrap corpus sits outside `dataset/.skills/`, so `skills:conformance` and the mirror-equality guard do not cover it; `assertBootstrapSkillsValid` does, including the isolation invariant (no KB or adoption **link**, checked on link targets so the skill can still explain the rule in prose).
- Project-scoped adoption resolution — the read/write problem this revision removes for the marketplace channel — remains tracked as [#392](https://github.com/foomakers/pair/issues/392) for anything that still needs it.

## Adoption Impact

- No change to `adoption/tech/*`: this is a distribution/packaging convention, not an architecture or stack change. The release-process surfacing lives in [RELEASE.md](../../../RELEASE.md) and the docs-site release-process page.
- No dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records (the dataset is a curated sample, not an adoption mirror).
- Complements [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md): the catalog guard lives in a tested module, not in a script.
