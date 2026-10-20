import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// #568 B10/B11: /pair-assistant states how to opt back in after a skipped registry, and names
// every path pair installs (derived from the registries config) so none is flagged as unexpected.

const skill = readFileSync(
  join(__dirname, '../../dataset/plugin/skills/pair-assistant/SKILL.md'),
  'utf-8',
)
const config = JSON.parse(readFileSync(join(__dirname, '../../../../apps/pair-cli/config.json'), 'utf-8'))

const section = (heading: string) => {
  const i = skill.indexOf(heading)
  expect(i, heading).toBeGreaterThan(-1)
  const rest = skill.slice(i + heading.length)
  const next = rest.search(/\n##+ /)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('pair-assistant install footprint (#568)', () => {
  it('AC11: after an update that skips agents, says how to opt back in in the same output', () => {
    const s = section('### After an update that skipped a registry')
    expect(s).toMatch(/skipping agents/)
    expect(s).toMatch(/same (output|reply|answer)/i)
    expect(s).toMatch(/remove[^\n]*`agents`[^\n]*`skipRegistries`/)
    expect(s).toMatch(/AGENTS\.md\.bak/)
    expect(s).toMatch(/--persist-backup/)
  })

  it('AC12: names every target path of the registries config', () => {
    const s = section('### What pair installs')
    const targets = Object.values<{ targets: { path: string }[] }>(config.asset_registries).flatMap(
      r => r.targets.map(t => t.path.replace(/\/$/, '')),
    )
    expect(targets.length).toBeGreaterThan(8)
    for (const t of targets) expect(s, t).toContain('`' + t)
    expect(s).toMatch(/\.pair\//)
    expect(s).toMatch(/never flag|not unexpected|expected/i)
  })
})
