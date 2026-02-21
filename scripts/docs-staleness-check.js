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
const CATALOG_FILE = path.join(ROOT, 'apps/website/content/docs/reference/skills-catalog.mdx')
const COMMANDS_FILE = path.join(ROOT, 'apps/website/content/docs/reference/cli/commands.mdx')

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

// --- Check 1 & 2: Skills ---

const categories = fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())

const allSkills = []
for (const cat of categories) {
  allSkills.push(...getSkillNames(path.join(SKILLS_DIR, cat.name)))
}
const skillCount = allSkills.length

const catalog = fs.readFileSync(CATALOG_FILE, 'utf-8')

// Check 1: every occurrence of "N skills" matches actual count
const countMatches = [...catalog.matchAll(/(\d+)\s+(?:pair\s+)?skills/g)]
for (const m of countMatches) {
  const docCount = parseInt(m[1], 10)
  if (docCount !== skillCount) {
    errors.push(`Skill count mismatch: docs say "${m[0]}", actual count is ${skillCount}`)
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
