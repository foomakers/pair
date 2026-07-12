#!/usr/bin/env node
/**
 * Docs Staleness Check — verifies docs match source-of-truth code artifacts.
 * Exit 0 = in sync, Exit 1 = drift detected.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKILLS_DIR = path.join(ROOT, 'packages/knowledge-hub/dataset/.skills')
const COMMANDS_DIR = path.join(ROOT, 'apps/pair-cli/src/commands')
const DOCS_DIR = path.join(ROOT, 'apps/website/content/docs')
const CATALOG_FILE = path.join(DOCS_DIR, 'reference/skills-catalog.mdx')
const COMMANDS_FILE = path.join(DOCS_DIR, 'reference/cli/commands.mdx')

const errors = []

// --- Helpers ---

function getSkillNames(categoryDir) {
  const entries = fs.readdirSync(categoryDir, { withFileTypes: true })
  const subdirs = entries.filter((d) => d.isDirectory()).map((d) => d.name)
  if (subdirs.length > 0) return subdirs
  // Meta skill: category dir itself contains SKILL.md
  if (fs.existsSync(path.join(categoryDir, 'SKILL.md'))) {
    return [path.basename(categoryDir)]
  }
  return []
}

function walkMdx(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMdx(full))
    else if (entry.name.endsWith('.mdx')) out.push(full)
  }
  return out
}

const docsFiles = walkMdx(DOCS_DIR)

// --- Check 1 & 2: Skills ---

const categories = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())

const allSkills = []
for (const cat of categories) {
  allSkills.push(...getSkillNames(path.join(SKILLS_DIR, cat.name)))
}
const skillCount = allSkills.length

const catalog = fs.readFileSync(CATALOG_FILE, 'utf-8')

// Check 1: every occurrence of "N skills" across ALL docs pages matches actual count.
// Regex is intentionally narrow to avoid prose false positives: it matches
// "N skills", "N pair skills", "N composable skills" (the total-count phrasings
// used in docs). Subset counts ("9 process skills") do NOT match because the
// word between the number and "skills" must be pair/composable or absent.
const COUNT_RE = /(\d+)\s+(?:pair\s+|composable\s+)?skills/g
for (const file of docsFiles) {
  const content = fs.readFileSync(file, 'utf-8')
  const rel = path.relative(DOCS_DIR, file)
  for (const m of content.matchAll(COUNT_RE)) {
    const docCount = parseInt(m[1], 10)
    if (docCount !== skillCount) {
      errors.push(`Skill count mismatch in ${rel}: docs say "${m[0]}", actual count is ${skillCount}`)
    }
  }
}

// Check 2: every skill dir has a table row in the catalog
for (const skill of allSkills) {
  if (!catalog.includes(`**${skill}**`)) {
    errors.push(`Skill "${skill}" exists in .skills/ but missing from skills-catalog.mdx`)
  }
}

// Reverse check: catalog entries that no longer exist as dirs
const catalogSkills = [...catalog.matchAll(/\| \*\*([a-z0-9-]+)\*\* \|/g)].map((m) => m[1])
for (const docSkill of catalogSkills) {
  if (!allSkills.includes(docSkill)) {
    errors.push(`Skill "${docSkill}" in skills-catalog.mdx but no matching dir in .skills/`)
  }
}

// --- Check 3: CLI commands ---

const commandDirs = fs
  .readdirSync(COMMANDS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const commandsDoc = fs.readFileSync(COMMANDS_FILE, 'utf-8')

for (const cmd of commandDirs) {
  if (!commandsDoc.includes(`(#${cmd})`)) {
    errors.push(`CLI command "${cmd}" has a dir in commands/ but missing from commands.mdx`)
  }
}

// --- Check 4: Tutorial CLI command references ---

const TUTORIALS_DIR = path.join(ROOT, 'apps/website/content/docs/tutorials')
const CLI_BUILTINS = new Set(['--version', '--help'])

if (fs.existsSync(TUTORIALS_DIR)) {
  const tutorialFiles = fs
    .readdirSync(TUTORIALS_DIR)
    .filter((f) => f.endsWith('.mdx'))

  const referencedCommands = new Set()
  for (const file of tutorialFiles) {
    const content = fs.readFileSync(path.join(TUTORIALS_DIR, file), 'utf-8')
    // Match pair-cli <command> in code blocks (``` or backtick-inline)
    const matches = [...content.matchAll(/pair-cli\s+([a-z][a-z0-9-]*)/g)]
    for (const m of matches) {
      referencedCommands.add(m[1])
    }
  }

  // Filter to likely commands: must exist as a command dir or be a known builtin
  // Ignore English prose words that follow "pair-cli" in non-code context
  const proseWords = new Set(['as', 'is', 'on', 'to', 'installed', 'and', 'or', 'in', 'for', 'the'])
  for (const cmd of referencedCommands) {
    if (CLI_BUILTINS.has(`--${cmd}`)) continue
    if (proseWords.has(cmd)) continue
    if (!commandDirs.includes(cmd)) {
      errors.push(
        `Tutorial references "pair-cli ${cmd}" but no matching command dir in commands/`,
      )
    }
  }
}

// --- Check 5: Dead internal docs links ---
// Every markdown link target starting with /docs must resolve to a page in the
// content tree (file route, or folder route backed by an index.mdx). Would have
// caught the index-less section links (/docs/concepts, /docs/guides, /docs/reference).

const validRoutes = new Set()
for (const file of docsFiles) {
  const rel = path.relative(DOCS_DIR, file).replace(/\\/g, '/').replace(/\.mdx$/, '')
  const route = rel === 'index' ? '/docs' : `/docs/${rel.replace(/\/index$/, '')}`
  validRoutes.add(route)
}

const LINK_RE = /\]\((\/docs[^)\s]*)\)/g
for (const file of docsFiles) {
  const content = fs.readFileSync(file, 'utf-8')
  const rel = path.relative(DOCS_DIR, file)
  for (const m of content.matchAll(LINK_RE)) {
    const target = m[1].split('#')[0].split('?')[0].replace(/\/$/, '') || '/docs'
    if (!validRoutes.has(target)) {
      errors.push(`Dead internal link in ${rel}: ${m[1]} does not resolve to a docs page`)
    }
  }
}

// --- Output ---

console.log('Docs Staleness Check')
console.log('====================')

if (errors.length === 0) {
  console.log(`PASS — ${skillCount} skills, ${commandDirs.length} commands in sync`)
  process.exit(0)
} else {
  console.log(`FAIL — ${errors.length} issue${errors.length > 1 ? 's' : ''}\n`)
  for (const e of errors) {
    console.log(`  \u2022 ${e}`)
  }
  console.log()
  process.exit(1)
}
