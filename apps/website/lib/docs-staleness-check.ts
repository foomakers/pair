/**
 * Docs Staleness Check — verifies the published docs site matches source-of-truth
 * code artifacts (skills corpus, CLI commands, how-to guides) and has no dead
 * internal links.
 *
 * This is the website-docs integrity gate. The LOGIC lives here as individually
 * exported, unit-tested functions (see docs-staleness-check.test.ts, white-box).
 * The `main()` block is a thin CLI wrapper run via `tsx lib/docs-staleness-check.ts`
 * (package script `docs:staleness`); it prints the same output and exit codes as
 * before. Exit 0 = in sync, Exit 1 = drift detected.
 *
 * DOCS_STALENESS_ROOT overrides the repo root (used to point the checks at a
 * fixture tree). Absent, the repo root is resolved from this file's location:
 * apps/website/lib -> apps/website -> apps -> <repo root> (up 3).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** Resolve the repo root, honouring the DOCS_STALENESS_ROOT override. */
export function resolveRoot(): string {
  const override = process.env['DOCS_STALENESS_ROOT']
  return override ? resolve(override) : resolve(MODULE_DIR, '../../..')
}

// --- Regexes (exported so their intent is documented and directly testable) ---

// Skill total-count phrasings across docs. Narrow to avoid prose false positives
// but covers "N skills", "N+ skills" (trailing plus), and an optional total-count
// adjective — "N pair/composable/agent/idempotent skills". Subset counts
// ("9 process skills") do NOT match: the adjective, when present, must be one of
// the whitelisted total-count words.
export const SKILL_COUNT_RE =
  /(\d+)\+?\s+(?:declared\s+)?(?:pair\s+|composable\s+|agent\s+|idempotent\s+)?skills/g

// A quoted `claude plugin details` transcript: `Skills (1)`. Pinned because it is an
// assertion about our OWN plugin manifest, not a third-party observation — and because
// the marketplace docs quoted a stale count while the manifest held another, drift no
// phrasing above could catch. Anchored on the literal capitalized `Skills (`, so the
// sibling `Agents (0)` / `Hooks (0)` counts in the same transcript never match.
//
// It is checked against the count the PLUGIN MANIFEST declares, NOT against the dataset
// skill count: since the payload shrank to the bootstrap corpus, the plugin declares one
// skill while the dataset holds 41, and conflating the two would demand a number that is
// wrong on both readings.
export const SKILL_COUNT_PROBE_RE = /\bSkills \((\d+)\)/g

// How-to guide count phrasings. Requires a how-to qualifier so arbitrary
// "N guides" prose ("5 guides at the museum") never false-positives: a match
// needs EITHER a recognized adjective (sequential/step-by-step) OR a
// how-to/process word. Bare "N guides" does not match. Covers "9 how-to guides",
// "9 process guides", "9 sequential guides", "9 step-by-step guides",
// "9 sequential how-to guides", "9 step-by-step process guides".
export const GUIDE_COUNT_RE =
  /(\d+)\s+(?:(?:sequential|step-by-step)\s+(?:how-to\s+|process\s+)?|(?:how-to|process)\s+)guides/g

// Internal /docs targets: markdown links `](/docs/...)` and JSX card
// `href="/docs/..."` attributes (Fumadocs <Card>/<Cards>).
export const LINK_RE = /\]\((\/docs[^)\s]*)\)/g
export const HREF_RE = /href="(\/docs[^"]*)"/g

// --- Filesystem helpers ---

/** Skill names under a category dir: its subdirs, or the category itself if it's a meta skill (SKILL.md at the category root). */
export function getSkillNames(categoryDir: string): string[] {
  const entries = readdirSync(categoryDir, { withFileTypes: true })
  const subdirs = entries.filter(d => d.isDirectory()).map(d => d.name)
  if (subdirs.length > 0) return subdirs
  if (existsSync(join(categoryDir, 'SKILL.md'))) return [basename(categoryDir)]
  return []
}

/** Every skill name across all category dirs under skillsDir. */
export function collectSkills(skillsDir: string): string[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const all: string[] = []
  for (const cat of categories) all.push(...getSkillNames(join(skillsDir, cat.name)))
  return all
}

/** All .mdx files under dir, recursively. */
export function walkMdx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMdx(full))
    else if (entry.name.endsWith('.mdx')) out.push(full)
  }
  return out
}

/**
 * How many skills the plugin manifest declares. `null` if the manifest is missing —
 * the caller then skips the probe check rather than pinning every transcript to 0.
 */
