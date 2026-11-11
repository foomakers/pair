import { describe, it, expect } from 'vitest'

import { gateSteps, profileStep } from './profile'

describe('gateSteps', () => {
  it('splits the quality-gate on && and keeps each step whole', () => {
    expect(
      gateSteps('turbo ts:check test lint && pnpm workflows:test && pnpm hygiene:check'),
    ).toEqual(['turbo ts:check test lint', 'pnpm workflows:test', 'pnpm hygiene:check'])
  })
  it('a single command is one step', () => {
    expect(gateSteps('echo hi')).toEqual(['echo hi'])
  })
})

describe('profileStep', () => {
  it('records command, exit code and wall time; a failing step is a result, not a throw', () => {
    const ok = profileStep('.', 'node -e "setTimeout(()=>{},50)"')
    expect(ok).toMatchObject({ command: 'node -e "setTimeout(()=>{},50)"', exit: 0 })
    expect(ok.ms).toBeGreaterThanOrEqual(50)
    expect(profileStep('.', 'exit 3').exit).toBe(3)
  })
})
