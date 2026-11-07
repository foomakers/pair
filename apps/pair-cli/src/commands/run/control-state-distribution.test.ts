import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Config } from '#registry'
import { locateControlStateScript, readStateMapping, resolveCardReadiness } from './card-readiness'

const source = resolve(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/next/control-state.mjs',
)
const config = {
  asset_registries: {
    skills: {
      source: '.skills',
      behavior: 'overwrite',
      description: 'skills',
      include: [],
      flatten: true,
      prefix: 'pair',
      targets: [{ path: '.agents/skills', mode: 'canonical' }],
    },
  },
} as unknown as Config
const fs = {
  existsSync,
  readFileSync: (path: string) => readFileSync(path, 'utf8'),
} as Parameters<typeof locateControlStateScript>[0]
const roots: string[] = []
const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-installed-state-'))
  roots.push(root)
  return root
}
const put = (path: string, data: string) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('installed pair-next control state', () => {
  it('routes a custom board through the real copied producer', () => {
    const root = project()
    const skill = join(root, '.agents/skills/pair-next')
    put(join(skill, 'SKILL.md'), '# next')
    copyFileSync(source, join(skill, 'control-state.mjs'))
    put(
      join(root, '.pair/adoption/tech/way-of-working.md'),
      '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Queue | Draft |\n| Approved | Ready |\n',
    )
    const script = locateControlStateScript(fs, config, root)
    expect(script).toBe(join(skill, 'control-state.mjs'))
    const mapping = readStateMapping(fs, root, script)
    const result = resolveCardReadiness(
      { title: 'Work', body: '', boardState: 'Approved' },
      mapping,
      script,
    )
    expect(result.readiness).toBe('refined-no-breakdown')
    expect(result.warnings?.[0]).toContain('DoR fails')
  })

  it('names a broken installed producer instead of guessing a state', () => {
    const root = project()
    put(join(root, '.agents/skills/pair-next/SKILL.md'), '# next')
    expect(() => locateControlStateScript(fs, config, root)).toThrow(/has no control-state\.mjs/)
  })
})
