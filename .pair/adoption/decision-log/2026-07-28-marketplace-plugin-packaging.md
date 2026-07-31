# Decision: Claude Code plugin packaging — marketplace-root source, hand-maintained skills list, no version pin

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

## Decision

**1. Both manifests live in `.claude-plugin/` at the repo root; the plugin `source` is the marketplace root (`"./"`).**

The plugin root is therefore the repository itself. This is not a convenience: pair's skills reference the knowledge base by *relative path* (`../../../.pair/knowledge/...`), and a plugin cannot reach outside its own root. With `source: "./"` the whole repo — `.claude/skills/` **and** `.pair/knowledge/` — is copied into the plugin cache, so those links resolve at runtime. Any slimmer plugin directory would ship skills whose KB pointers dangle.

**2. `plugin.json` owns the component definition; the marketplace entry stays thin metadata.**

`plugin.json` lists the skills; `marketplace.json` carries name, owner, and the single entry (`name: pair`, `source: "./"`). Keeping the list in one place also makes the plugin loadable directly (`claude --plugin-dir .`, `claude plugin validate .`) without going through a marketplace.

**3. The `skills` array lists each skill directory explicitly, and is hand-maintained (AC3).**

One explicit `./.claude/skills/pair-<flattened-name>` entry per dataset skill, not a single `./.claude/skills/` glob. Deliberately count-free: the catalog grows, and a number written here would be a second place to remember (the live count is pinned by the guard and by the docs-staleness gate, not by this record). Reason: `.claude/skills/` also holds `agent-browser`, a third-party skill this repo consumes; non-declaration means it is **never exposed or loaded as a distributed pair skill**. Explicit entries make the distributed catalog a deliberate list.

Note precisely what that does and does not buy: with `source: "./"` the whole repo is the payload, so `agent-browser` (and `.claude/agents/{reviewer,implementer,contract-generator}.md`) **is still copied** into every user's plugin cache — non-declaration is a *loading* control, not a redistribution control. The payload-level skills-only guarantee (Decision 5) comes from a different fact: Claude Code auto-discovers plugin agents, commands, hooks, skills and MCP servers from **root-level** `agents/`, `commands/`, `hooks/`, `skills/`, `.mcp.json` — none of which exist in this repo (pair's own subagents live under `.claude/agents/`, which the plugin loader ignores). The catalog guard asserts that absence, so the guarantee is enforced rather than assumed. Anything that genuinely must not be redistributed cannot live inside the plugin root at all.

Skill **names and descriptions are NOT duplicated into the manifest** — they stay in each `SKILL.md` frontmatter, which the mirror-equality guard already pins byte-for-byte to its dataset source. Copying them into the manifest would create a second drift surface for zero gain.

