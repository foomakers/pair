#!/usr/bin/env node
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
 *   2. Size limits — name ≤ 64 chars, description ≤ 1024 chars (spec), and
 *      name+description combined ≤ 1024 chars (Pair's stricter bound).
 *   3. Pointer resolution — relative file links in SKILL.md bodies resolve to
 *      existing files/dirs in the dataset.
 *   4. Catalog counts — every "N skills"/"N-skill" figure stated in next's
 *      SKILL.md matches the real corpus dir count.
 *      TODO(#313/T1): promote catalog-count findings from warning to error once
 *      T1 regenerates next's catalog (currently states 33, corpus has 35).
 *
 * Exit 0 = conformant (warnings allowed), Exit 1 = violations.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SKILLS_DIR = path.join(ROOT, 'packages/knowledge-hub/dataset/.skills')

// agentskills.io spec top-level fields
const SPEC_FIELDS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']
// Tolerated Pair extension: provenance kept top-level (see writing-skills principle 8)
const PAIR_EXTENSIONS = ['version', 'author']

const NAME_MAX = 64
const DESCRIPTION_MAX = 1024
const COMBINED_MAX = 1024

// --- Frontmatter ---

function parseFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  const keys = []
  const values = {}
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(.*)$/)
    if (!m) continue // continuation or nested (indented) line — not a top-level key
    keys.push(m[1])
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1)
    }
    values[m[1]] = value
  }
  return { keys, values, body: lines.slice(end + 1).join('\n') }
}

function checkFrontmatterFields(keys) {
  const errors = []
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

function checkSizeLimits(name, description) {
  const errors = []
  const nameLen = (name || '').length
  const descLen = (description || '').length
  if (nameLen > NAME_MAX) {
    errors.push(`name is ${nameLen} chars (spec max ${NAME_MAX})`)
  }
  if (descLen > DESCRIPTION_MAX) {
    errors.push(`description is ${descLen} chars (spec max ${DESCRIPTION_MAX})`)
  }
  if (nameLen + descLen > COMBINED_MAX) {
    errors.push(`name+description is ${nameLen + descLen} chars combined (Pair max ${COMBINED_MAX})`)
  }
  return errors
}

// --- Pointer resolution ---

function extractLinkTargets(body) {
  // Markdown links, excluding fenced code blocks (examples often contain template paths)
  const withoutFences = body.replace(/```[\s\S]*?```/g, '')
  const targets = []
  for (const m of withoutFences.matchAll(/\]\(([^)]+)\)/g)) {
    targets.push(m[1].split(' ')[0].trim())
  }
  return targets
}

function isCheckableTarget(target) {
  if (!target) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false // URL scheme (http:, mailto:, …)
  if (target.startsWith('#')) return false // in-document anchor
  if (target.startsWith('/')) return false // absolute path — install-time, not dataset-relative
  if (/[<>{}*[\]]/.test(target)) return false // placeholder/template path
  if (/\bNNN\b|\bYYYY\b/.test(target)) return false // pattern path (adr-NNN-…, YYYY-MM-DD-…)
  return true
}

function checkLinks(filePath, body) {
  const errors = []
  const dir = path.dirname(filePath)
  for (const target of extractLinkTargets(body)) {
    if (!isCheckableTarget(target)) continue
    const resolved = path.resolve(dir, target.split('#')[0])
    if (!fs.existsSync(resolved)) {
      errors.push(`broken relative reference "${target}"`)
    }
  }
  return errors
}

// --- Catalog counts ---

function checkCatalogCounts(nextContent, actualCount) {
  const warnings = []
  for (const m of nextContent.matchAll(/(\d+)[-\s]skills?\b/g)) {
    const stated = parseInt(m[1], 10)
    if (stated !== actualCount) {
      warnings.push(`next/SKILL.md states "${m[0]}" but the corpus has ${actualCount} skills`)
    }
  }
  return warnings
}

// --- Corpus walk ---

function collectSkillFiles(skillsDir) {
  const files = []
  const categories = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
  for (const cat of categories) {
    const catDir = path.join(skillsDir, cat.name)
    const subdirs = fs
      .readdirSync(catDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    if (subdirs.length > 0) {
      for (const sub of subdirs) {
        const f = path.join(catDir, sub, 'SKILL.md')
        if (fs.existsSync(f)) files.push(f)
      }
    } else if (fs.existsSync(path.join(catDir, 'SKILL.md'))) {
      // Meta skill: category dir itself contains SKILL.md (e.g. next)
      files.push(path.join(catDir, 'SKILL.md'))
    }
  }
  return files
}

function runChecks(skillsDir) {
  const errors = []
  const warnings = []
  const files = collectSkillFiles(skillsDir)

  for (const file of files) {
    const rel = path.relative(skillsDir, file)
    const content = fs.readFileSync(file, 'utf-8')
    const fm = parseFrontmatter(content)
    if (!fm) {
      errors.push(`${rel}: missing or malformed YAML frontmatter`)
      continue
    }
    for (const e of checkFrontmatterFields(fm.keys)) errors.push(`${rel}: ${e}`)
    for (const e of checkSizeLimits(fm.values.name, fm.values.description)) {
      errors.push(`${rel}: ${e}`)
    }
    for (const e of checkLinks(file, fm.body)) errors.push(`${rel}: ${e}`)
  }

  const nextFile = files.find((f) => path.basename(path.dirname(f)) === 'next')
  if (nextFile) {
    warnings.push(...checkCatalogCounts(fs.readFileSync(nextFile, 'utf-8'), files.length))
  }

  return { errors, warnings, skillCount: files.length }
}

// --- CLI ---

if (require.main === module) {
  const { errors, warnings, skillCount } = runChecks(SKILLS_DIR)

  console.log('Skills Conformance Check')
  console.log('========================')

  if (warnings.length > 0) {
    console.log(`WARN — ${warnings.length} non-blocking finding${warnings.length > 1 ? 's' : ''} (error once #313/T1 lands):\n`)
    for (const w of warnings) console.log(`  • ${w}`)
    console.log()
  }

  if (errors.length === 0) {
    console.log(`PASS — ${skillCount} skills conformant (frontmatter portability, size limits, pointer resolution)`)
    process.exit(0)
  } else {
    console.log(`FAIL — ${errors.length} violation${errors.length > 1 ? 's' : ''}\n`)
    for (const e of errors) console.log(`  • ${e}`)
    console.log()
    process.exit(1)
  }
}

module.exports = {
  parseFrontmatter,
  checkFrontmatterFields,
  checkSizeLimits,
  extractLinkTargets,
  isCheckableTarget,
  checkLinks,
  checkCatalogCounts,
  collectSkillFiles,
  runChecks,
  SPEC_FIELDS,
  PAIR_EXTENSIONS,
}
