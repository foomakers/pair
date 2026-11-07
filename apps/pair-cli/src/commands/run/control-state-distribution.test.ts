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
import { dirname, join, posix, resolve, win32 } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const resolverFixture = vi.hoisted(() => ({ bundlePresent: false }))
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
      (resolverFixture.bundlePresent && String(path).endsWith('/src/assets/control-state.mjs')) ||
      actual.existsSync(path),
  }
})
import type { Config } from '#registry'
import {
  locateControlStateScript,
  readStateMapping,
  resolveCardReadiness,
  withinSkillTarget,
} from './card-readiness'

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
afterEach(() => {
  resolverFixture.bundlePresent = false
  vi.restoreAllMocks()
})

describe('installed pair-next control state', () => {
  it('contains skill paths on injected linux and Windows platform grammars', () => {
    expect(withinSkillTarget('/project/skills', '/project/skills/pair-next', posix)).toBe(true)
    expect(withinSkillTarget('/project/skills', '/project/skills-other/pair-next', posix)).toBe(
      false,
    )
    expect(withinSkillTarget('C:\\project\\skills', 'C:\\project\\skills\\pair-next', win32)).toBe(
      true,
    )
    expect(withinSkillTarget('C:\\project\\skills', 'D:\\project\\skills\\pair-next', win32)).toBe(
      false,
    )
  })
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

  it.each(['pair-next', 'pair-pair-next', 'next'])(
    'configured target resolves %s before packaged fallback',
    name => {
      const root = project()
      const skill = join(root, '.agents/skills', name)
      put(join(skill, 'SKILL.md'), '# next')
      put(join(skill, 'control-state.mjs'), 'module.exports = {}')
      expect(locateControlStateScript(fs, config, root)).toBe(join(skill, 'control-state.mjs'))
    },
  )

  it('first configured target wins even when the later target has the canonical name', () => {
    const root = project()
    const first = join(root, '.agents/skills/next')
    const later = join(root, '.claude/skills/pair-next')
    for (const skill of [first, later]) {
      put(join(skill, 'SKILL.md'), '# next')
      put(join(skill, 'control-state.mjs'), 'module.exports = {}')
    }
    const twoTargets = {
      asset_registries: {
        skills: {
          ...config.asset_registries['skills'],
          targets: [
            { path: '.agents/skills', mode: 'canonical' },
            { path: '.claude/skills', mode: 'canonical' },
          ],
        },
      },
    } as Config
    expect(locateControlStateScript(fs, twoTargets, root)).toBe(join(first, 'control-state.mjs'))
  })

  it('source resolver is used only when the bundle is absent', () => {
    const root = project()
    const script = locateControlStateScript(fs, config, root)
    expect(script).toBe(source)
  })

  it('bundled resolver wins when both bundle and source exist', () => {
    const root = project()
    const bundle = resolve(__dirname, '../../assets/control-state.mjs')
    resolverFixture.bundlePresent = true
    expect(locateControlStateScript(fs, config, root)).toBe(bundle)
  })
})
