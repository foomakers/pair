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
 * The expected catalog is derived from the canonical dataset
 * (`packages/knowledge-hub/dataset/.skills/`) through the same install
 * transform `pair update` applies (`installedSkillDir` in `skill-md-mirror.ts`),
 * so there is exactly ONE source of truth for the skill catalog across both
 * distribution channels (D1: marketplace + CLI). Skill *names and descriptions*
 * are not duplicated into the manifest at all — they live in each installed
 * `SKILL.md` frontmatter, which the mirror-equality guard already pins
 * byte-for-byte to its dataset source, so no description-drift surface exists.
 *
 * Validation follows Claude Code's published schemas (required fields only —
 * `claude-code-marketplace.json` / `claude-code-plugin-manifest.json` on
 * schemastore), plus two project rules a generic schema can't express:
 * kebab-case public names, and skills-only distribution — an **allowlist** of
 * permitted keys in either manifest (so a component key the schema adds tomorrow
 * fails closed), plus the absence of a root-level component payload, since
 * `source: "./"` makes the repo the plugin root.
 *
 * Rule of record for skills-only distribution:
 * `.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md`
 * (Decision 5). The identifiers "D23 / R9.3" used elsewhere for this rule come
 * from epic #213's requirements triage and resolve to no in-repo record — and
 * "D23" already denotes *mechanical isolation* in the skill corpus — so this
 * module cites the ADL, never the bare identifiers.
 */
import { datasetSkillDirs, installedSkillDir, type DatasetTree } from './skill-md-mirror'

/**
 * Plugin-root-relative prefix of every declared skill directory. The plugin's
 * `source` is the marketplace root (`"./"` — the repo), so the installed root
 * mirror `.claude/skills/<prefixed>/` is what ships; that also keeps each
 * skill's relative KB links (`../../../.pair/knowledge/...`) resolvable inside
 * the plugin cache.
 */
export const SKILL_PATH_PREFIX = './.claude/skills/'

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
 * The skill directories the manifest MUST declare, derived from the dataset
 * tree through the real install transform: every dataset skill dir becomes
 * `./.claude/skills/<prefixed>`. Sorted, so the expected catalog is stable and
 * never a hardcoded list (a new dataset skill extends it with no code edit).
 */
export function expectedPluginSkillPaths(tree: DatasetTree): string[] {
  return datasetSkillDirs(tree)
    .map(dir => `${SKILL_PATH_PREFIX}${installedSkillDir(dir)}`)
    .sort()
}

/**
 * Asserts the hand-maintained catalog equals the dataset-derived one. Throws
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
      `.claude-plugin/plugin.json declares duplicate skill entries: ${[...new Set(duplicates)].join(', ')}. ` +
        `Remove the repeated line(s).`,
    )
  }

  const missing = expected.filter(path => !declaredSet.has(path))
  const stale = declared.filter(path => !expectedSet.has(path))
  if (missing.length === 0 && stale.length === 0) return

  const parts = [
    `.claude-plugin/plugin.json skill catalog is out of sync with the dataset ` +
      `(packages/knowledge-hub/dataset/.skills). The manifest is hand-maintained — ` +
      `edit it by hand (see the skill-marketplace step in RELEASE.md):`,
  ]
  if (missing.length > 0) {
    parts.push(`  missing (add to "skills"):\n${missing.map(p => `    + ${p}`).join('\n')}`)
  }
  if (stale.length > 0) {
    parts.push(
      `  stale (no dataset skill — remove from "skills"):\n${stale.map(p => `    - ${p}`).join('\n')}`,
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
      `.claude-plugin/plugin.json declares skill dirs with no SKILL.md:\n` +
        `${broken.map(p => `    - ${p}/SKILL.md`).join('\n')}\n` +
        `Run 'pair update' to regenerate the root mirror, or fix the manifest path by hand.`,
    )
  }
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
 * installs as a 1-skill plugin instead of 40, with `claude plugin validate` and
 * every other guard still passing).
 */
