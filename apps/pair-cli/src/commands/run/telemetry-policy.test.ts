import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { expect, it } from 'vitest'
import { telemetryEnabled } from './telemetry-policy'

it('AC-24: telemetry is off with no setting; adoption enables it; an explicit flag wins both ways', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-telemetry-policy-'))
  try {
    expect(telemetryEnabled(root)).toBe(false)
    const dir = join(root, '.pair/adoption/tech')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'automation.md'), '## Other\n\n- enabled: true\n')
    expect(telemetryEnabled(root)).toBe(false)
    writeFileSync(join(dir, 'automation.md'), '## Telemetry\n\n- enabled: true\n')
    expect(telemetryEnabled(root)).toBe(true)
    expect(telemetryEnabled(root, false)).toBe(false)
    writeFileSync(
      join(dir, 'automation.md'),
      '## Telemetry\n\n- enabled: true\n\n## Other\n\n- enabled: false\n',
    )
    expect(telemetryEnabled(root)).toBe(true)
    writeFileSync(join(dir, 'automation.md'), '## Telemetry\n\n- enabled: false\n')
    expect(telemetryEnabled(root, true)).toBe(true)
    expect(telemetryEnabled(root)).toBe(false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
