/**
 * Skills Conformance Check — static conformance gate for the dataset skill corpus.
 *
 * Enforces the authoring effectiveness standard (story #313, principle 8 "constraints"
 * of contributing/writing-skills) over packages/knowledge-hub/dataset/.skills/:
 *
 *   1. Frontmatter portability — only agentskills.io-core top-level fields
 *      (name, description, license, compatibility, metadata, allowed-tools)
 *      plus the tolerated Pair extension (version, author, kept top-level for
 *      provenance). Assistant-specific fields (e.g. disable-model-invocation)
 *      are portability violations.
 *   2. Size limits — name <= 64 chars, description <= 1024 chars (spec), and
 *      name+description combined <= 1024 chars (Pair's stricter bound).
 *   3. Pointer resolution — relative file links in SKILL.md bodies resolve to
 *      existing files/dirs in the dataset.
 *   4. Catalog counts — every "N skills"/"N-skill" figure stated in next's
 *      SKILL.md matches the real corpus dir count. Hard error, like every other
 *      check here (promoted from WARN once #313/T1 (#325) regenerated next's
 *      catalog to the real, stable count).
 *   5. Entrypoint depth — every `SKILL.md` sits at the registry's ENTRY depth
 *      (`<category>/<name>/SKILL.md`, or the bare `<name>/SKILL.md` meta skill),
 *      never below it. A `SKILL.md` inside a skill's sub-directory (e.g.
 *      `process/review/references/SKILL.md`) installs as CONTENT under the bounded
 *      flatten (#407, ADR-020): no name prefix, no frontmatter `name:` sync, no
 *      skill-name mapping — a skill nobody can invoke, and until this check nothing
 *      saw it (the corpus walk below only reads `<category>/<name>/SKILL.md`, and
 *      the mirror-equality guard derives the installed path from the same
 *      transform, so it agrees with itself). The convention it enforces:
 *      `skill-conventions/nested-sub-documents.md`, authoring rule 1.
 *   6. KB prose counts — the skill-count figures restated in the onboarding KB
 *      prose (way-of-working.md, getting-started.md, skills-guide.md) match the
 *      real corpus, across every restated form: the number-before-noun
 *      "N skills"/"N Agent Skills" total, the "(P process + C capability + N
 *      navigator)" breakdown, and the number-after-noun category forms — the
 *      "### <Category> Skills (N)" catalog heading and the "**<Category>** | N"
 *      Skill-Types table cell (defense-in-depth). Closes the recurrence gap
 *      from story #233: a skill-count sweep that misses these prose files leaves
 *      factually-wrong onboarding docs the docs-staleness gate can't catch (it
 *      scans apps/website only).
 *
 * Runnable as a CLI via `ts-node src/tools/skills-conformance-check.ts`
 * (package script `skills:conformance`). Exit 0 = conformant, Exit 1 = violations.
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'

const ROOT = join(__dirname, '..', '..')
const SKILLS_DIR = join(ROOT, 'dataset', '.skills')

// KB onboarding prose that restates skill counts (relative to ROOT). Kept in
// lockstep with the real .skills corpus so a count sweep can't leave stale prose.
const KB_PROSE_FILES = [
  'dataset/.pair/knowledge/way-of-working.md',
  'dataset/.pair/knowledge/getting-started.md',
  'dataset/.pair/knowledge/skills-guide.md',
]

// agentskills.io spec top-level fields
export const SPEC_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]
// Tolerated Pair extension: provenance kept top-level (see writing-skills principle 8)
export const PAIR_EXTENSIONS = ['version', 'author']

const NAME_MAX = 64
const DESCRIPTION_MAX = 1024
const COMBINED_MAX = 1024

export interface Frontmatter {
  keys: string[]
  values: Record<string, string>
  body: string
}

export interface RunResult {
  errors: string[]
  skillCount: number
}

// --- Frontmatter ---

// YAML block-scalar indicator as a value: `|`, `>`, with optional `-`/`+` chomping.
const BLOCK_SCALAR_RE = /^[|>][+-]?$/

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
    (value.startsWith("'") && value.endsWith("'") && value.length > 1)
  return quoted ? value.slice(1, -1) : value
}

// Fold a YAML block scalar into a single measurable string so its real length is
// counted by the size gate (a raw `description: >` line alone is length ~1 and would
// otherwise bypass the ≤1024 check). Consumes indented continuation lines starting at
// `start`; the block ends at the first line dedented to column 0 (next top-level key)
// or at `end`. Returns the joined text and the index to resume top-level parsing from.
function foldBlockScalar(
  lines: string[],
  start: number,
  end: number,
): { text: string; next: number } {
  const parts: string[] = []
  let i = start
  for (; i < end; i++) {
    const line = lines[i] as string
    if (line.trim() === '') {
      parts.push('')
      continue
    }
    const indent = line.length - line.trimStart().length
    if (indent === 0) break // dedented to key level — block ended
    parts.push(line.trimStart())
  }
  return { text: parts.join(' ').trim(), next: i }
}

export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split('\n')
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const keys: string[] = []
  const values: Record<string, string> = {}
  let i = 1
  while (i < end) {
    const m = (lines[i] as string).match(/^([A-Za-z][A-Za-z0-9_-]*):(.*)$/)
    if (!m) {
      i++ // continuation or nested (indented) line — not a top-level key
      continue
    }
    const key = m[1] as string
    keys.push(key)
    const inline = (m[2] as string).trim()
    if (BLOCK_SCALAR_RE.test(inline)) {
      const folded = foldBlockScalar(lines, i + 1, end)
      values[key] = folded.text
      i = folded.next
    } else {
      values[key] = unquote(inline)
      i++
    }
  }
  return { keys, values, body: lines.slice(end + 1).join('\n') }
}

export function checkFrontmatterFields(keys: string[]): string[] {
  const errors: string[] = []
  const allowed = new Set([...SPEC_FIELDS, ...PAIR_EXTENSIONS])
  for (const key of keys) {
    if (!allowed.has(key)) {
      errors.push(
        `non-portable frontmatter field "${key}" (allowed: spec fields ${SPEC_FIELDS.join(', ')} + tolerated Pair extension ${PAIR_EXTENSIONS.join(', ')})`,
      )
    }
  }
  for (const required of ['name', 'description']) {
    if (!keys.includes(required)) {
      errors.push(`missing required frontmatter field "${required}"`)
    }
  }
  return errors
}

export function checkSizeLimits(name?: string, description?: string): string[] {
  const errors: string[] = []
  const nameLen = (name || '').length
  const descLen = (description || '').length
  // Attribution per principle 8: agentskills.io spec caps name (64) and description
  // (1024) SEPARATELY (hence "spec max"); the combined ≤1024 is PAIR's stricter bound.
  if (nameLen > NAME_MAX) {
    errors.push(`name is ${nameLen} chars (spec max ${NAME_MAX})`)
  }
  if (descLen > DESCRIPTION_MAX) {
    errors.push(`description is ${descLen} chars (spec max ${DESCRIPTION_MAX})`)
  }
  if (nameLen + descLen > COMBINED_MAX) {
    errors.push(
      `name+description is ${nameLen + descLen} chars combined (Pair max ${COMBINED_MAX})`,
    )
  }
  return errors
}

// --- Pointer resolution ---

export function extractLinkTargets(body: string): string[] {
  // Markdown links, excluding fenced code blocks (examples often contain template paths)
  const withoutFences = body.replace(/```[\s\S]*?```/g, '')
  const targets: string[] = []
  for (const m of withoutFences.matchAll(/\]\(([^)]+)\)/g)) {
    targets.push((m[1] as string).split(' ')[0]!.trim())
  }
  return targets
}

export function isCheckableTarget(target: string): boolean {
  if (!target) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false // URL scheme (http:, mailto:, …)
  if (target.startsWith('#')) return false // in-document anchor
  if (target.startsWith('/')) return false // absolute path — install-time, not dataset-relative
  if (/[<>{}*[\]]/.test(target)) return false // placeholder/template path
  if (/\bNNN\b|\bYYYY\b/.test(target)) return false // pattern path (adr-NNN-…, YYYY-MM-DD-…)
  return true
}

export function checkLinks(filePath: string, body: string): string[] {
  const errors: string[] = []
  const dir = dirname(filePath)
  for (const target of extractLinkTargets(body)) {
    if (!isCheckableTarget(target)) continue
    const resolved = resolve(dir, target.split('#')[0]!)
    if (!existsSync(resolved)) {
      errors.push(`broken relative reference "${target}"`)
    }
  }
  return errors
}

// --- Catalog counts ---

export function checkCatalogCounts(nextContent: string, actualCount: number): string[] {
  const mismatches: string[] = []
  for (const m of nextContent.matchAll(/(\d+)[-\s]skills?\b/g)) {
    const stated = parseInt(m[1] as string, 10)
    if (stated !== actualCount) {
      mismatches.push(`next/SKILL.md states "${m[0]}" but the corpus has ${actualCount} skills`)
    }
  }
  return mismatches
}

export interface CategoryCounts {
  total: number
  process: number
  capability: number
  navigator: number
}

// Bucket the corpus by top-level category dir (process/, capability/, everything
// else = the navigator meta skill), matching the KB's "P process + C capability +
// N navigator" phrasing.
export function countByCategory(files: string[], skillsDir: string): CategoryCounts {
  let process = 0
  let capability = 0
  let navigator = 0
  for (const f of files) {
    const top = relative(skillsDir, f).split(sep)[0]
    if (top === 'process') process++
    else if (top === 'capability') capability++
    else navigator++
  }
  return { total: files.length, process, capability, navigator }
}

// Validates skill-count figures restated in KB onboarding prose against the real
// corpus: the "N skills"/"N Agent Skills" total (never the "(P process + …)"
// component numbers, which are followed by a category word, not "skill") and the
// "(P process + C capability + N navigator)" breakdown.
export function checkProseCounts(rel: string, content: string, counts: CategoryCounts): string[] {
  const errors: string[] = []
  for (const m of content.matchAll(/(\d+)\s+(?:Agent\s+)?[Ss]kills?\b/g)) {
    const stated = parseInt(m[1] as string, 10)
    if (stated !== counts.total) {
      errors.push(`${rel}: states "${m[0]}" but the corpus has ${counts.total} skills`)
    }
  }
  for (const b of content.matchAll(
    /\((\d+)\s+process\s*\+\s*(\d+)\s+capability\s*\+\s*(\d+)\s+navigator\)/g,
  )) {
    const p = parseInt(b[1] as string, 10)
    const c = parseInt(b[2] as string, 10)
    const n = parseInt(b[3] as string, 10)
    if (p !== counts.process || c !== counts.capability || n !== counts.navigator) {
      errors.push(
        `${rel}: breakdown "${b[0]}" does not match corpus (${counts.process} process + ${counts.capability} capability + ${counts.navigator} navigator)`,
      )
    }
  }
  return errors
}

// Validates the number-after-noun category-count forms restated in KB prose —
// the "### <Category> Skills (N)" catalog heading and the "**<Category>** | N"
// Skill-Types table cell — against the real per-category corpus counts. This is
// the defense-in-depth complement to checkProseCounts (which covers the
// number-before-noun "N skills" total and the "(P process + …)" breakdown). Only
// the three top-level category labels are matched; subcategory groupings (e.g.
// "Assessment Skills (9)") carry no corpus counterpart and are left untouched.
export function checkCategoryLabelCounts(
  rel: string,
  content: string,
  counts: CategoryCounts,
): string[] {
  const errors: string[] = []
  const expected: Record<string, number> = {
    Process: counts.process,
    Capability: counts.capability,
    Navigator: counts.navigator,
  }
  const forms: Array<{ re: RegExp; kind: string }> = [
    { re: /\b(Process|Capability|Navigator)\s+Skills\s*\((\d+)\)/g, kind: 'heading' },
    { re: /\*\*(Process|Capability|Navigator)\*\*\s*\|\s*(\d+)\b/g, kind: 'table cell' },
  ]
  for (const { re, kind } of forms) {
    for (const m of content.matchAll(re)) {
      const category = m[1] as string
      const stated = parseInt(m[2] as string, 10)
      const want = expected[category] as number
      if (stated !== want) {
        errors.push(
          `${rel}: ${kind} "${m[0]}" states ${stated} but the corpus has ${want} ${category.toLowerCase()} skills`,
        )
      }
    }
  }
  return errors
}

// --- Entrypoint depth ---

/**
 * The `skills` registry's ENTRY depth in directory segments: `<category>/<name>`
 * (2) or the bare meta skill `<name>` (1). Same fact as `flattenDepth` in the
 * registry config, pinned to `SKILL_COPY_OPTS` by test rather than imported, so
 * this gate script stays dependency-free (it runs via ts-node before any build).
 */
