/**
 * Guard helpers for the repo-root `.claude-plugin/` pair — `marketplace.json`
 * (the catalog Claude Code reads on `/plugin marketplace add foomakers/pair`)
 * and `plugin.json` (the `pair` plugin manifest that declares which skill
 * directories ship).
 *
 * Both files are **hand-maintained by design** (story #277 AC3): they are a
 * release-checklist item, not a build artifact. These helpers therefore never
 * generate or rewrite a manifest — they only assert, and fail loudly with the
 * exact hand edit to make, so the manual process has an automatic backstop for
 * its one real risk (a skill added/renamed/removed without a manifest update).
 *
 * The plugin is a **bootstrap payload, not the catalog**: its root is
 * `packages/knowledge-hub/dataset/plugin` (the marketplace entry's
 * `source`), and it ships the skills authored under that root's `skills/` — today
 * exactly one, which installs `pair-cli` and lets the CLI produce the project's
 * knowledge base and full skill catalog. The 40-odd distributed skills therefore
 * travel through the CLI only; the marketplace channel is the entry point to it,
 * not a second copy of it.
 *
 * Two consequences worth stating, because the previous shape (`source: "./"`, the
 * whole repo as payload) had the opposite ones. Nothing in the plugin cache can
 * resolve pair's own `.pair/adoption/` any more, so adoption reads and writes on
 * this channel are no longer silently answered by pair's files. And the expected
 * catalog is derived from the bootstrap corpus on disk rather than from the
 * dataset, so it stays a derived list — a new bootstrap skill extends it with no
 * code edit — without pinning 40 hand-maintained entries.
 *
 * The bootstrap corpus sits OUTSIDE `dataset/.skills/`, so neither
 * `skills:conformance` nor the mirror-equality guard sees it.
 * {@link assertBootstrapSkillsValid} is what replaces them.
 *
 * Validation follows Claude Code's published schemas (required fields only —
 * `claude-code-marketplace.json` / `claude-code-plugin-manifest.json` on
 * schemastore), plus two project rules a generic schema can't express:
 * kebab-case public names, and skills-only distribution — an **allowlist** of
 * permitted keys on each of the three hand-edited surfaces (the plugin manifest,
 * the marketplace manifest's own top level, and each `plugins[]` entry), so a
 * component key the schema adds tomorrow fails closed, plus the absence of a
 * root-level component payload other than the declared `skills/`. That list is
 * derived from the schema's component keys rather than hand-enumerated, so the two
 * halves of the rule cannot drift apart.
 *
 * Rule of record for skills-only distribution:
 * `.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md`
 * (Decision 5). The identifiers "D23 / R9.3" used elsewhere for this rule come
 * from epic #213's requirements triage and resolve to no in-repo record — and
 * "D23" already denotes *mechanical isolation* in the skill corpus — so this
 * module cites the ADL, never the bare identifiers.
 */

/**
 * Skill dirs are declared relative to the PLUGIN ROOT, which is
 * `packages/knowledge-hub/dataset/plugin` (the marketplace entry's
 * `source`) — not the repository root. See the ADL's Decision 1.
 */
export const SKILL_PATH_PREFIX = './skills/'

/** The plugin root, repo-relative: what the marketplace entry's `source` names. */
export const PLUGIN_ROOT_REL = 'packages/knowledge-hub/dataset/plugin'

/** The plugin manifest's repo-relative path, for error messages. */
/**
 * The plugin manifest's repo-relative path. Claude Code looks for it at
 * `<plugin root>/.claude-plugin/plugin.json` — probe-verified: `claude plugin validate`
 * on a directory holding a bare `plugin.json` fails with "No manifest found".
 */
export const PLUGIN_MANIFEST_REL = `${PLUGIN_ROOT_REL}/.claude-plugin/plugin.json`

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface ManifestOwner {
  name: string
  email?: string
  url?: string
}

/** A `plugins[]` entry of `marketplace.json` (required fields typed). */
export interface MarketplacePluginEntry {
  name: string
  source: string | Record<string, unknown>
  [key: string]: unknown
}