export const ALLOWED_MARKETPLACE_ENTRY_KEYS = [
  ...PLUGIN_METADATA_KEYS,
  'source',
  'category',
  'tags',
  'strict',
] as const

export type ManifestKind = 'plugin' | 'marketplace-entry'

/**
 * Asserts a manifest (plugin manifest or marketplace plugin entry) declares only
 * allowlisted keys — the automatic half of skills-only distribution (ADL
 * `2026-07-28-marketplace-plugin-packaging.md`, Decision 5). Subagents are an
 * anonymous context-isolation mechanic, never a shipped "agent" asset; hooks,
 * MCP/LSP servers, monitors and commands are execution surfaces pair does not
 * distribute; `settings`/`userConfig`/`dependencies` mutate or extend the host.
 */
export function assertSkillsOnlyDistribution(
  label: string,
  manifest: Record<string, unknown>,
  kind: ManifestKind = 'plugin',
): void {
  const allowed: readonly string[] =
    kind === 'plugin' ? ALLOWED_PLUGIN_MANIFEST_KEYS : ALLOWED_MARKETPLACE_ENTRY_KEYS
  const declared = Object.keys(manifest).filter(
    key => manifest[key] !== undefined && !allowed.includes(key),
  )
  if (declared.length === 0) return

  const permitted =
    kind === 'plugin'
      ? 'metadata plus "skills"'
      : 'metadata plus "source"/"category"/"tags"/"strict"'
  const catalogNote = declared.includes('skills')
    ? ` A "skills" key on a marketplace entry REPLACES plugin.json's catalog and is invisible to ` +
      `assertSkillCatalogInSync, which reads plugin.json only — the catalog is plugin.json's alone.`
    : ''
  fail(
    `${label} declares ${declared.map(k => `"${k}"`).join(', ')}: pair distributes skills only — ` +
      `a ${kind === 'plugin' ? 'plugin manifest' : 'marketplace entry'} may carry ${permitted} and ` +
      `nothing else (an allowlist, so an unknown or newly specified key fails closed).${catalogNote} ` +
      `Component/behaviour keys ship execution surfaces (hooks, mcpServers, lspServers, monitors, ` +
      `commands), auto-enable third-party plugins (dependencies) or mutate the host (settings, ` +
      `userConfig, channels, outputStyles, themes); subagents are an anonymous context-isolation ` +
      `mechanic, never a distributed agent asset. Remove the field(s) — rule of record: ` +
      `.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md, Decision 5.`,
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
 * `skills` is on the list too: a root-level `skills/` directory is auto-discovered
 * *in addition to* the manifest's `skills` field, so it would ship AND load skills
 * that never appear in `plugin.json` — bypassing {@link assertSkillCatalogInSync}
 * entirely. pair's skills live under `.claude/skills/`, which is declared, never
 * auto-discovered.
 */
export const ROOT_PLUGIN_COMPONENT_PATHS = [
  'agents',
  'commands',
  'hooks',
  'skills',
  '.mcp.json',
] as const

/**
 * Asserts no root-level plugin component path exists. `exists` is injected — the
 * assertion itself stays filesystem-free.
 */
export function assertNoRootPluginComponents(exists: (relPath: string) => boolean): void {
  const present = ROOT_PLUGIN_COMPONENT_PATHS.filter(path => exists(path))
  if (present.length > 0) {
    fail(
      `The plugin root (the repo, since the plugin source is "./") carries plugin component ` +
        `path(s) ${present.join(', ')}: Claude Code auto-discovers agents/commands/hooks/skills/MCP ` +
        `servers there regardless of what plugin.json declares (a root skills/ dir would even load ` +
        `skills the catalog guard never sees). pair distributes skills only — move them under ` +
        `.claude/ or remove them. Rule of record: ` +
        `.pair/adoption/decision-log/2026-07-28-marketplace-plugin-packaging.md, Decision 5.`,
    )
  }
}
