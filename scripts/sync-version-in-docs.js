#!/usr/bin/env node

/**
 * Auto-detects and replaces hardcoded version strings in .md/.mdx files.
 *
 * Usage:
 *   node scripts/sync-version-in-docs.js <old-version>           # apply
 *   node scripts/sync-version-in-docs.js <old-version> --check   # dry-run, exit 1 if drift
 *   node scripts/sync-version-in-docs.js --check                 # detect current version drift
 *
 * In the version workflow, OLD_CLI_VERSION is captured before `changeset version`
 * and passed as the first argument. The new version is read from package.json.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2).filter((a) => a !== '--check')
const check = process.argv.includes('--check')

const newVersion = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/pair-cli/package.json'), 'utf8'),
).version

const oldVersion = args[0] || newVersion

if (oldVersion === newVersion && !check) {
  console.log('Old and new versions are identical, nothing to do.')
  process.exit(0)
}

// Directories/patterns to skip — not our version strings
const EXCLUDE_PATTERNS = [
  'node_modules',
  'CHANGELOG.md',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.changeset/',
]

// Find all .md/.mdx files containing the old version string
const grepExcludes = EXCLUDE_PATTERNS.map((p) => `--glob=!${p}`).join(' ')
let files
try {
  const cmd = `rg --hidden --files-with-matches --glob="*.md" --glob="*.mdx" ${grepExcludes} --fixed-strings "${oldVersion}" .`
  files = execSync(cmd, { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
} catch {
  // rg exits 1 when no matches
  files = []
}

if (files.length === 0) {
  console.log(check ? 'No version drift detected.' : 'No files to update.')
  process.exit(0)
}

// Patterns that indicate an external version (not ours) — skip these lines
const EXTERNAL_LINE_PATTERNS = [
  /uses:\s*\S+@v?\d/,      // GitHub Actions: uses: org/action@v1.2.3
  /npm i\S*\s+\S+@\d/,     // npm install pkg@version
  /pnpm add\S*\s+\S+@\d/,  // pnpm add pkg@version
]

function isExternalLine(line) {
  return EXTERNAL_LINE_PATTERNS.some((re) => re.test(line))
}

let drifted = 0
const versionRegex = new RegExp(oldVersion.replace(/\./g, '\\.'), 'g')

for (const rel of files) {
  const abs = path.join(root, rel)
  const original = fs.readFileSync(abs, 'utf8')

  const updated = original
    .split('\n')
    .map((line) => {
      if (!line.includes(oldVersion)) return line
      if (isExternalLine(line)) return line
      return line.replace(versionRegex, newVersion)
    })
    .join('\n')

  if (original === updated) {
    console.log(`OK    ${rel}`)
    continue
  }

  if (check) {
    console.log(`DRIFT ${rel}`)
    drifted++
  } else {
    fs.writeFileSync(abs, updated)
    console.log(`FIXED ${rel} → v${newVersion}`)
  }
}

if (check && drifted > 0) {
  console.error(
    `\n${drifted} file(s) have stale version. Run: node scripts/sync-version-in-docs.js <old-version>`,
  )
  process.exit(1)
}

if (!check) {
  console.log(`\nDone. ${files.length} file(s) scanned, version: ${oldVersion} → ${newVersion}`)
}
