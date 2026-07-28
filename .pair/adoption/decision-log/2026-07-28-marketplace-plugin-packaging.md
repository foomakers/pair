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

40 explicit `./.claude/skills/pair-<flattened-name>` entries, not a single `./.claude/skills/` glob. Reason: `.claude/skills/` also holds `agent-browser`, a third-party skill this repo consumes; non-declaration means it is **never exposed or loaded as a distributed pair skill**. Explicit entries make the distributed catalog a deliberate list.

Note precisely what that does and does not buy: with `source: "./"` the whole repo is the payload, so `agent-browser` (and `.claude/agents/{reviewer,implementer,contract-generator}.md`) **is still copied** into every user's plugin cache — non-declaration is a *loading* control, not a redistribution control. The payload-level skills-only guarantee (D23 / R9.3) comes from a different fact: Claude Code discovers plugin agents, commands, hooks and MCP servers from **root-level** `agents/`, `commands/`, `hooks/`, `.mcp.json` — none of which exist in this repo (pair's own subagents live under `.claude/agents/`, which the plugin loader ignores). The catalog guard asserts that absence, so the guarantee is enforced rather than assumed. Anything that genuinely must not be redistributed cannot live inside the plugin root at all.

Skill **names and descriptions are NOT duplicated into the manifest** — they stay in each `SKILL.md` frontmatter, which the mirror-equality guard already pins byte-for-byte to its dataset source. Copying them into the manifest would create a second drift surface for zero gain.

The manual process gets an automatic backstop: the catalog guard (`packages/knowledge-hub/src/tools/claude-plugin-manifest.ts` + colocated test, per the gate-tooling-in-tested-modules ADL) derives the expected list from the dataset through the real install transform and fails naming the exact entry to add or remove. It **asserts, never generates** — the manifest stays hand-written, as the story requires.

**4. No `version` is pinned, in either manifest.**

Claude Code falls back to the git commit SHA when `version` is absent, so `/plugin update` always yields the current catalog. A pinned version in a hand-maintained file would strand every user at the last version somebody remembered to bump — a worse failure than no pin. `claude plugin validate --strict` warns about the omission; that warning is the accepted tradeoff and is documented in the release checklist.

**5. Skills only — no `agents`, `hooks`, or `mcpServers` (D23, R9.3).**

The guard fails if `agents`, `hooks` or `mcpServers` appears in either manifest (all three keys, one message — `hooks` is the highest-consequence one: shell commands that would run on every installed user's machine), and also if a root-level `agents/`, `commands/`, `hooks/` or `.mcp.json` ever appears in the plugin root. Subagents are an anonymous context-isolation mechanic, never a distributed "agent" asset.

## Alternatives Considered

- **A slim plugin directory (`plugin/skills/*`) with symlinks into `.claude/skills/`**: Rejected. Copies less into the cache, but symlinks break on Windows clones without symlink support, and the skills' `.pair/knowledge/` pointers would dangle (the symlinked skill dir would not carry the KB).
- **Point `skills` at the dataset source (`packages/knowledge-hub/dataset/.skills/...`)**: Rejected. The dataset carries **unprefixed** skill names (`verify-quality`) and pre-transform cross-references, so the plugin channel would expose different skill names than the CLI channel and every doc reference (`/pair-capability-verify-quality`) would break.
- **One marketplace entry per skill (40 installable plugins)**: Rejected. It would put names and descriptions in the manifest (a drift surface) and force users to install 40 plugins to get the catalog AC1 promises in one step.
- **Generate the manifest from the dataset at release time**: Rejected by the story itself (AC3) — a low-frequency-change manifest is not worth a pipeline step. The guard test gives the safety without the generation.
- **Pin `version` and add `.claude-plugin/plugin.json` to the `sync-version` gate**: Rejected for now. It would extend a docs-only (`.md`/`.mdx`) version-sync tool to JSON for a value that has no consumer benefit while the catalog tracks `main`. Revisit if the marketplace channel ever needs release-pinned distribution.

## Consequences

- `/plugin marketplace add foomakers/pair` → `/plugin install pair@pair` installs the full catalog; skills are invocable as `/pair:pair-next` or the bare `/pair-next`. Verified live with `claude --plugin-dir <repo>` on CLI v2.1.220: all 40 skills load from a directory outside the repo, `claude plugin validate .` passes (one expected version warning).
- Installing the plugin copies the whole repository (~19 MB) into the plugin cache per version. Accepted: the marketplace clone already fetches the repo, and the KB has to travel with the skills.
- **Known limitation — adoption files resolve to pair's own, not the consuming project's.** Because `source: "./"` copies the whole repo into the plugin cache, `.pair/adoption/` travels *with* the skills. So a skill step that reads an adoption file finds one — pair's — and treats it as the project's. No graceful-degradation path fires: from the skill's point of view the adoption files are present. Concretely, on the marketplace channel a skill resolves pair's PM tool (`tech/way-of-working.md`: GitHub Projects, `foomakers/pair`, `#github` MCP), pair's `tech/risk-matrix.md` (`Active: risk`) and `tech/coverage-baseline.md` deltas, and pair's `tech/tech-stack.md` — while running with the *user's* credentials. Consequence: adoption-dependent skills (`/pair-capability-write-issue`, `/pair-process-review`, `/pair-capability-verify-quality`, and any process skill composing them) require the CLI channel (`pair-cli init`); the marketplace channel is safe for KB-only skills. Documented in the Claude Code integration page; the structural fix (project-scoped adoption resolution for the plugin channel) is tracked as [#392](https://github.com/foomakers/pair/issues/392), out of scope here.
- **Bare vs prefixed skill names — verified, not assumed.** Plugin skills are exposed as `pair:pair-…`, while skill bodies and docs compose siblings by the bare `/pair-…` name. Checked live on CLI v2.1.220 from a directory outside the repo (`claude --plugin-dir <worktree>`, no pair skills in project or user scope): a composition pair loads by bare name — `pair-process-review` ACCEPTED, then `pair-capability-verify-quality` ACCEPTED — so cross-skill composition works on the plugin channel. Bare resolution depends on uniqueness, which installing both channels destroys; that consequence (ambiguous bare names degrade multi-phase processes, not just tidiness) is now spelled out next to the channel table. No automatic detection of the both-channels state exists yet.
- The manifest is a release-checklist item: `RELEASE.md` and the docs-site release-process page carry the three-line checklist, and the guard test enforces it in `pnpm test`.
- This packaging is a snapshot of an external spec. Re-verify the schema (and re-run `claude plugin validate .`) at each major Claude Code release.

## Adoption Impact

- No change to `adoption/tech/*`: this is a distribution/packaging convention, not an architecture or stack change. The release-process surfacing lives in [RELEASE.md](../../../RELEASE.md) and the docs-site release-process page.
- No dataset mirror: sibling ADLs in `adoption/decision-log/` are adoption-only records (the dataset is a curated sample, not an adoption mirror).
- Complements [2026-07-13-gate-tooling-code-in-tested-modules.md](./2026-07-13-gate-tooling-code-in-tested-modules.md): the catalog guard lives in a tested module, not in a script.
