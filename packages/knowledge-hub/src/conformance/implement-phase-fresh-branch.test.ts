import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SKILL = readFileSync(
  join(__dirname, '../../dataset/.skills/workflow/implement-phase/SKILL.md'),
  'utf-8',
)

describe('implement-phase fresh path: deterministic branch-freshness check', () => {
  const fresh = SKILL.slice(SKILL.indexOf('**Fresh card**'), SKILL.indexOf('**Sealed `a0`:**'))

  it('T: staleness is judged on the commits in $base..<branch>, never on whether the branch descends from the current $base', () => {
    expect(fresh).toMatch(/\$base\.\.<branch>/)
    expect(fresh).toMatch(/main (simply )?moves? on|older (main|base)/i)
    expect(fresh).not.toMatch(/must descend from `\$base`/)
    expect(fresh).not.toMatch(/merge-base --is-ancestor \$base <branch>` exits 0\)/)
  })

  it("T: the card's own commits are recognised by the commit template subject; foreign commits block", () => {
    expect(fresh).toMatch(/\[#<card>\]|\[US-<card>\]/)
    expect(fresh).toMatch(/foreign|another story/i)
  })

  it('T: an empty $base..<branch> is fresh — the stage resets the branch to $base itself', () => {
    expect(fresh).toMatch(/empty/i)
    expect(fresh).toMatch(/reset (it |the branch )?to `?\$base/i)
  })

  it('a Pair-RED-Snapshot trailer without a sealed red-verify blocks', () => {
    expect(fresh).toMatch(/Pair-RED-Snapshot/)
    expect(fresh).toMatch(/sealed `?red-verify/)
  })

  it('otherwise returns the fixed reason branch-not-fresh with next.step blocked and the human remedy', () => {
    expect(fresh).toMatch(/branch-not-fresh/)
    expect(fresh).toMatch(/next:\s*\{\s*step:\s*"blocked"/)
    expect(fresh).toMatch(/archive|reset/)
  })

  it("H: the card's own commits above $base on a descending branch RESUME the fresh path, never block", () => {
    expect(fresh).toMatch(/resume/i)
    expect(fresh).toMatch(/own (prior )?commits/i)
    // only a non-descending or snapshot-bearing branch blocks
    expect(fresh).toMatch(/only .*foreign.*snapshot/is)
  })

  it('G: a long command is never left in the background; the turn never ends on one; always a structured result', () => {
    const step2 = SKILL.slice(SKILL.indexOf('### Step 2'), SKILL.indexOf('### Step 4'))
    expect(SKILL).toMatch(/background/i)
    expect(step2 + SKILL).toMatch(/never end (your|the) turn (while|on|waiting)/i)
    expect(SKILL).toMatch(/headless|no further turn|no notification/i)
    expect(SKILL).toMatch(/reason: "incomplete"|reason: incomplete/)
  })

  it('K: refreshes remote state before judging, and judges the local story branch plus the remote only if it truly exists', () => {
    expect(fresh).toMatch(/git fetch --prune origin/)
    expect(fresh).toMatch(/git ls-remote --heads origin/)
    expect(fresh).toMatch(/stale remote-tracking/i)
    expect(fresh).toMatch(/local story branch/i)
  })
})