export function countDeclaredPluginSkills(manifestPath: string): number | null {
  if (!existsSync(manifestPath)) return null
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const skills = (raw as { skills?: unknown }).skills
  if (Array.isArray(skills)) return skills.length
  return typeof skills === 'string' ? 1 : 0
}

/** Count of how-to guide files (NN-how-to-*.md) in a KB how-to dir. `null` if the dir is missing. */
export function countHowToGuides(howToDir: string): number | null {
  if (!existsSync(howToDir)) return null
  return readdirSync(howToDir).filter(f => /^\d+-how-to-.*\.md$/.test(f)).length
}

// --- Pure per-content checks (return error strings; no I/O) ---

/** Check 1: every "N skills" phrasing in content matches the actual skill count. */
export function findSkillCountMismatches(content: string, rel: string, actual: number): string[] {
  return countMismatches(content, rel, actual, { re: SKILL_COUNT_RE, label: 'Skill count' })
}

/**
 * Check 1b: every quoted `Skills (N)` plugin transcript matches what the plugin
 * manifest declares. Separate from check 1 on purpose — see SKILL_COUNT_PROBE_RE.
 */
export function findPluginSkillCountMismatches(
  content: string,
  rel: string,
  declared: number,
): string[] {
  return countMismatches(content, rel, declared, {
    re: SKILL_COUNT_PROBE_RE,
    label: 'Plugin skill count',
  })
}

function countMismatches(
  content: string,
  rel: string,
  actual: number,
  kind: { re: RegExp; label: string },
): string[] {
  const { re, label } = kind
  const errors: string[] = []
  for (const m of content.matchAll(re)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(`${label} mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`)
    }
  }
  return errors
}

/** Check 2b: every "N how-to guides" phrasing in content matches the actual guide count. */
export function findGuideCountMismatches(content: string, rel: string, actual: number): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(GUIDE_COUNT_RE)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(
        `How-to guide count mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`,
      )
    }
  }
  return errors
}

/** Check 5: every /docs link/href in content resolves to a known route. */
export function findDeadLinks(content: string, rel: string, validRoutes: Set<string>): string[] {
  const errors: string[] = []
  for (const re of [LINK_RE, HREF_RE]) {
    for (const m of content.matchAll(re)) {
      const raw = m[1]
      if (raw === undefined) continue
      const head = (raw.split('#')[0] ?? '').split('?')[0] ?? ''
      const target = head.replace(/\/$/, '') || '/docs'
      if (!validRoutes.has(target)) {
        errors.push(`Dead internal link in ${rel}: ${raw} does not resolve to a docs page`)
      }
    }
  }
  return errors
}

// --- Catalog ROW CONTENT (single-sourced from the dataset SKILL.md frontmatter) ---
//
// checkCatalogSync (Check 2) pins the catalog's skill NAME LIST to the dataset;
// findSkillCountMismatches pins the "N skills" COUNTS. Neither pins the per-row
// Command / Description CONTENT, which used to be hand-maintained and could drift
// silently from the dataset. checkCatalogContent (Check 2c) closes that gap: the
// Command is DERIVED from category+name (the same transform `pair update` applies)
// and the Description from the skill's frontmatter — so the dataset is the single
// source of truth, CI-enforced. (The Composes column is NOT owned by this check.)

export interface SkillEntry {
  category: string
  name: string
}

export interface ExpectedRow {
  command: string
  description: string
}

/**
 * category+name → the slash-command, the same name transform `pair update` applies
 * when mirroring the dataset into `.claude/skills/`: a meta skill (its SKILL.md sits
 * at the category root, so name === category, e.g. `next`) becomes `/pair-<name>`;
 * every other skill becomes `/pair-<category>-<name>`.
 */
export function deriveSkillCommand(category: string, name: string): string {
  return name === category ? `/pair-${name}` : `/pair-${category}-${name}`
}

/** Enumerate every dataset skill as {category, name} (categories × getSkillNames). */
export function collectSkillEntries(skillsDir: string): SkillEntry[] {
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  const out: SkillEntry[] = []
  for (const cat of categories) {
    for (const name of getSkillNames(join(skillsDir, cat.name))) {
      out.push({ category: cat.name, name })
    }
  }
  return out
}

/** Absolute path to a skill's SKILL.md (a meta skill lives at the category root). */
export function skillMdPath(skillsDir: string, entry: SkillEntry): string {
  return entry.name === entry.category
    ? join(skillsDir, entry.category, 'SKILL.md')
    : join(skillsDir, entry.category, entry.name, 'SKILL.md')
}

