import { describe, it, expect } from 'vitest'
import { stageLabel } from './cycle-wiring'

describe('stageLabel — the cycle step as the live card line names it (US-573 AC2)', () => {
  it.each([
    [{ step: 'implement', round: 0 }, 3, 'implement'],
    [{ step: 'prepare', round: 0 }, 3, 'implement'],
    [{ step: 'verify', round: 2 }, 3, 'review'],
    [{ step: 'prepare', round: 1 }, 3, 'fix 1/3'],
    [{ step: 'green', round: 2 }, 3, 'fix 2/3'],
    [{ step: 'validate', round: 1 }, undefined, 'fix 1/?'],
  ])('%o (max %s) ⇒ %s', (next, max, label) => {
    expect(stageLabel(next, max)).toBe(label)
  })
})