export interface MarketplaceManifest {
  name: string
  owner: ManifestOwner
  plugins: MarketplacePluginEntry[]
  [key: string]: unknown
}

export interface PluginManifest {
  name: string
  skills?: unknown
  [key: string]: unknown
}

const fail = (message: string): never => {
  throw new Error(message)
}

const parseJson = (json: string, label: string): Record<string, unknown> => {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (err) {
    return fail(`${label} is not valid JSON: ${(err as Error).message}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(`${label} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

/** Non-empty, kebab-case: these names are public (`/plugin install <p>@<m>`). */
const requirePublicName = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(`${label} is required and must be a non-empty string`)
  }
  if (!KEBAB_CASE.test(value)) {
    return fail(`${label} must be kebab-case (got ${JSON.stringify(value)})`)
  }
  return value
}

const requireRelativePath = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(`${label} must be a non-empty string`)
  }
  if (!value.startsWith('./')) {
    return fail(`${label} must be a plugin-root-relative path starting with './' (got ${value})`)
  }
  // A plugin cannot reach outside its own root (installed plugins are copied into
  // ~/.claude/plugins/cache), so a '..' segment is never a valid component path —
  // name that mistake here instead of letting it surface as a vague "stale entry".
  if (value.split('/').includes('..')) {
    return fail(
      `${label} must stay inside the plugin root — a '..' segment escapes it and cannot ` +
        `resolve in the plugin cache (got ${value})`,
    )
  }
  return value
}

const parsePluginEntry = (entry: unknown, label: string): MarketplacePluginEntry => {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return fail(`${label} must be an object`)
  }
  const record = entry as Record<string, unknown>
  const name = requirePublicName(record['name'], `${label}.name`)
  const source = record['source']
  if (typeof source === 'string') {
    requireRelativePath(source, `${label}.source`)
  } else if (typeof source === 'object' && source !== null && !Array.isArray(source)) {
    if (typeof (source as Record<string, unknown>)['source'] !== 'string') {
      fail(`${label}.source object must carry a 'source' kind (github | url | git-subdir | npm)`)
    }
  } else {
    fail(`${label}.source is required (a './'-relative path or a source object)`)
  }
  return { ...record, name, source: source as string | Record<string, unknown> }
}

/**
 * Parses `.claude-plugin/marketplace.json`, enforcing the schema's required
 * fields (`name`, `owner.name`, non-empty `plugins[]` each with `name` +
 * `source`). Throws a message naming the file so a broken manifest is
 * attributed correctly instead of surfacing as a downstream type error.
 */
export function parseMarketplaceManifest(
  json: string,
  label = '.claude-plugin/marketplace.json',
): MarketplaceManifest {
  const raw = parseJson(json, label)
  const name = requirePublicName(raw['name'], `${label}: name`)

  const owner = raw['owner']
  if (typeof owner !== 'object' || owner === null || Array.isArray(owner)) {
    fail(`${label}: owner is required and must be an object with a name`)
  }
  const ownerName = (owner as Record<string, unknown>)['name']
  if (typeof ownerName !== 'string' || ownerName.trim() === '') {
    fail(`${label}: owner.name is required and must be a non-empty string`)
  }

  const plugins = raw['plugins']
  if (!Array.isArray(plugins) || plugins.length === 0) {
    fail(`${label}: plugins is required and must list at least one plugin entry`)
  }

  return {
    ...raw,
    name,
    owner: owner as ManifestOwner,
    plugins: (plugins as unknown[]).map((entry, i) =>
      parsePluginEntry(entry, `${label}: plugins[${i}]`),
    ),
  }
}

/**
 * Parses `.claude-plugin/plugin.json`. `name` is the only field Claude Code
 * requires; `skills`, when present, must be a `./`-relative path or a list of
 * them (validated here so a typo fails the guard rather than silently loading
 * zero skills at install time).
 */