/** The quoted `description:` scalar from a SKILL.md's YAML frontmatter (empty if absent). */
export function readSkillDescription(skillMdContent: string): string {
  const m = skillMdContent.match(/^description:\s*"([\s\S]*?)"\s*$/m)
  return m?.[1] ?? ''
}

// Abbreviations whose trailing period does NOT end a sentence ("e.g.", "etc.").
const SENTENCE_ABBREVIATIONS = /(?:e\.g|i\.e|etc|vs|approx)$/i

/**
 * The lead sentence of a frontmatter description, as the catalog renders it. Ends at
 * the first sentence-terminating period (one followed by whitespace/EOS, skipping
 * known abbreviations and mid-token dots like `.pair/…`), OR — for skills whose lead
 * is followed by a `$scope`/`$mode` enumeration ("… rule): `$scope: diff` …") — at
 * the `:` that introduces it. A closing period is always ensured.
 */
export function extractFirstSentence(description: string): string {
  let cut = description.length
  const mode = /:\s(?=`\$)/.exec(description)
  if (mode && mode.index + 1 < cut) cut = mode.index + 1
  const period = /\.(?=\s|$)/g
  let m: RegExpExecArray | null
  while ((m = period.exec(description)) !== null) {
    if (SENTENCE_ABBREVIATIONS.test(description.slice(0, m.index))) continue
    if (m.index + 1 < cut) cut = m.index + 1
    break
  }
  const lead = description.slice(0, cut).replace(/:\s*$/, '').trim()
  return /[.!?]$/.test(lead) ? lead : `${lead}.`
}

/**
 * Render bare `/short-name` command references as the catalog does — backticked,
 * fully-qualified `` `/pair-…` ``. A `/` only starts a command token at a word
 * boundary (not after a letter/backtick), so slash-joined prose like
 * "map-subdomains/map-contexts" is left intact.
 */
export function transformCommandTokens(text: string, commandByName: Map<string, string>): string {
  return text.replace(/(^|[^\w`])\/([a-z][a-z0-9-]*)/g, (full, pre: string, name: string) => {
    const cmd = commandByName.get(name)
    return cmd ? `${pre}\`${cmd}\`` : full
  })
}

/** The catalog Description a skill should have: its frontmatter lead, catalog-rendered. */
export function deriveCatalogDescription(
  frontmatterDescription: string,
  commandByName: Map<string, string>,
): string {
  return transformCommandTokens(extractFirstSentence(frontmatterDescription), commandByName)
}

/** Derive the expected Command + Description for every dataset skill (name → row). */
export function generateCatalogRows(skillsDir: string): Map<string, ExpectedRow> {
  const entries = collectSkillEntries(skillsDir)
  const commandByName = new Map(entries.map(e => [e.name, deriveSkillCommand(e.category, e.name)]))
  const rows = new Map<string, ExpectedRow>()
  for (const e of entries) {
    const desc = readSkillDescription(readFileSync(skillMdPath(skillsDir, e), 'utf-8'))
    rows.set(e.name, {
      command: deriveSkillCommand(e.category, e.name),
      description: deriveCatalogDescription(desc, commandByName),
    })
  }
  return rows
}

/** Parse a skill's Command + Description cells from its catalog table row (null if absent). */
export function parseCatalogRow(
  catalog: string,
  skill: string,
): { command: string; description: string } | null {
  for (const line of catalog.split('\n')) {
    const m = line.match(/^\|\s*\*\*([a-z0-9-]+)\*\*\s*\|/)
    if (!m || m[1] !== skill) continue
    // `| **skill** | `/cmd` | description | (composes) |` → ['', '**skill**', '`/cmd`', 'desc', …]
    const cells = line.split('|').map(c => c.trim())
    return {
      command: (cells[2] ?? '').replace(/^`|`$/g, ''),
      description: cells[3] ?? '',
    }
  }
  return null
}

/**
 * Check 2c: every catalog row's Command + Description MATCH the dataset-derived truth.
 * Presence/absence of rows is checkCatalogSync's job — a skill with no row is skipped
 * here (checkCatalogSync already flags it) rather than double-reported.
 */
