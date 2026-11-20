import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('red snapshot publication regressions', () => {
  it('preserves custody on retry and with staged production edits', () => {
    const fixture = resolve('src/conformance/fixtures/red-snapshot-push-regression.mjs')
    expect(() =>
      execFileSync(process.execPath, ['--test', fixture], { stdio: 'pipe' }),
    ).not.toThrow()
  }, 30000)
})
