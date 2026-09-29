import { describe, it, expect } from 'vitest'
import { cycleHooksPolicyPath, cycleHooksScriptPath } from './cycle-scripts'

/**
 * US-489 — the paths the hooks bridge builds are platform-injected, never read from the host:
 * `platform: 'win32'` yields backslash paths, `darwin`/`linux` forward-slash ones, whatever OS the
 * test itself runs on.
 */
describe('cycle-hooks path handling (platform injected)', () => {
  it.each([
    ['darwin', '/repo/main', '/repo/main/.pair/adoption/tech/automation.md'],
    ['linux', '/repo/main', '/repo/main/.pair/adoption/tech/automation.md'],
    ['win32', 'C:\\repo\\main', 'C:\\repo\\main\\.pair\\adoption\\tech\\automation.md'],
  ] as const)('policy path on %s', (platform, main, expected) => {
    expect(cycleHooksPolicyPath(main, platform)).toBe(expected)
  })

  it.each([
    ['darwin', '/skills/cycle/scripts', '/skills/cycle/scripts/cycle-hooks.mjs'],
    ['linux', '/skills/cycle/scripts', '/skills/cycle/scripts/cycle-hooks.mjs'],
    ['win32', 'C:\\skills\\cycle\\scripts', 'C:\\skills\\cycle\\scripts\\cycle-hooks.mjs'],
  ] as const)('script path on %s', (platform, dir, expected) => {
    expect(cycleHooksScriptPath(dir, platform)).toBe(expected)
  })
})