export function checkCatalogContent(expected: Map<string, ExpectedRow>, catalog: string): string[] {
  const errors: string[] = []
  for (const [skill, exp] of expected) {
    const row = parseCatalogRow(catalog, skill)
    if (row === null) continue
    if (row.command !== exp.command) {
      errors.push(
        `Catalog command drift for "${skill}": expected \`${exp.command}\` but catalog has \`${row.command}\``,
      )
    }
    if (row.description !== exp.description) {
      errors.push(
        `Catalog description drift for "${skill}": expected "${exp.description}" but catalog has "${row.description}"`,
      )
    }
  }
  return errors
}

/** Check 2: catalog lists every skill dir, and no catalog row lacks a dir (both directions). */
export function checkCatalogSync(allSkills: string[], catalog: string): string[] {
  const errors: string[] = []
  for (const skill of allSkills) {
    if (!catalog.includes(`**${skill}**`)) {
      errors.push(`Skill "${skill}" exists in .skills/ but missing from skills-catalog.mdx`)
    }
  }
  const catalogSkills = [...catalog.matchAll(/\| \*\*([a-z0-9-]+)\*\* \|/g)]
    .map(m => m[1])
    .filter((s): s is string => s !== undefined)
  for (const docSkill of catalogSkills) {
    if (!allSkills.includes(docSkill)) {
      errors.push(`Skill "${docSkill}" in skills-catalog.mdx but no matching dir in .skills/`)
    }
  }
  return errors
}

/** Check 3: every command dir has an anchor in commands.mdx. */
export function checkCommandAnchors(commandDirs: string[], commandsDoc: string): string[] {
  const errors: string[] = []
  for (const cmd of commandDirs) {
    if (!commandsDoc.includes(`(#${cmd})`)) {
      errors.push(`CLI command "${cmd}" has a dir in commands/ but missing from commands.mdx`)
    }
  }
  return errors
}

const CLI_BUILTINS = new Set(['--version', '--help'])
const PROSE_WORDS = new Set(['as', 'is', 'on', 'to', 'installed', 'and', 'or', 'in', 'for', 'the'])

/** Check 4: every `pair-cli <cmd>` referenced in tutorial content maps to a command dir. */
export function checkTutorialCommands(tutorialContents: string[], commandDirs: string[]): string[] {
  const errors: string[] = []
  const referenced = new Set<string>()
  for (const content of tutorialContents) {
    for (const m of content.matchAll(/pair-cli\s+([a-z][a-z0-9-]*)/g)) {
      if (m[1] !== undefined) referenced.add(m[1])
    }
  }
  for (const cmd of referenced) {
    if (CLI_BUILTINS.has(`--${cmd}`)) continue
    if (PROSE_WORDS.has(cmd)) continue
    if (!commandDirs.includes(cmd)) {
      errors.push(`Tutorial references "pair-cli ${cmd}" but no matching command dir in commands/`)
    }
  }
  return errors
}

/** Build the set of valid /docs routes from the docs .mdx file list. */
export function buildValidRoutes(docsFiles: string[], docsDir: string): Set<string> {
  const routes = new Set<string>()
  for (const file of docsFiles) {
    const rel = relative(docsDir, file)
      .replace(/\\/g, '/')
      .replace(/\.mdx$/, '')
    routes.add(rel === 'index' ? '/docs' : `/docs/${rel.replace(/\/index$/, '')}`)
  }
  return routes
}

export interface RunResult {
  errors: string[]
  skillCount: number
  commandCount: number
}