export function parsePluginManifest(
  json: string,
  label = '.claude-plugin/plugin.json',
): PluginManifest {
  const raw = parseJson(json, label)
  const name = requirePublicName(raw['name'], `${label}: name`)

  const skills = raw['skills']
  if (skills !== undefined) {
    if (typeof skills === 'string') {
      requireRelativePath(skills, `${label}: skills`)
    } else if (Array.isArray(skills)) {
      skills.forEach((entry, i) => requireRelativePath(entry, `${label}: skills[${i}]`))
    } else {
      fail(`${label}: skills must be a string or an array of strings`)
    }
  }

  return { ...raw, name }
}

/**
 * Normalizes a manifest `skills` value (string | array | absent) to a list of
 * paths with trailing slashes stripped, so a purely cosmetic path style never
 * registers as catalog drift.
 */
export function declaredSkillPaths(skills: unknown): string[] {
  const list =
    skills === undefined || skills === null ? [] : Array.isArray(skills) ? skills : [skills]
  return list
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.replace(/\/+$/, ''))
}

/**
 * The skill directories the manifest MUST declare: every skill dir present under
 * the plugin root's `skills/`. Derived from disk, never hardcoded — adding a
 * bootstrap skill extends the expected catalog with no code edit, exactly as the
 * dataset-derived version did before the payload shrank.
 *
 * `skillDirs` is injected (the assertion stays filesystem-free), and each name is
 * a directory name, not a path: the prefix is added here so the manifest's path
 * style lives in ONE place.
 */
export function expectedPluginSkillPaths(skillDirs: string[]): string[] {
  return skillDirs.map(dir => `${SKILL_PATH_PREFIX}${dir}`).sort()
}

/**
 * Asserts the hand-maintained catalog equals the one derived from the bootstrap corpus. Throws
 * naming every missing entry (skill added to the KB, manifest not updated) and
 * every stale entry (skill renamed/removed, manifest not updated), together
 * with the file to edit — the automatic backstop for AC3's manual process.
 */
export function assertSkillCatalogInSync(declared: string[], expected: string[]): void {
  // Both sets are built explicitly (never as a side effect of the duplicate scan), so
  // reordering or short-circuiting the checks below can't make this guard fail open.
  const declaredSet = new Set(declared)
  const expectedSet = new Set(expected)

  const duplicates = declared.filter((path, i) => declared.indexOf(path) !== i)
  if (duplicates.length > 0) {
    fail(
      `${PLUGIN_MANIFEST_REL} declares duplicate skill entries: ${[...new Set(duplicates)].join(', ')}. ` +
        `Remove the repeated line(s).`,
    )
  }

  const missing = expected.filter(path => !declaredSet.has(path))
  const stale = declared.filter(path => !expectedSet.has(path))
  if (missing.length === 0 && stale.length === 0) return

  const parts = [
    `${PLUGIN_MANIFEST_REL} skill catalog is out of sync with the bootstrap corpus ` +
      `(${PLUGIN_ROOT_REL}/skills). The manifest is hand-maintained — ` +
      `edit it by hand (see the skill-marketplace step in RELEASE.md):`,
  ]
  if (missing.length > 0) {
    parts.push(`  missing (add to "skills"):\n${missing.map(p => `    + ${p}`).join('\n')}`)
  }
  if (stale.length > 0) {
    parts.push(
      `  stale (no such bootstrap skill — remove from "skills"):\n${stale.map(p => `    - ${p}`).join('\n')}`,
    )
  }
  fail(parts.join('\n'))
}

/**
 * Asserts every declared skill directory actually holds a `SKILL.md`, so a
 * manifest entry can never point at a path that no longer exists (the stale
 * pointer AC2/edge-case calls out). `hasSkillMd` is injected — the assertion
 * itself stays filesystem-free.
 */
export function assertDeclaredSkillsResolve(
  declared: string[],
  hasSkillMd: (relPath: string) => boolean,
): void {
  const broken = declared.filter(path => !hasSkillMd(path))
  if (broken.length > 0) {
    fail(
      `${PLUGIN_MANIFEST_REL} declares skill dirs with no SKILL.md:\n` +
        `${broken.map(p => `    - ${p}/SKILL.md`).join('\n')}\n` +
        `These are authored files, not generated — fix the manifest path, or add the missing ` +
        `SKILL.md under ${PLUGIN_ROOT_REL}/skills/.`,
    )
  }
}

