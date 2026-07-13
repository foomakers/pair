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
export const SKILL_COUNT_RE = /(\d+)\+?\s+(?:pair\s+|composable\s+|agent\s+|idempotent\s+)?skills/g

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

/** Count of how-to guide files (NN-how-to-*.md) in a KB how-to dir. `null` if the dir is missing. */
export function countHowToGuides(howToDir: string): number | null {
  if (!existsSync(howToDir)) return null
  return readdirSync(howToDir).filter(f => /^\d+-how-to-.*\.md$/.test(f)).length
}

// --- Pure per-content checks (return error strings; no I/O) ---

/** Check 1: every "N skills" phrasing in content matches the actual skill count. */
export function findSkillCountMismatches(content: string, rel: string, actual: number): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(SKILL_COUNT_RE)) {
    const n = m[1]
    if (n !== undefined && parseInt(n, 10) !== actual) {
      errors.push(`Skill count mismatch in ${rel}: docs say "${m[0]}", actual count is ${actual}`)
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

/** Run every check against a repo root and collect all drift errors. */
export function runAllChecks(root: string): RunResult {
  const SKILLS_DIR = join(root, 'packages/knowledge-hub/dataset/.skills')
  const COMMANDS_DIR = join(root, 'apps/pair-cli/src/commands')
  const DOCS_DIR = join(root, 'apps/website/content/docs')
  const CATALOG_FILE = join(DOCS_DIR, 'reference/skills-catalog.mdx')
  const COMMANDS_FILE = join(DOCS_DIR, 'reference/cli/commands.mdx')
  const HOW_TO_DIR = join(root, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to')
  const TUTORIALS_DIR = join(DOCS_DIR, 'tutorials')

  const errors: string[] = []
  const docsFiles = walkMdx(DOCS_DIR)
  const allSkills = collectSkills(SKILLS_DIR)
  const skillCount = allSkills.length
  const validRoutes = buildValidRoutes(docsFiles, DOCS_DIR)
  const howToCount = countHowToGuides(HOW_TO_DIR)

  // Check 2b (loud failure if the how-to dataset dir moved)
  if (howToCount === null) {
    errors.push(`How-to guides dir not found: ${HOW_TO_DIR} — guide-count check cannot run`)
  }

  // Per-file checks — read each doc once and run all content-level checks:
  // 1 (skill counts), 2b (guide counts), 5 (dead links, markdown + JSX href).
  for (const file of docsFiles) {
    const content = readFileSync(file, 'utf-8')
    const rel = relative(DOCS_DIR, file)
    errors.push(...findSkillCountMismatches(content, rel, skillCount))
    if (howToCount !== null) errors.push(...findGuideCountMismatches(content, rel, howToCount))
    errors.push(...findDeadLinks(content, rel, validRoutes))
  }

  // Check 2: catalog sync (both directions)
  errors.push(...checkCatalogSync(allSkills, readFileSync(CATALOG_FILE, 'utf-8')))

  // Checks 3 & 4: CLI command anchors + tutorial references
  const cli = checkCliCommands(COMMANDS_DIR, COMMANDS_FILE, TUTORIALS_DIR)
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
