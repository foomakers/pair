import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Negative test for the docs staleness gate (scripts/docs-staleness-check.js):
// proves the extended "N skills" count check actually FAILS on a stale count,
// not just that it passes on the real tree.

const SCRIPT = resolve(__dirname, '../../../scripts/docs-staleness-check.js')

let fixtureRoot: string

// Fixture tree with exactly 1 skill, so any other count in docs is stale.
function buildFixture(skillCountClaim: string): void {
  const docsDir = join(fixtureRoot, 'apps/website/content/docs')
  mkdirSync(join(fixtureRoot, 'packages/knowledge-hub/dataset/.skills/capability/verify-quality'), {
    recursive: true,
  })
  writeFileSync(
    join(
      fixtureRoot,
      'packages/knowledge-hub/dataset/.skills/capability/verify-quality/SKILL.md',
    ),
    '# verify-quality\n',
  )
  mkdirSync(join(fixtureRoot, 'apps/pair-cli/src/commands'), { recursive: true })
  mkdirSync(join(docsDir, 'reference/cli'), { recursive: true })
  mkdirSync(join(docsDir, 'integrations'), { recursive: true })
  writeFileSync(join(docsDir, 'reference/skills-catalog.mdx'), '| **verify-quality** | row |\n')
  writeFileSync(join(docsDir, 'reference/cli/commands.mdx'), 'No commands documented.\n')
  writeFileSync(
    join(docsDir, 'integrations/claude-code.mdx'),
    `The canonical directory contains ${skillCountClaim}.\n`,
  )
}

function runCheck(): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, DOCS_STALENESS_ROOT: fixtureRoot },
    encoding: 'utf-8',
  })
  return { status: result.status, stdout: result.stdout }
}

describe('docs-staleness-check skill count gate', () => {
  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'docs-staleness-'))
  })

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true })
  })

  it('fails (exit 1) when a docs page claims a wrong skill count', () => {
    buildFixture('5 skills')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('Skill count mismatch')
    expect(stdout).toContain('integrations/claude-code.mdx')
  })

  it('passes (exit 0) when the claimed skill count matches', () => {
    buildFixture('1 skills')
    const { status, stdout } = runCheck()
    expect(status, stdout).toBe(0)
    expect(stdout).toContain('PASS')
  })
})
