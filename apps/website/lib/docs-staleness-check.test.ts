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

// Fixture tree with exactly 1 skill and 1 how-to guide, so any other count in docs is stale.
function buildFixture(skillCountClaim: string, extraProse = '', withHowToDir = true): void {
  const docsDir = join(fixtureRoot, 'apps/website/content/docs')
  mkdirSync(join(fixtureRoot, 'packages/knowledge-hub/dataset/.skills/capability/verify-quality'), {
    recursive: true,
  })
  writeFileSync(
    join(fixtureRoot, 'packages/knowledge-hub/dataset/.skills/capability/verify-quality/SKILL.md'),
    '# verify-quality\n',
  )
  const howToDir = join(fixtureRoot, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to')
  rmSync(howToDir, { recursive: true, force: true })
  if (withHowToDir) {
    mkdirSync(howToDir, { recursive: true })
    writeFileSync(join(howToDir, '01-how-to-create-PRD.md'), '# how-to\n')
    writeFileSync(join(howToDir, 'README.md'), '# index\n')
  }
  mkdirSync(join(fixtureRoot, 'apps/pair-cli/src/commands'), { recursive: true })
  mkdirSync(join(docsDir, 'reference/cli'), { recursive: true })
  mkdirSync(join(docsDir, 'integrations'), { recursive: true })
  writeFileSync(join(docsDir, 'reference/skills-catalog.mdx'), '| **verify-quality** | row |\n')
  writeFileSync(join(docsDir, 'reference/cli/commands.mdx'), 'No commands documented.\n')
  writeFileSync(
    join(docsDir, 'integrations/claude-code.mdx'),
    `The canonical directory contains ${skillCountClaim}.\n${extraProse}`,
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

  it('fails (exit 1) on wrong "N composable skills" (adjective between number and skills)', () => {
    buildFixture('7 composable skills')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('Skill count mismatch')
    expect(stdout).toContain('7 composable skills')
  })

  it('fails (exit 1) on wrong "N+ skills" (trailing plus)', () => {
    buildFixture('7+ skills')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('Skill count mismatch')
  })

  it('fails (exit 1) on wrong "N agent skills"', () => {
    buildFixture('1 skills', 'The standard exposes 7 agent skills.\n')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('Skill count mismatch')
    expect(stdout).toContain('7 agent skills')
  })

  it('passes (exit 0) on matching "N composable skills" / "N+ skills"', () => {
    buildFixture('1 skills', 'Exactly 1 composable skills and 1+ skills.\n')
    const { status, stdout } = runCheck()
    expect(status, stdout).toBe(0)
  })

  it('fails (exit 1) when a docs page claims a wrong how-to guide count', () => {
    buildFixture('1 skills', 'The KB ships 11 how-to guides.\n')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('How-to guide count mismatch')
    expect(stdout).toContain('integrations/claude-code.mdx')
  })

  it('passes (exit 0) when the claimed how-to guide count matches', () => {
    buildFixture('1 skills', 'The KB ships 1 how-to guides.\n')
    const { status, stdout } = runCheck()
    expect(status, stdout).toBe(0)
  })

  it('fails (exit 1) on wrong counts in adjective phrasings ("N sequential guides")', () => {
    buildFixture('1 skills', 'The KB has 9 sequential guides and 9 step-by-step guides.\n')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('How-to guide count mismatch')
    expect(stdout).toContain('9 sequential guides')
    expect(stdout).toContain('9 step-by-step guides')
  })

  it('fails (exit 1) when the how-to dataset dir is missing (no silent skip)', () => {
    buildFixture('1 skills', '', false)
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('how-to')
    expect(stdout).toContain('not found')
  })

  it('does NOT false-positive on bare "N guides" prose (non-how-to phrasing)', () => {
    // Tightened GUIDE_COUNT_RE must ignore arbitrary "N guides" that lack a
    // how-to/process/sequential/step-by-step qualifier — even when N is "wrong".
    buildFixture('1 skills', 'The city has 5 guides at the museum and 3 tour guides.\n')
    const { status, stdout } = runCheck()
    expect(status, stdout).toBe(0)
  })

  it('fails (exit 1) on a dead JSX href="/docs/..." card link', () => {
    buildFixture('1 skills', '<Card href="/docs/does-not-exist">Broken</Card>\n')
    const { status, stdout } = runCheck()
    expect(status).toBe(1)
    expect(stdout).toContain('Dead internal link')
    expect(stdout).toContain('/docs/does-not-exist')
  })

  it('passes (exit 0) on a valid JSX href="/docs/..." card link', () => {
    buildFixture('1 skills', '<Card href="/docs/reference/skills-catalog">OK</Card>\n')
    const { status, stdout } = runCheck()
    expect(status, stdout).toBe(0)
  })
})