/**
 * Just the fenced code blocks of a markdown document, concatenated — the part an agent
 * executes rather than reads. Used to scope the escape-path check away from prose.
 */
function fencedBlocks(markdown: string): string {
  const out: string[] = []
  let open = false
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      open = !open
      continue
    }
    if (open) out.push(line)
  }
  return out.join('\n')
}

/** A bootstrap skill as read from disk: its directory name and its SKILL.md text. */
export interface BootstrapSkillFile {
  dir: string
  content: string
}

/**
 * Asserts every bootstrap skill is a valid, ISOLATED skill.
 *
 * These files are authored under the plugin root rather than generated from
 * `dataset/.skills/`, which is what keeps the CLI from installing them into a
 * consuming project — but it also puts them outside `skills:conformance` and
 * outside the mirror-equality guard. This is the replacement, and it checks the
 * three things those two would have caught:
 *
 * - **Frontmatter present and self-consistent** — `name` equals the directory
 *   name (the invocable name IS the directory here, since no install transform
 *   renames it), plus a non-empty `description` and a `version`.
 * - **No knowledge-base or adoption LINK.** The load-bearing property: a bootstrap
 *   skill runs BEFORE the knowledge base exists in the project, and its own payload
 *   lives in the plugin cache — so a relative link out of it resolves to pair's KB or
 *   to nothing. Either way it answers for the wrong project, and it is exactly the
 *   kind of edit that looks harmless in review.
 *
 *   Note what is NOT banned, deliberately: reading the project's `.pair/llms.txt` at
 *   runtime, relative to the working directory, after checking it exists. That is the
 *   user's own installed KB and is how the assistant answers project questions. This
 *   guard matches LINK TARGETS precisely so that the useful half stays legal.
 *
 * `files` is injected, so the assertion itself stays filesystem-free.
 */
export function assertBootstrapSkillsValid(files: BootstrapSkillFile[]): void {
  if (files.length === 0) {
    fail(
      `No bootstrap skill found under ${PLUGIN_ROOT_REL}/skills. The plugin ships that corpus ` +
        `and nothing else, so an empty one means the marketplace channel installs no skill at all.`,
    )
  }

  const problems = files.flatMap(file => [...frontmatterProblems(file), ...isolationProblems(file)])

  if (problems.length > 0) {
    fail(
      `Invalid bootstrap skill(s) under ${PLUGIN_ROOT_REL}/skills:\n` +
        problems.map(p => `    - ${p}`).join('\n'),
    )
  }
}

/**
 * Frontmatter self-consistency. `name` must equal the DIRECTORY: these skills are
 * authored, so no install transform assigns the invocable name, and the directory is
 * the only other place it appears.
 */
function frontmatterProblems({ dir, content }: BootstrapSkillFile): string[] {
  const problems: string[] = []
  const name = /^name:\s*(.+?)\s*$/m.exec(content)?.[1]
  if (name !== dir) {
    problems.push(`${dir}: frontmatter name is ${JSON.stringify(name ?? null)}, expected ${dir}`)
  }
  if (!/^description:\s*"[^"]/m.test(content)) {
    problems.push(`${dir}: frontmatter needs a non-empty quoted description`)
  }
  if (!/^version:\s*\d+\.\d+\.\d+\s*$/m.test(content)) {
    problems.push(`${dir}: frontmatter needs a semver version`)
  }
  return problems
}

/**
 * The isolation invariant, in two checks, because the promise is wider than a link.
 *
 * (a) LINK TARGETS, not mentions: the skill legitimately explains its own isolation in
 * prose ("every other pair skill links into `.pair/knowledge/**`"), and a substring
 * match would redden on the sentence documenting the rule it obeys — the false-positive
 * shape that gets a guard disabled.
 *
 * (b) A SKILL-RELATIVE ESCAPE inside a FENCED BLOCK — the commands an agent runs, which
 * (a) does not see. `../…/.pair/knowledge/…` resolves into the plugin cache; a bare
 * `.pair/llms.txt` is cwd-relative, reads the USER's project, and is exactly what this
 * skill is for, so only the `../` form is rejected. Scoped to fences ON PURPOSE, and not
 * from caution: the whole-file version was written first and it reddened on this very
 * skill, which quotes the forbidden shape to explain what is forbidden. Prose is
 * exposition; a fence is an instruction.
 */