export const ENTRY_DEPTH = 2

/**
 * Every `SKILL.md` must sit AT the entry depth, never below it.
 *
 * A `SKILL.md` inside a skill's sub-directory (`process/review/references/SKILL.md`)
 * is legitimately-shaped CONTENT for the copy pipeline's layout guards — telling it
 * apart would need the marker-file knowledge ADR-020 keeps out of a transform four
 * non-skill registries share. So it installs at
 * `pair-process-review/references/SKILL.md`: no prefix, frontmatter `name:` left
 * unsynced, absent from the skill-name map — a skill nobody can invoke, with no
 * signal anywhere. Static corpus knowledge is the right layer for it; this is that
 * check (`nested-sub-documents.md`, authoring rule 1).
 *
 * Takes the RECURSIVE markdown walk, not `collectSkillFiles`: the whole point is
 * to see files the entry walk never reaches.
 */
export function checkEntrypointDepth(skillsDir: string, markdownFiles: string[]): string[] {
  const errors: string[] = []
  for (const file of markdownFiles) {
    if (basename(file) !== 'SKILL.md') continue
    const rel = relative(skillsDir, file)
    const depth = rel.split(sep).length - 1
    if (depth >= 1 && depth <= ENTRY_DEPTH) continue
    const where =
      depth > ENTRY_DEPTH
        ? `below the entry depth, so it installs as content inside another skill`
        : `at the registry root, so it installs as a loose file with no skill directory`
    errors.push(
      `${rel}: SKILL.md is ${depth} directory level(s) deep — ${where}. ` +
        `A skill entrypoint must sit at the entry depth (1..${ENTRY_DEPTH}: '<category>/<name>/SKILL.md', ` +
        `or '<name>/SKILL.md' for the meta skill): no prefix, no frontmatter name sync and no ` +
        `skill-name mapping are applied anywhere else, so the skill would be non-invocable. ` +
        `Move it to the skill root, or rename it if it is a sub-document.`,
    )
  }
  return errors
}

