import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { readSkillsDatasetFromDisk } from './skill-md-mirror'
import { parseFrontmatter } from './skills-conformance-check'
import {
  SKILL_PATH_PREFIX,
  expectedPluginSkillPaths,
  declaredSkillPaths,
  parseMarketplaceManifest,
  parsePluginManifest,
  assertSkillCatalogInSync,
  assertDeclaredSkillsResolve,
  assertNoDistributedAgents,
} from './claude-plugin-manifest'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
const MARKETPLACE_JSON = join(REPO_ROOT, '.claude-plugin/marketplace.json')
const PLUGIN_JSON = join(REPO_ROOT, '.claude-plugin/plugin.json')

/** True when `relPath` (a `./`-prefixed plugin-root-relative dir) holds a SKILL.md. */
const hasSkillMd = (relPath: string): boolean => existsSync(join(REPO_ROOT, relPath, 'SKILL.md'))

/** Runs `fn`, expecting it to throw, and returns the thrown Error's message. */
const captureThrownMessage = (fn: () => void): string => {
  try {
    fn()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the assertion to throw, but it did not')
}

/**
 * The real repo-root `.claude-plugin/` pair: schema shape (AC1 — the manifest
 * Claude Code actually accepts) and catalog sync with the dataset skills (AC2 —
 * every shipped skill listed, nothing stale). Hand-maintained by design (AC3):
 * this guard never generates the manifest, it fails loudly with the edit to make.
 */
describe('.claude-plugin marketplace + plugin manifests (real repo)', () => {
  const marketplace = parseMarketplaceManifest(readFileSync(MARKETPLACE_JSON, 'utf-8'))
  const plugin = parsePluginManifest(readFileSync(PLUGIN_JSON, 'utf-8'))
  const declared = declaredSkillPaths(plugin.skills)
  const expected = expectedPluginSkillPaths(readSkillsDatasetFromDisk(DATASET_SKILLS))

  it('exposes exactly one plugin entry sourced from the marketplace root (AC1)', () => {
    expect(marketplace.plugins).toHaveLength(1)
    const entry = marketplace.plugins[0]!
    // Marketplace-root source: the plugin root is the repo, so the skills'
    // relative KB links (`../../../.pair/knowledge/...`) resolve in the cache.
    expect(entry.source).toBe('./')
    // The marketplace entry name is what `/plugin install <name>@<marketplace>`
    // and `enabledPlugins` key on — keep it identical to plugin.json's name.
    expect(entry.name).toBe(plugin.name)
  })

  it('lists every dataset skill and nothing stale (AC2)', () => {
    expect(() => assertSkillCatalogInSync(declared, expected)).not.toThrow()
    // Sanity: the expected set really is dataset-derived, not an empty list.
    expect(expected.length).toBeGreaterThan(0)
    expect(expected).toContain(`${SKILL_PATH_PREFIX}pair-next`)
    expect(expected).toContain(`${SKILL_PATH_PREFIX}pair-process-implement`)
  })

  it('declares only skill dirs that exist on disk with a SKILL.md', () => {
    expect(() => assertDeclaredSkillsResolve(declared, hasSkillMd)).not.toThrow()
  })

  it('distributes skills only — no named role agents (D23, R9.3)', () => {
    expect(() => assertNoDistributedAgents('.claude-plugin/plugin.json', plugin)).not.toThrow()
    for (const entry of marketplace.plugins) {
      expect(() =>
        assertNoDistributedAgents(`.claude-plugin/marketplace.json → ${entry.name}`, entry),
      ).not.toThrow()
    }
  })

  it('pins no version, so a stale hand-edit can never freeze users on an old catalog (AC3)', () => {
    // Claude Code falls back to the git commit SHA when `version` is absent, so
    // `/plugin update` always yields the current catalog. Pinning a version in a
    // HAND-maintained manifest would strand users at the last remembered bump —
    // see the marketplace-plugin-packaging ADL. `claude plugin validate --strict`
    // warns about the omission; that is the accepted tradeoff, not an oversight.
    expect(plugin.version).toBeUndefined()
    expect(marketplace.plugins[0]!.version).toBeUndefined()
  })

  it('does not distribute root-only third-party skills (dataset-derived catalog)', () => {
    // `.claude/skills/agent-browser` is installed in this repo but has no dataset
    // source — it is not pair's to redistribute through pair's marketplace.
    expect(declared.some(p => p.endsWith('/agent-browser'))).toBe(false)
  })

  it.each(
    // Data-driven over the real manifest: a newly listed skill is covered with no test edit.
    declaredSkillPaths(parsePluginManifest(readFileSync(PLUGIN_JSON, 'utf-8')).skills),
  )('%s installs under the name the dataset transform gives it (AC2)', declaredPath => {
    const dirName = declaredPath.slice(SKILL_PATH_PREFIX.length)
    const frontmatter = parseFrontmatter(
      readFileSync(join(REPO_ROOT, declaredPath, 'SKILL.md'), 'utf-8'),
    )
    // Plugin skills are invoked as `/<plugin>:<frontmatter name>` (bare name too),
    // so the frontmatter name is the user-visible skill name. Its equality with the
    // dataset source (name AND description) is pinned by the mirror-equality guard
    // in skill-md-mirror.test.ts; here we pin the manifest path to that same name.
    expect(frontmatter?.values.name).toBe(dirName)
  })
})

describe('parseMarketplaceManifest — required Claude Code schema fields', () => {
  const valid = {
    name: 'pair',
    owner: { name: 'Foomakers' },
    plugins: [{ name: 'pair', source: './' }],
  }

  it('accepts a manifest carrying name + owner + plugins', () => {
    expect(parseMarketplaceManifest(JSON.stringify(valid)).name).toBe('pair')
  })

  it('rejects malformed JSON, naming the file', () => {
    expect(() => parseMarketplaceManifest('{ nope', 'mp.json')).toThrow(/mp\.json.*not valid JSON/)
  })

  it('rejects a missing marketplace name', () => {
    expect(() => parseMarketplaceManifest(JSON.stringify({ ...valid, name: '' }))).toThrow(/name/)
  })

  it('rejects a non-kebab-case name (public-facing install string)', () => {
    expect(() =>
      parseMarketplaceManifest(JSON.stringify({ ...valid, name: 'Pair Skills' })),
    ).toThrow(/kebab-case/)
  })

  it('rejects a missing owner.name', () => {
    expect(() => parseMarketplaceManifest(JSON.stringify({ ...valid, owner: {} }))).toThrow(/owner/)
  })

  it('rejects an empty plugins array', () => {
    expect(() => parseMarketplaceManifest(JSON.stringify({ ...valid, plugins: [] }))).toThrow(
      /plugins/,
    )
  })

  it('rejects a plugin entry without a source', () => {
    expect(() =>
      parseMarketplaceManifest(JSON.stringify({ ...valid, plugins: [{ name: 'pair' }] })),
    ).toThrow(/source/)
  })

  it('rejects a relative source that does not start with ./', () => {
    expect(() =>
      parseMarketplaceManifest(
        JSON.stringify({ ...valid, plugins: [{ name: 'pair', source: 'plugins/pair' }] }),
      ),
    ).toThrow(/\.\//)
  })

  it('accepts an object source (github/npm/url/git-subdir form)', () => {
    const manifest = parseMarketplaceManifest(
      JSON.stringify({
        ...valid,
        plugins: [{ name: 'pair', source: { source: 'github', repo: 'foomakers/pair' } }],
      }),
    )
    expect(manifest.plugins[0]!.source).toEqual({ source: 'github', repo: 'foomakers/pair' })
  })
})

describe('parsePluginManifest — required Claude Code schema fields', () => {
  it('accepts a manifest carrying just a name', () => {
    expect(parsePluginManifest(JSON.stringify({ name: 'pair' })).name).toBe('pair')
  })

  it('rejects a missing name', () => {
    expect(() => parsePluginManifest(JSON.stringify({ description: 'x' }))).toThrow(/name/)
  })

  it('rejects a skills entry that is not a ./-relative path', () => {
    expect(() =>
      parsePluginManifest(JSON.stringify({ name: 'pair', skills: ['.claude/skills/pair-next'] })),
    ).toThrow(/\.\//)
  })

  it('rejects a skills value that is neither string nor array', () => {
    expect(() => parsePluginManifest(JSON.stringify({ name: 'pair', skills: 42 }))).toThrow(
      /skills/,
    )
  })
})

describe('declaredSkillPaths — normalization', () => {
  it('accepts the single-string form', () => {
    expect(declaredSkillPaths('./.claude/skills/pair-next')).toEqual(['./.claude/skills/pair-next'])
  })

  it('strips trailing slashes so path style never counts as drift', () => {
    expect(declaredSkillPaths(['./.claude/skills/pair-next/'])).toEqual([
      './.claude/skills/pair-next',
    ])
  })

  it('returns an empty list when no skills are declared', () => {
    expect(declaredSkillPaths(undefined)).toEqual([])
  })
})

/**
 * Drift-injection: the guard must FAIL on each way a hand-maintained manifest
 * goes stale (AC3's known manual-process risk) and PASS once reconciled.
 */
describe('assertSkillCatalogInSync — drift injection', () => {
  const expected = [
    './.claude/skills/pair-capability-verify-quality',
    './.claude/skills/pair-next',
    './.claude/skills/pair-process-implement',
  ]

  it('passes when the manifest lists exactly the dataset catalog', () => {
    expect(() => assertSkillCatalogInSync([...expected].reverse(), expected)).not.toThrow()
  })

  it('FAILS when a newly added skill is missing, naming it and the file to edit by hand', () => {
    const declared = expected.filter(p => !p.endsWith('pair-next'))
    const message = captureThrownMessage(() => assertSkillCatalogInSync(declared, expected))
    expect(message).toContain('./.claude/skills/pair-next')
    expect(message).toMatch(/missing/i)
    expect(message).toContain('.claude-plugin/plugin.json')
  })

  it('FAILS when a removed/renamed skill leaves a stale entry behind', () => {
    const declared = [...expected, './.claude/skills/pair-capability-gone']
    const message = captureThrownMessage(() => assertSkillCatalogInSync(declared, expected))
    expect(message).toContain('pair-capability-gone')
    expect(message).toMatch(/stale/i)
  })

  it('reports missing and stale entries together in one failure', () => {
    const declared = [...expected.slice(1), './.claude/skills/pair-capability-gone']
    const message = captureThrownMessage(() => assertSkillCatalogInSync(declared, expected))
    expect(message).toContain('pair-capability-verify-quality')
    expect(message).toContain('pair-capability-gone')
  })

  it('FAILS on a duplicated entry', () => {
    const declared = [...expected, './.claude/skills/pair-next']
    expect(() => assertSkillCatalogInSync(declared, expected)).toThrow(/duplicate/i)
  })
})

describe('expectedPluginSkillPaths — derived from the dataset, never hardcoded', () => {
  it('maps dataset skill dirs through the real install transform', () => {
    const paths = expectedPluginSkillPaths({
      'capability/verify-quality/SKILL.md': '---\nname: verify-quality\n---\n',
      'process/implement/SKILL.md': '---\nname: implement\n---\n',
      'next/SKILL.md': '---\nname: next\n---\n',
      // a non-SKILL.md asset must not become a catalog entry
      'capability/verify-quality/references/matrix.md': '# matrix\n',
    })
    expect(paths).toEqual([
      './.claude/skills/pair-capability-verify-quality',
      './.claude/skills/pair-next',
      './.claude/skills/pair-process-implement',
    ])
  })
})

describe('assertDeclaredSkillsResolve — stale path detection', () => {
  it('passes when every declared dir holds a SKILL.md', () => {
    expect(() =>
      assertDeclaredSkillsResolve(['./.claude/skills/pair-next'], () => true),
    ).not.toThrow()
  })

  it('FAILS naming each declared dir with no SKILL.md', () => {
    const message = captureThrownMessage(() =>
      assertDeclaredSkillsResolve(
        ['./.claude/skills/pair-next', './.claude/skills/pair-ghost'],
        p => p.endsWith('pair-next'),
      ),
    )
    expect(message).toContain('pair-ghost')
    expect(message).not.toContain('pair-next,')
  })
})

describe('assertNoDistributedAgents — D23 / R9.3', () => {
  it('passes for a skills-only manifest', () => {
    expect(() =>
      assertNoDistributedAgents('plugin.json', { name: 'pair', skills: ['./.claude/skills/x'] }),
    ).not.toThrow()
  })

  it('FAILS when the manifest declares agents', () => {
    expect(() =>
      assertNoDistributedAgents('plugin.json', { name: 'pair', agents: ['./agents/reviewer.md'] }),
    ).toThrow(/agents/)
  })
})