function isolationProblems({ dir, content }: BootstrapSkillFile): string[] {
  const problems: string[] = []
  const link = /\]\(([^)]*\.pair\/(?:knowledge|adoption)[^)]*)\)/.exec(content)
  if (link) {
    problems.push(
      `${dir}: links to ${link[1]} — a bootstrap skill must be ISOLATED, since it runs before ` +
        `the knowledge base exists in the project and the only one within reach on this ` +
        `channel is pair's own. State what it needs inline instead of linking.`,
    )
  }

  const escape = /(?:\.\.\/)+[^\s)`'"]*\.pair\/(?:knowledge|adoption)/.exec(fencedBlocks(content))
  if (escape) {
    problems.push(
      `${dir}: contains the skill-relative path '${escape[0]}' — a '../' escape resolves ` +
        `INSIDE the plugin cache, i.e. against pair's own knowledge base rather than the ` +
        `user's project. Read the project's files relative to the working directory instead.`,
    )
  }
  return problems
}

/**
 * Every component/behaviour key the published schemas declare — i.e. every key
 * that adds an asset to the plugin or changes host behaviour, as opposed to plain
 * metadata. Verified against schemastore on 2026-07-30:
 * `claude-code-plugin-manifest.json` has 22 properties, 13 of them these;
 * `claude-code-marketplace.json`'s `plugins[]` item has 26 — the same 13 plus
 * `source`, `category`, `tags`, `strict`.
 *
 * Exported for documentation and for the guard test's drift injection. The
 * assertion below works off the allowlists, not this list, so a component key a
 * future schema revision introduces is rejected without touching this file.
 */
export const SCHEMA_COMPONENT_KEYS = [
  'agents',
  'channels',
  'commands',
  'dependencies',
  'hooks',
  'lspServers',
  'mcpServers',
  'monitors',
  'outputStyles',
  'settings',
  'skills',
  'themes',
  'userConfig',
] as const

/** Metadata-only keys of the plugin manifest schema (the other 9 of its 22). */
export const PLUGIN_METADATA_KEYS = [
  '$schema',
  'name',
  'description',
  'version',
  'author',
  'homepage',
  'repository',
  'license',
  'keywords',
] as const

/**
 * Keys `.claude-plugin/plugin.json` may declare: metadata plus `skills`. An
 * ALLOWLIST, deliberately — a denylist of `agents`/`hooks`/`mcpServers` leaves
 * `settings` (merged into every user's settings), `dependencies` (auto-enables a
 * third-party plugin, with its own hooks, on every user's machine), `monitors`
 * (unsandboxed background scripts, the same trust tier as hooks) and `commands`
 * permitted, all of which pass `claude plugin validate`.
 */
export const ALLOWED_PLUGIN_MANIFEST_KEYS = [...PLUGIN_METADATA_KEYS, 'skills'] as const

/**
 * Keys a `marketplace.json` `plugins[]` entry may declare: metadata plus the
 * marketplace-only `source`/`category`/`tags`/`strict`. `skills` is deliberately
 * NOT permitted here — the schema allows it on the entry, where it REPLACES
 * `plugin.json`'s catalog, and {@link assertSkillCatalogInSync} reads
 * `plugin.json` only. One hand-added key would therefore void the catalog guard
 * (verified: an entry-level `"skills": ["./.claude/skills/agent-browser"]`
 * replaces the plugin's whole catalog with that one entry, with `claude plugin validate` and
 * every other guard still passing).
 */
export const ALLOWED_MARKETPLACE_ENTRY_KEYS = [
  ...PLUGIN_METADATA_KEYS,
  'source',
  'category',
  'tags',
  'strict',
] as const

