import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Conformance guard for the agent-harness framework (story #450).
 *
 * The framework README (`agent-harness/README.md`) fixes a nine-section index
 * every per-harness guide must follow, in order, so a reader comparing two
 * harnesses compares like with like (Business Rule: adding a harness is one
 * markdown file and zero code). This guard is DATA-DRIVEN over the guide files
 * present on disk (`*.md` in the directory, excluding `README.md`) in BOTH
 * corpora — a new guide is enrolled the moment its file lands, nothing here
 * needs editing, and no assertion breaks because the set grew.
 */

const REL = '.pair/knowledge/guidelines/technical-standards/ai-development/agent-harness'
const CORPORA = [
  { label: 'dataset', dir: join(__dirname, '../../dataset', REL) },
  { label: 'generated root', dir: join(__dirname, '../../../../', REL) },
]

/** The nine fixed sections, in order, per the framework README's contract. */
const FIXED_INDEX = [
  '1. Config File Locations',
  '2. Skill-Path Declaration',
  '3. Project Context Loading',
  '4. Authentication',
  '5. Access Paths',
  '6. Model Provider Configuration',
  '7. Headless Execution',
  '8. What ',
  '9. Verified-Against Version',
]

function guideFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('.md') && name !== 'README.md')
    .sort()
}

describe('agent-harness framework: fixed per-guide index', () => {
  for (const { label, dir } of CORPORA) {
    describe(`${label} corpus`, () => {
      it('has the framework README', () => {
        expect(() => readFileSync(join(dir, 'README.md'), 'utf-8')).not.toThrow()
      })

      it('README states the fixed nine-section index and the zero-code rule', () => {
        const readme = readFileSync(join(dir, 'README.md'), 'utf-8').toLowerCase()
        for (const heading of FIXED_INDEX) {
          const bareHeading = heading.replace(/^\d+\.\s*/, '').trim()
          expect(readme.includes(bareHeading.toLowerCase())).toBe(true)
        }
        expect(readme).toContain('one markdown file and zero code')
      })

      const files = guideFiles(dir)

      it('has at least one per-harness guide', () => {
        expect(files.length).toBeGreaterThan(0)
      })

      for (const file of files) {
        describe(file, () => {
          const content = readFileSync(join(dir, file), 'utf-8')

          it('carries every indexed section heading, in order', () => {
            let cursor = -1
            for (const heading of FIXED_INDEX) {
              const markdownHeading = `## ${heading}`
              const idx = content.indexOf(markdownHeading)
              expect(
                idx,
                `missing or out of order: "${markdownHeading}" in ${file}`,
              ).toBeGreaterThan(cursor)
              cursor = idx
            }
          })

          it('declares no credential value (AC7 — the guide never carries a secret)', () => {
            // A loose heuristic, not a secret-scanner substitute (that's the deterministic CI
            // layer): guides document env VAR NAMES and auth COMMANDS, never assigned values.
            expect(content).not.toMatch(/sk-[a-zA-Z0-9]{10,}/)
            expect(content).not.toMatch(/=\s*["'][a-zA-Z0-9_-]{20,}["']/)
          })

          it('states a verified-against version, not a placeholder', () => {
            const versionSection = content.slice(content.indexOf('## 9. Verified-Against Version'))
            expect(versionSection.length).toBeGreaterThan(20)
            expect(versionSection.toLowerCase()).not.toContain('tbd')
            expect(versionSection.toLowerCase()).not.toContain('placeholder')
          })
        })
      }

      it('pi.md declares no MCP support (the fitness-check load-bearing fact)', () => {
        const pi = readFileSync(join(dir, 'pi.md'), 'utf-8')
        expect(pi).toMatch(/No MCP/)
      })

      it('opencode.md declares MCP as first-class', () => {
        const opencode = readFileSync(join(dir, 'opencode.md'), 'utf-8')
        expect(opencode.toLowerCase()).toContain('mcp is first-class')
      })

      it('claude-code.md documents claude -p and Workflow as two distinct layers', () => {
        const claudeCode = readFileSync(join(dir, 'claude-code.md'), 'utf-8')
        expect(claudeCode).toContain('Two Distinct Layers')
        expect(claudeCode).toContain('claude -p')
        expect(claudeCode).toContain('Workflow')
      })
    })
  }

  it('both corpora expose the same guide set', () => {
    const [dataset, mirror] = CORPORA.map(c => guideFiles(c.dir))
    expect(mirror).toEqual(dataset)
  })
})