/** Checks 3 & 4: command anchors in commands.mdx, and tutorial `pair-cli <cmd>` references. */
export function checkCliCommands(
  commandsDir: string,
  commandsFile: string,
  tutorialsDir: string,
): { errors: string[]; commandCount: number } {
  const errors: string[] = []
  const commandDirs = readdirSync(commandsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  errors.push(...checkCommandAnchors(commandDirs, readFileSync(commandsFile, 'utf-8')))
  if (existsSync(tutorialsDir)) {
    const tutorialContents = readdirSync(tutorialsDir)
      .filter(f => f.endsWith('.mdx'))
      .map(f => readFileSync(join(tutorialsDir, f), 'utf-8'))
    errors.push(...checkTutorialCommands(tutorialContents, commandDirs))
  }
  return { errors, commandCount: commandDirs.length }
}

/**
 * Per-file checks — each doc is read once and run through every content-level check:
 * 1 (skill counts), 1b (the plugin transcript), 2b (guide counts), 5 (dead links).
 * Extracted from runAllChecks only to keep it under the line ceiling.
 */
function perFileErrors(params: {
  docsFiles: string[]
  docsDir: string
  skillCount: number
  declaredPluginSkills: number | null
  howToCount: number | null
  validRoutes: Set<string>
}): string[] {
  const { docsFiles, docsDir, skillCount, declaredPluginSkills, howToCount, validRoutes } = params
  const errors: string[] = []
  for (const file of docsFiles) {
    const content = readFileSync(file, 'utf-8')
    const rel = relative(docsDir, file)
    errors.push(...findSkillCountMismatches(content, rel, skillCount))
    if (declaredPluginSkills !== null) {
      errors.push(...findPluginSkillCountMismatches(content, rel, declaredPluginSkills))
    }
    if (howToCount !== null) errors.push(...findGuideCountMismatches(content, rel, howToCount))
    errors.push(...findDeadLinks(content, rel, validRoutes))
  }
  return errors
}

/** Run every check against a repo root and collect all drift errors. */
/**
 * The source-of-truth paths every check reads, resolved from one repo root. Kept as
 * its own function so `runAllChecks` stays inside the line ceiling and the path list
 * has a single place to change.
 */
function checkPaths(root: string) {
  const DOCS_DIR = join(root, 'apps/website/content/docs')
  return {
    SKILLS_DIR: join(root, 'packages/knowledge-hub/dataset/.skills'),
    COMMANDS_DIR: join(root, 'apps/pair-cli/src/commands'),
    DOCS_DIR,
    CATALOG_FILE: join(DOCS_DIR, 'reference/skills-catalog.mdx'),
    COMMANDS_FILE: join(DOCS_DIR, 'reference/cli/commands.mdx'),
    HOW_TO_DIR: join(root, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    TUTORIALS_DIR: join(DOCS_DIR, 'tutorials'),
    // The plugin manifest lives at the PLUGIN root (the bootstrap corpus), not at the
    // repo root: the marketplace entry's `source` points there.
    PLUGIN_MANIFEST: join(root, 'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json'),
  }
}

export function runAllChecks(root: string): RunResult {
  const paths = checkPaths(root)
  const { SKILLS_DIR, DOCS_DIR, HOW_TO_DIR } = paths

  const errors: string[] = []
  const docsFiles = walkMdx(DOCS_DIR)
  const allSkills = collectSkills(SKILLS_DIR)
  const skillCount = allSkills.length
  const declaredPluginSkills = countDeclaredPluginSkills(paths.PLUGIN_MANIFEST)
  const validRoutes = buildValidRoutes(docsFiles, DOCS_DIR)
  const howToCount = countHowToGuides(HOW_TO_DIR)

  // Check 2b (loud failure if the how-to dataset dir moved)
  if (howToCount === null) {
    errors.push(`How-to guides dir not found: ${HOW_TO_DIR} — guide-count check cannot run`)
  }

  errors.push(
    ...perFileErrors({
      docsFiles,
      docsDir: DOCS_DIR,
      skillCount,
      declaredPluginSkills,
      howToCount,
      validRoutes,
    }),
  )

  // Check 2: catalog sync (both directions)
  const catalog = readFileSync(paths.CATALOG_FILE, 'utf-8')
  errors.push(...checkCatalogSync(allSkills, catalog))

  // Check 2c: catalog row CONTENT (Command + Description) single-sourced from the dataset
  errors.push(...checkCatalogContent(generateCatalogRows(SKILLS_DIR), catalog))

  // Checks 3 & 4: CLI command anchors + tutorial references
  const cli = checkCliCommands(paths.COMMANDS_DIR, paths.COMMANDS_FILE, paths.TUTORIALS_DIR)
  errors.push(...cli.errors)

  // NOTE: repo-root README.md is intentionally OUT of this gate's scope — the gate
  // governs the published docs site (apps/website/content/docs) only. README's own
  // literal skill/guide counts are tracked and fixed by PR #325.

  return { errors, skillCount, commandCount: cli.commandCount }
}

/** Thin CLI wrapper: print the report and set the exit code. */
export function main(): void {
  const { errors, skillCount, commandCount } = runAllChecks(resolveRoot())
  console.log('Docs Staleness Check')
  console.log('====================')
  if (errors.length === 0) {
    console.log(`PASS — ${skillCount} skills, ${commandCount} commands in sync`)
    process.exit(0)
  }
  console.log(`FAIL — ${errors.length} issue${errors.length > 1 ? 's' : ''}\n`)
  for (const e of errors) console.log(`  • ${e}`)
  console.log()
  process.exit(1)
}

// Main-guard: run only when invoked directly (tsx lib/docs-staleness-check.ts),
// not when imported by the unit tests. ESM equivalent of `require.main === module`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