/**
 * Keys `.claude-plugin/marketplace.json` may declare at its OWN top level — the
 * third surface, distinct from the plugin manifest and from each `plugins[]`
 * entry. The schema gives it 9 properties (verified against schemastore
 * 2026-07-30); the two omitted here change host behaviour rather than describing
 * the marketplace:
 * - `forceRemoveDeletedPlugins` — lets the marketplace uninstall plugins from a
 *   user's machine on refresh;
 * - `allowCrossMarketplaceDependenciesOn` — extends trust to plugins from other
 *   marketplaces (the `dependencies` hole one level up).
 *
 * `metadata` is permitted for its descriptive fields only; its `pluginRoot`
 * sub-key is rejected separately by {@link assertSkillsOnlyDistribution} because
 * it relocates the base path of relative plugin sources, i.e. silently changes
 * which directory ships as the payload from under the entry's `source` (ADL Decision 1).
 */
export const ALLOWED_MARKETPLACE_MANIFEST_KEYS = [
  '$schema',
  'name',
  'description',
  'owner',
  'plugins',
  'version',
  'metadata',
] as const

/** `metadata` sub-keys that only describe the marketplace (see above). */
export const ALLOWED_MARKETPLACE_METADATA_KEYS = ['version', 'description'] as const

export type ManifestKind = 'plugin' | 'marketplace' | 'marketplace-entry'

const ALLOWLIST_BY_KIND: Record<ManifestKind, readonly string[]> = {
  plugin: ALLOWED_PLUGIN_MANIFEST_KEYS,
  marketplace: ALLOWED_MARKETPLACE_MANIFEST_KEYS,
  'marketplace-entry': ALLOWED_MARKETPLACE_ENTRY_KEYS,
}

const KIND_DESCRIPTION: Record<ManifestKind, { subject: string; permitted: string }> = {
  plugin: { subject: 'plugin manifest', permitted: 'metadata plus "skills"' },
  marketplace: {
    subject: 'marketplace manifest',
    permitted: 'marketplace metadata plus "owner"/"plugins"',
  },
  'marketplace-entry': {
    subject: 'marketplace entry',
    permitted: 'metadata plus "source"/"category"/"tags"/"strict"',
  },
}

/**
 * Offending `metadata.*` sub-keys on a marketplace manifest. `metadata` is allowed
 * for its descriptive fields, so its behaviour-bearing sub-key needs its own check
 * — an allowlist over top-level keys alone would let `metadata.pluginRoot` through.
 */
function offendingMetadataKeys(manifest: Record<string, unknown>, kind: ManifestKind): string[] {
  if (kind !== 'marketplace') return []
  const metadata = manifest['metadata']
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return []
  return Object.keys(metadata as Record<string, unknown>)
    .filter(key => !ALLOWED_MARKETPLACE_METADATA_KEYS.includes(key as never))
    .map(key => `metadata.${key}`)
}

/**
 * Asserts a manifest declares only allowlisted keys — the automatic half of
 * skills-only distribution (ADL `2026-07-28-marketplace-plugin-packaging.md`,
 * Decision 5). Covers all three hand-edited surfaces: the plugin manifest, the
 * marketplace manifest's own top level, and each of its `plugins[]` entries.
 * Subagents are an anonymous context-isolation mechanic, never a shipped "agent"
 * asset; hooks, MCP/LSP servers, monitors and commands are execution surfaces pair
 * does not distribute; `settings`/`userConfig`/`dependencies` mutate or extend the
 * host.
 */
