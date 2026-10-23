/**
 * Changelog Version — applies a `--version` override to the CHANGELOGs `changeset version` wrote.
 *
 * changesets computes the next version from the bump (0.4.3 + minor = 0.5.0); version.yml then
 * forces every package.json to the override (0.5.1), but the CHANGELOGs keep `## 0.5.0` and
 * `@pair/*@0.5.0` dependency lines (B12, #568). Only the top section is rewritten.
 *
 * Usage (version.yml, after `changeset version`):
 *   pnpm changelog-version -- <computed-version> <override-version>
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function rewriteChangelog(content: string, from: string, to: string): string {
  if (from === to) return content
  const heading = `\n## ${from}\n`
  const start = content.indexOf(heading)
  if (start === -1 || content.slice(0, start).includes('\n## ')) return content
  const next = content.indexOf('\n## ', start + heading.length - 1)
  const end = next === -1 ? content.length : next
  const section = content
    .slice(start, end)
    .replace(heading, `\n## ${to}\n`)
    .replace(new RegExp(`^(\\s+- @pair/[\\w.-]+@)${esc(from)}$`, 'gm'), `$1${to}`)
  return content.slice(0, start) + section + content.slice(end)
}

export function applyChangelogVersion(files: string[], from: string, to: string): string[] {
  return files.filter(f => {
    const before = readFileSync(f, 'utf8')
    const after = rewriteChangelog(before, from, to)
    if (after !== before) writeFileSync(f, after)
    return after !== before
  })
}

if (require.main === module) {
  const [from, to] = process.argv.slice(2).filter(a => a !== '--')
  if (!from || !to) {
    console.error('usage: changelog-version <computed-version> <override-version>')
    process.exit(1)
  }
  const files = execFileSync('git', ['ls-files', '--', '*CHANGELOG.md'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .map(f => join(REPO_ROOT, f))
  for (const f of applyChangelogVersion(files, from, to)) console.log(`${from} -> ${to}: ${f}`)
}