The manual process gets an automatic backstop: the catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.ts` + colocated test, per the gate-tooling-in-tested-modules ADL) derives the expected list from the dataset through the real install transform and fails naming the exact entry to add or remove. It **asserts, never generates** — the manifest stays hand-written, as the story requires.

**4. No `version` is pinned, in either manifest.**

Claude Code falls back to the git commit SHA when `version` is absent, so `/plugin update` always yields the current catalog. A pinned version in a hand-maintained file would strand every user at the last version somebody remembered to bump — a worse failure than no pin. Non-strict `claude plugin validate .` passes with a "no version specified" **warning** — that warning is the accepted tradeoff, and it is what the release checklist runs. `claude plugin validate --strict` does **not** warn about the omission, it **fails** it (`✘ Validation failed (--strict treats warnings as errors)`, non-zero exit — verified on CLI v2.1.220). Therefore: **no gate may run `--strict` while this no-version-pin decision stands.** Adding it would break the build on a deliberate design choice.

**5. Skills only — the manifest key surface is an ALLOWLIST, and the plugin root carries no auto-discovered component.**

This is the normative record for pair's skills-only distribution rule (see the identifier note below).

Manifest level: the allowlist covers **all three hand-edited surfaces**. `.claude-plugin/plugin.json` may declare schema metadata plus `skills`; a `marketplace.json` `plugins[]` entry may declare schema metadata plus `source`/`category`/`tags`/`strict`; and `marketplace.json`'s **own top level** may declare marketplace metadata plus `owner`/`plugins` — never `forceRemoveDeletedPlugins` (lets the marketplace uninstall plugins from a user's machine on refresh), `allowCrossMarketplaceDependenciesOn` (extends trust to other marketplaces' plugins — the `dependencies` hole one level up) or `metadata.pluginRoot` (rebases relative plugin sources, so it silently changes which directory ships as the payload from under `source: "./"`; `metadata` itself stays permitted for its descriptive fields, so that sub-key gets its own check). All three pass `claude plugin validate .` unguarded — probe-verified. **Any other key fails**, including keys a future schema revision introduces. A denylist of `agents`/`hooks`/`mcpServers` was the first implementation and was wrong: the published schemas declare 13 component/behaviour keys, and `settings` (merged into every user's settings), `dependencies` (auto-enables a third-party plugin, with its own hooks, on every user's machine), `monitors` (unsandboxed background scripts, explicitly the same trust tier as hooks) and `commands` all pass `claude plugin validate` — probe-verified on CLI v2.1.220. `commands` is also the key the payload-level half already forbids at the plugin root, so the two halves of one rule disagreed.

The marketplace entry is the sharper hole the allowlist closes: the schema allows `skills` on the **entry**, where it REPLACES `plugin.json`'s catalog, and the catalog guard reads `plugin.json` only. Verified: injecting `"skills": ["./.claude/skills/agent-browser"]` into the entry installs a **1-skill** plugin (`claude plugin details pair@pair` → `Skills (1) agent-browser`) instead of the whole catalog, with `claude plugin validate` and every other guard still passing — one hand-edited key would void AC2's only automatic enforcement (deliberately the only one, since names/descriptions are delegated to the mirror-equality guard per Decision 3).

Payload level: the guard also fails if a root-level component path ever appears in the plugin root. That path list is **derived from the schema's component keys** (one directory per key, plus `.mcp.json` as the one file form) rather than hand-enumerated — the hand-enumerated version lagged the schema one corner at a time (it shipped without `monitors`, "background watch scripts the host arms as persistent Monitor tasks, unsandboxed, same trust tier as hooks"). Deriving it means a key a future schema adds extends the manifest allowlist rejection *and* the root-payload check from the same edit, so the two halves of this rule cannot drift apart again. `skills/` is covered for a specific reason: the manifest `skills` field is **additive**, so an auto-discovered root `skills/` dir would ship AND load skills that never appear in `plugin.json`, bypassing the catalog guard entirely.

Subagents are an anonymous context-isolation mechanic, never a distributed "agent" asset.

**Identifier note.** The identifiers "D23" and "R9.3" are used for this rule in epic #213's requirements triage and resolve to **no record under `.pair/`** — and "D23" already denotes *mechanical isolation* in the skill corpus (`pair-process-implement/SKILL.md`), so the citation is ambiguous as well as unresolvable. Per the precedent in [2026-07-18-d22-classification-verdict-collapsed-details.md](./2026-07-18-d22-classification-verdict-collapsed-details.md), this ADL section is the record: code, tests, release checklists and docs cite **this ADL's Decision 5** in prose, never the bare identifiers.

**6. The CLI can be told not to install a source entry (`exclude`), as the enabler for one installed tree instead of two.**

"Pick one channel per project, not both" is currently a *documented* rule with no enforcement, and the both-installed resolution order was never observed (Consequences, below). The structural fix tracked as [#392](https://github.com/foomakers/pair/issues/392) is a setup skill that installs `pair-cli` and lets the CLI produce the tree — one channel, consistent paths. That needs one primitive the CLI did not have: the ability to leave a specific source entry out, so a skill whose only job is to bootstrap the CLI channel is not itself re-installed into the project by the CLI.

Hence a registry-level `exclude: string[]` in `pair.config.json`, threaded `RegistryConfig` → `SyncOptions` → the copy pipeline. What is decided about it, because each part is a place it could have gone wrong:

- **Segment-wise, never a string prefix.** Excluding `process/setup` drops `process/setup/**` and leaves `process/setup-helper` alone.
- **Filtered before validation and before any `mkdir`**, so an excluded entry cannot contribute a flatten collision, a directory mapping, a link-rewrite pass or a frontmatter sync — it is as if it were never in the source.
- **Both copy paths honor it through one shared `isExcluded`.** A registry may declare `exclude` with no `flatten`/`prefix`, which takes the plain copy path; that path walks the tree itself, so it consults the same predicate rather than a second implementation that could disagree.
- **A malformed `exclude` is a config error**, checked exactly like `include` (array of strings), not something the pipeline discovers and silently reads as "nothing excluded".
- **Limit — `exclude` means "never install", not "uninstall".** `behavior: overwrite` performs no cleanup, so an entry already present in the target from an earlier run is not removed when it later becomes excluded. Removing it is the operator's job.
- **No consumer yet.** It ships here as an enabler for #392 — verified by unit tests and the install smoke scenario, not by a live skill, because the skill that will use it does not exist yet. Shipping the mechanism with the story that motivates it, rather than inside #392, keeps #392 free to be about resolution rather than about the copy pipeline.

## Alternatives Considered

- **A slim plugin directory (`plugin/skills/*`) with symlinks into `.claude/skills/`**: Rejected. Copies less into the cache, but symlinks break on Windows clones without symlink support, and the skills' `.pair/knowledge/` pointers would dangle (the symlinked skill dir would not carry the KB).
- **Point `skills` at the dataset source (`packages/knowledge-hub/dataset/.skills/...`)**: Rejected. The dataset carries **unprefixed** skill names (`verify-quality`) and pre-transform cross-references, so the plugin channel would expose different skill names than the CLI channel and every doc reference (`/pair-capability-verify-quality`) would break.
- **One marketplace entry per skill (40 installable plugins)**: Rejected. It would put names and descriptions in the manifest (a drift surface) and force users to install one plugin per skill to get the catalog AC1 promises in one step.
- **Generate the manifest from the dataset at release time**: Rejected by the story itself (AC3) — a low-frequency-change manifest is not worth a pipeline step. The guard test gives the safety without the generation.
- **Pin `version` and add `.claude-plugin/plugin.json` to the `sync-version` gate**: Rejected for now. It would extend a docs-only (`.md`/`.mdx`) version-sync tool to JSON for a value that has no consumer benefit while the catalog tracks `main`. Revisit if the marketplace channel ever needs release-pinned distribution.

## Consequences

- `/plugin marketplace add foomakers/pair` → `/plugin install pair@pair` installs the full catalog; skills are invocable as `/pair:pair-next` or the bare `/pair-next`. Verified live with `claude --plugin-dir <repo>` on CLI v2.1.220: every declared skill loads from a directory outside the repo (40 at the time of the probe), `claude plugin validate .` passes (one expected version warning).
- **Marketplace resolution verified pre-merge, not merely inferred.** `claude plugin marketplace add` accepts a **path**, so the marketplace path is testable before the branch reaches `main`: sandboxed via `CLAUDE_CONFIG_DIR` against a clean checkout, `marketplace add <path>` → "Successfully added marketplace: pair", `plugin install pair@pair` → "Successfully installed", `claude plugin details pair@pair` → `Skills (40)`, `Agents (0)`, `Hooks (0)`, `MCP servers (0)`, `LSP servers (0)`, `Version: <commit sha>` — transcribed as observed, so the skill count is the catalog's size **on the day of the probe**; the integration page carries the same transcript pinned to the live count instead, which is why the two numbers may differ (confirming Decision 4's SHA fallback). The only residual gap is GitHub-shorthand resolution of `foomakers/pair`, which genuinely resolves only after merge.
- Installing the plugin copies the whole repository (~19 MB) into the plugin cache per version. Accepted: the marketplace clone already fetches the repo, and the KB has to travel with the skills.
- **Known limitation — adoption files resolve to pair's own, not the consuming project's.** Because `source: "./"` copies the whole repo into the plugin cache, `.pair/adoption/` travels *with* the skills. So a skill step that reads an adoption file finds one — pair's — and treats it as the project's. No graceful-degradation path fires: from the skill's point of view the adoption files are present. Concretely, on the marketplace channel a skill resolves pair's PM tool (`tech/way-of-working.md`: GitHub Projects, `foomakers/pair`, `#github` MCP), pair's `tech/risk-matrix.md` (`Active: risk`) and `tech/coverage-baseline.md` deltas, and pair's `tech/tech-stack.md` — while running with the *user's* credentials. Consequence: adoption-dependent skills (`/pair-capability-write-issue`, `/pair-process-review`, `/pair-capability-verify-quality`, `/pair-capability-record-decision`, and any process skill composing them) require the CLI channel (`pair-cli init`); the marketplace channel is safe for KB-only skills. Documented in the Claude Code integration page; the structural fix (project-scoped adoption resolution for the plugin channel) is tracked as [#392](https://github.com/foomakers/pair/issues/392), out of scope here.
- **Known limitation — adoption WRITES have no correct destination on the marketplace channel.** The read-side limitation above has a write-side twin, and it is worse. `/pair-capability-record-decision` is by its own frontmatter "the sole writer of adoption/context-map files" and resolves every target skill-relative (`../../../.pair/adoption/...`), so on the marketplace channel a recorded ADR/ADL is written **into the plugin cache** — invisible to the user's repository and destroyed by the next `/plugin update` (silent loss of a recorded decision). There is no workaround on this channel: decisions must be recorded on the CLI channel. Stated in the integration page's adoption callout; the fix is part of [#392](https://github.com/foomakers/pair/issues/392) (read *and* write resolution).
- **Bare vs prefixed skill names — verified, not assumed.** Plugin skills are exposed as `pair:pair-…`, while skill bodies and docs compose siblings by the bare `/pair-…` name. Checked live on CLI v2.1.220 from a directory outside the repo (`claude --plugin-dir <worktree>`, no pair skills in project or user scope): a composition pair loads by bare name — `pair-process-review` ACCEPTED, then `pair-capability-verify-quality` ACCEPTED — so cross-skill composition works on the plugin channel. That evidence covers the plugin as the **sole** source; the both-installed case (project `.claude/skills/` *and* plugin) was **not** observed, so the docs state only what is known: resolution order between the two sources is unspecified, don't rely on it, use the prefixed `/pair:pair-…` form when it must be certain. No automatic detection of the both-channels state exists yet.
- The manifest is a release-checklist item: `RELEASE.md` and the docs-site release-process page carry the three-line checklist, and the guard test enforces it in `pnpm test`.
- This packaging is a snapshot of an external spec. Re-verify the schema (and re-run `claude plugin validate .`) at each major Claude Code release.

## Adoption Impact

- No change to `adoption/tech/*`: this is a distribution/packaging convention, not an architecture or stack change. The release-process surfacing lives in [RELEASE.md](../../../RELEASE.md) and the docs-site release-process page.
- No dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records (the dataset is a curated sample, not an adoption mirror).
- Complements [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md): the catalog guard lives in a tested module, not in a script.