export function assertSkillsOnlyDistribution(
  label: string,
  manifest: Record<string, unknown>,
  kind: ManifestKind = 'plugin',
): void {
  const allowed = ALLOWLIST_BY_KIND[kind]
  const declared = Object.keys(manifest).filter(
    key => manifest[key] !== undefined && !allowed.includes(key),
  )
  const nested = offendingMetadataKeys(manifest, kind)

  const offending = [...declared, ...nested]
  if (offending.length === 0) return

  const { subject, permitted } = KIND_DESCRIPTION[kind]
  const catalogNote =
    kind === 'marketplace-entry' && declared.includes('skills')
      ? ` A "skills" key on a marketplace entry REPLACES plugin.json's catalog and is invisible to ` +
        `assertSkillCatalogInSync, which reads plugin.json only — the catalog is plugin.json's alone.`
      : ''
  const pluginRootNote = nested.includes('metadata.pluginRoot')
    ? ` "metadata.pluginRoot" rebases relative plugin sources, so it silently changes which ` +
      `directory ships as the plugin payload from under the entry's source.`
    : ''
  fail(
    `${label} declares ${offending.map(k => `"${k}"`).join(', ')}: pair distributes skills only — ` +
      `a ${subject} may carry ${permitted} and ` +
      `nothing else (an allowlist, so an unknown or newly specified key fails closed).${catalogNote}` +
      `${pluginRootNote} ` +
      `Component/behaviour keys ship execution surfaces (hooks, mcpServers, lspServers, monitors, ` +
      `commands), auto-enable third-party plugins (dependencies, ` +
      `allowCrossMarketplaceDependenciesOn) or mutate the host (settings, userConfig, channels, ` +
      `outputStyles, themes, forceRemoveDeletedPlugins); subagents are an anonymous ` +
      `context-isolation mechanic, never a distributed agent asset. Remove the field(s) — rule of ` +
      `record: .pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md, Decision 5.`,
  )
}

/**
 * Paths Claude Code discovers plugin components from, relative to the plugin
 * root. With `source: "./"` the plugin root is the whole repository, so leaving a
 * key out of `plugin.json` prevents a component from being *loaded*, never from
 * being *copied* into every user's plugin cache. The payload-level skills-only
 * guarantee is therefore the absence of these paths at the repo root (ADL
 * `2026-07-28-marketplace-plugin-packaging.md`, Decision 5).
 *
 * DERIVED from {@link SCHEMA_COMPONENT_KEYS} — one directory per component key —
 * rather than hand-enumerated, so this list can never lag the schema by one
 * corner again (`monitors`, for instance: "background watch scripts the host arms
 * as persistent Monitor tasks, unsandboxed, same trust tier as hooks"). A key a
 * future schema revision introduces extends the allowlist rejection AND this
 * root-payload check from the same edit. Guarding a name Claude Code happens not
 * to auto-discover costs nothing — pair ships no root component directory under
 * any of these names, and the failure message says where they belong instead.
 *
 * `skills` is the ONE exception, and only since the payload shrank: the plugin root
 * IS the bootstrap corpus's parent, so `skills/` sits at that root by construction.
 * Auto-discovery and the manifest therefore agree instead of competing — the whole
 * payload is the two files we mean to ship, so there is no undeclared skill for
 * auto-discovery to leak. Under the previous shape (`source: "./"`, the whole repo)
 * the same directory name WAS a hazard, which is why it is called out here rather
 * than quietly dropped.
 *
 * `.mcp.json` is the one root path that is a file rather than a directory named
 * after its key, so it is appended explicitly.
 */
export const ROOT_PLUGIN_COMPONENT_PATHS = [
  ...SCHEMA_COMPONENT_KEYS.filter(key => key !== 'skills'),
  '.mcp.json',
] as const

/**
 * Asserts no root-level plugin component path exists. `exists` is injected — the
 * assertion itself stays filesystem-free.
 */
export function assertNoRootPluginComponents(exists: (relPath: string) => boolean): void {
  // `exists` resolves relative to the PLUGIN root, not the repo root — the caller
  // supplies that base, so moving the plugin root needs no change here.
  const present = ROOT_PLUGIN_COMPONENT_PATHS.filter(path => exists(path))
  if (present.length > 0) {
    fail(
      `The plugin root (${PLUGIN_ROOT_REL}) carries plugin component ` +
        `path(s) ${present.join(', ')}: Claude Code auto-discovers components there regardless of ` +
        `what plugin.json declares (a root monitors/ or hooks/ would arm unsandboxed scripts on ` +
        `every installed machine). pair's plugin ships the bootstrap skills/ dir and nothing ` +
        `else — remove them. ` +
        `Rule of record: ` +
        `.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md, Decision 5.`,
    )
  }
}