// --- Corpus walk ---

/**
 * Every Markdown file under the skills corpus — SKILL.md AND auxiliary composed
 * files (e.g. `merge-and-cascade.md`, `post-review-merge.md`) that a SKILL.md
 * discloses to. Instruction lives in these files too, so template-link/pointer
 * invariants must scan them, not just SKILL.md (story #314).
 */
export function collectSkillMarkdownFiles(skillsDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) files.push(p)
    }
  }
  walk(skillsDir)
  return files
}

export function collectSkillFiles(skillsDir: string): string[] {
  const files: string[] = []
  const categories = readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory())
  for (const cat of categories) {
    const catDir = join(skillsDir, cat.name)
    const subdirs = readdirSync(catDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    if (subdirs.length > 0) {
      for (const sub of subdirs) {
        const f = join(catDir, sub, 'SKILL.md')
        if (existsSync(f)) files.push(f)
      }
    } else if (existsSync(join(catDir, 'SKILL.md'))) {
      // Meta skill: category dir itself contains SKILL.md (e.g. next)
      files.push(join(catDir, 'SKILL.md'))
    }
  }
  return files
}

export function runChecks(skillsDir: string): RunResult {
  const errors: string[] = []
  const files = collectSkillFiles(skillsDir)

  for (const file of files) {
    const rel = relative(skillsDir, file)
    const content = readFileSync(file, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      errors.push(`${rel}: missing or malformed YAML frontmatter`)
      continue
    }
    for (const e of checkFrontmatterFields(fm.keys)) errors.push(`${rel}: ${e}`)
    for (const e of checkSizeLimits(fm.values['name'], fm.values['description'])) {
      errors.push(`${rel}: ${e}`)
    }
    for (const e of checkLinks(file, fm.body)) errors.push(`${rel}: ${e}`)
  }

  errors.push(...checkEntrypointDepth(skillsDir, collectSkillMarkdownFiles(skillsDir)))

  const nextFile = files.find(f => basename(dirname(f)) === 'next')
  if (nextFile) {
    errors.push(...checkCatalogCounts(readFileSync(nextFile, 'utf-8'), files.length))
  }

  const counts = countByCategory(files, skillsDir)
  const proseRoot = resolve(skillsDir, '..', '..')
  for (const rel of KB_PROSE_FILES) {
    const abs = join(proseRoot, rel)
    if (existsSync(abs)) {
      const proseContent = readFileSync(abs, 'utf-8')
      errors.push(...checkProseCounts(rel, proseContent, counts))
      errors.push(...checkCategoryLabelCounts(rel, proseContent, counts))
    }
  }

  return { errors, skillCount: files.length }
}

if (require.main === module) {
  const { errors, skillCount } = runChecks(SKILLS_DIR)

  console.log('Skills Conformance Check')
  console.log('========================')

  if (errors.length === 0) {
    console.log(
      `PASS — ${skillCount} skills conformant (frontmatter portability, size limits, pointer resolution, entrypoint depth, catalog counts, KB prose counts incl. category headings/table cells)`,
    )
    process.exit(0)
  } else {
    console.log(`FAIL — ${errors.length} violation${errors.length > 1 ? 's' : ''}\n`)
    for (const e of errors) console.log(`  • ${e}`)
    console.log()
    process.exit(1)
  }
} else {
  // allow importing the module without executing
}
