import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Autonomous-run defect D2: the review stage dispatched by pair-cli read the PR's `risk:*` label,
// found none (publish-pr creates the PR untagged), and took "untagged => red" as the answer — it
// never ran /classify, so the tier concluded was the fail-safe, not a computed one. The review MUST
// classify (story tier = floor, raised from the diff, never lowered) BEFORE declaring passes and
// concluding; fail-safe red only when classification itself fails, said explicitly.

const DATASET = join(__dirname, '../../dataset/.skills/workflow/review-phase/SKILL.md')
const MIRRORS = [join(__dirname, '../../../../.claude/skills/pair-workflow-review-phase/SKILL.md')]

function step4(text: string): string {
  const start = text.indexOf('### Step 4')
  const end = text.indexOf('\n### ', start + 1)
  return text.slice(start, end)
}

for (const [label, path] of [
  ['dataset', DATASET],
  ['mirror', MIRRORS[0]!],
] as const) {
  const text = readFileSync(path, 'utf-8')
  describe(`review-phase classifies before it declares passes (${label})`, () => {
    const s4 = step4(text)

    it('Step 4 composes /classify in review context before declaring the passes', () => {
      expect(s4).toMatch(/\/(pair-capability-)?classify/)
      expect(s4).toMatch(/\$context: review/)
      expect(s4.search(/\/(pair-capability-)?classify/)).toBeLessThan(
        s4.indexOf('| Tier | Passes |'),
      )
    })

    it('the story tier is the floor: raise from the diff, never lower', () => {
      expect(s4).toMatch(/story's `risk:\*`[^.]*floor/i)
      expect(s4).toMatch(/never lower/i)
    })

    it('"untagged" is not an answer: no short-circuit to red without a failed classification', () => {
      expect(s4).not.toMatch(/`risk:red` or untagged/)
      expect(s4).toMatch(/untagged PR is the NORMAL state[^.]*(pair-capability-)?classify/i)
      expect(s4).toMatch(/fail-safe `risk:red` ONLY when classification itself fails/i)
      expect(s4).toMatch(/classification failed/)
    })

    it('conclude receives the computed tier, with its provenance', () => {
      expect(text).toMatch(/`--tier` is the tier Step 4 COMPUTED/)
      expect(text).toMatch(/tierSource/)
    })
  })
}
