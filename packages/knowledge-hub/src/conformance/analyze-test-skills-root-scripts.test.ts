import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// #626 r0-1: the skills tell the reader to run `pnpm <script>` from the repo root, so each
// referenced test-audit command must be a script of the ROOT package.json.

const ROOT_PKG = JSON.parse(readFileSync(join(__dirname, '../../../../package.json'), 'utf-8')) as {
  scripts: Record<string, string>
}

const SKILLS = [
  { name: 'analyze-test-speed', dir: 'dataset/.skills/capability/analyze-test-speed' },
  { name: 'analyze-test-prune', dir: 'dataset/.skills/capability/analyze-test-prune' },
  { name: 'analyze-test-speed', dir: '../../.claude/skills/pair-capability-analyze-test-speed' },
  { name: 'analyze-test-prune', dir: '../../.claude/skills/pair-capability-analyze-test-prune' },
]

describe('analyze-test skills — commands resolve at the root manifest (#626)', () => {
  it.each(SKILLS)('$dir: every `pnpm test-audit:*` is a root script', ({ dir }) => {
    const content = readFileSync(join(__dirname, '../..', dir, 'SKILL.md'), 'utf-8')
    const used = [...content.matchAll(/pnpm (test-audit:[a-z]+)/g)].map(m => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const c of used) expect(ROOT_PKG.scripts).toHaveProperty(c)
  })

  it.each(['test-audit:baseline', 'test-audit:prepush'])(
    'root script %s delegates to dev-tools',
    c => {
      expect(ROOT_PKG.scripts[c]).toMatch(/pnpm --filter @pair\/dev-tools /)
    },
  )

  it('control: redundancy already delegated at root', () => {
    expect(ROOT_PKG.scripts['test-audit:redundancy']).toMatch(/@pair\/dev-tools/)
  })
})
