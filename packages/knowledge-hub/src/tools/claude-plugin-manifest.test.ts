import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { readdirSync } from 'fs'
import {
  SKILL_PATH_PREFIX,
  PLUGIN_ROOT_REL,
  PLUGIN_MANIFEST_REL,
  expectedPluginSkillPaths,
  assertBootstrapSkillsValid,
  declaredSkillPaths,
  parseMarketplaceManifest,
  parsePluginManifest,
  assertSkillCatalogInSync,
  assertDeclaredSkillsResolve,
  assertSkillsOnlyDistribution,
  assertNoRootPluginComponents,
  ROOT_PLUGIN_COMPONENT_PATHS,
  SCHEMA_COMPONENT_KEYS,
  ALLOWED_PLUGIN_MANIFEST_KEYS,
  ALLOWED_MARKETPLACE_MANIFEST_KEYS,
  ALLOWED_MARKETPLACE_ENTRY_KEYS,
} from './claude-plugin-manifest'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const MARKETPLACE_JSON = join(REPO_ROOT, '.claude-plugin/marketplace.json')
// The plugin root is the bootstrap corpus's parent, NOT the repo root: plugin.json
// and every declared skill path resolve against it.
const PLUGIN_ROOT = join(REPO_ROOT, PLUGIN_ROOT_REL)
const PLUGIN_JSON = join(REPO_ROOT, PLUGIN_MANIFEST_REL)
const BOOTSTRAP_SKILLS = join(PLUGIN_ROOT, 'skills')

/** True when `relPath` (a `./`-prefixed PLUGIN-root-relative dir) holds a SKILL.md. */
const hasSkillMd = (relPath: string): boolean => existsSync(join(PLUGIN_ROOT, relPath, 'SKILL.md'))

/**
 * The bootstrap skill dirs on disk — the expected catalog's only source.
 *
 * `statSync`, not `Dirent.isDirectory()`: a Dirent for a SYMLINK reports false, so a
 * symlinked skill directory would be invisible to both this guard and
 * `assertBootstrapSkillsValid` while Claude Code loads it anyway. Since `skills` is
 * exempt from the root-payload check at this plugin root, this discovery is the only
 * compensating control — and the ADL's Alternatives records a symlinked
 * `plugin/skills/*` as a shape somebody already considered.
 */
const bootstrapSkillDirs = (): string[] =>
  readdirSync(BOOTSTRAP_SKILLS)
    .filter(name => statSync(join(BOOTSTRAP_SKILLS, name)).isDirectory())
    .sort()

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
  const expected = expectedPluginSkillPaths(bootstrapSkillDirs())

  it('exposes exactly one plugin entry sourced from the bootstrap corpus (AC1)', () => {
    expect(marketplace.plugins).toHaveLength(1)
    const entry = marketplace.plugins[0]!
    // NOT './': the payload is the bootstrap corpus, not the repository. That is what
    // keeps pair's own .pair/adoption out of the plugin cache, so a skill on this
    // channel can no longer read pair's decisions as if they were the project's.
    expect(entry.source).toBe(`./${PLUGIN_ROOT_REL}`)
    // The marketplace entry name is what `/plugin install <name>@<marketplace>`
    // and `enabledPlugins` key on — keep it identical to plugin.json's name.
    expect(entry.name).toBe(plugin.name)
  })

  it('lists every bootstrap skill and nothing stale (AC2)', () => {
    expect(() => assertSkillCatalogInSync(declared, expected)).not.toThrow()
    // Sanity: the expected set really is derived from disk, not an empty list.
    expect(expected.length).toBeGreaterThan(0)
    expect(expected).toContain(`${SKILL_PATH_PREFIX}pair-assistant`)
  })

  it('ships the bootstrap corpus ONLY — the distributed catalog travels via the CLI', () => {
    // The declared catalog must not contain a generated `.claude/skills/` path: that
    // would mean the payload is the repo again, and with it pair's own adoption files.
    expect(declared.every(path => path.startsWith(SKILL_PATH_PREFIX))).toBe(true)
    expect(declared.some(path => path.includes('.claude/skills'))).toBe(false)
  })

  it('every bootstrap skill is valid and ISOLATED (no KB or adoption link)', () => {
    const files = bootstrapSkillDirs().map(dir => ({
      dir,
      content: readFileSync(join(BOOTSTRAP_SKILLS, dir, 'SKILL.md'), 'utf-8'),
    }))
    expect(() => assertBootstrapSkillsValid(files)).not.toThrow()
  })

  it('declares only skill dirs that exist on disk with a SKILL.md', () => {
    expect(() => assertDeclaredSkillsResolve(declared, hasSkillMd)).not.toThrow()
  })

  it('distributes skills only — allowlisted keys on all three hand-edited surfaces', () => {
    expect(() => assertSkillsOnlyDistribution('.claude-plugin/plugin.json', plugin)).not.toThrow()
    // The marketplace manifest's OWN top level is a third surface, with its own
    // behaviour-bearing keys (forceRemoveDeletedPlugins, allowCrossMarketplaceDependenciesOn,
    // metadata.pluginRoot) that neither of the other two allowlists would ever see.
    expect(() =>
      assertSkillsOnlyDistribution('.claude-plugin/marketplace.json', marketplace, 'marketplace'),
    ).not.toThrow()
    for (const entry of marketplace.plugins) {
      expect(() =>
        assertSkillsOnlyDistribution(
          `.claude-plugin/marketplace.json → ${entry.name}`,
          entry,
          'marketplace-entry',
        ),
      ).not.toThrow()
    }
  })

  it('keeps the skill catalog in plugin.json only — no `skills` on the marketplace entry', () => {
    // The schema permits `skills` on a marketplace entry, where it REPLACES the
    // plugin manifest's catalog: adding it installs that list instead of the 40
    // curated entries, and assertSkillCatalogInSync (plugin.json only) never sees it.
    for (const entry of marketplace.plugins) {
      expect(entry['skills']).toBeUndefined()
    }
  })

  it('pins no version, so a stale hand-edit can never freeze users on an old catalog (AC3)', () => {
    // Claude Code falls back to the git commit SHA when `version` is absent, so
    // `/plugin update` always yields the current catalog. Pinning a version in a
    // HAND-maintained manifest would strand users at the last remembered bump —
    // see the marketplace-plugin-packaging ADL (Decision 4). Plain
    // `claude plugin validate .` passes with a "no version specified" WARNING;
    // `--strict` turns that warning into a FAILURE (non-zero exit, verified on CLI
    // v2.1.220), so no gate may run `--strict` while this decision stands. The
    // warning is the accepted tradeoff, not an oversight.
    expect(plugin.version).toBeUndefined()
    expect(marketplace.plugins[0]!.version).toBeUndefined()
  })

  it('does not distribute root-only third-party skills (dataset-derived catalog)', () => {
    // `.claude/skills/agent-browser` is installed in this repo but has no dataset
    // source, so it is never exposed or loaded as a distributed pair skill. Note the
    // exact scope: with `source: "./"` the file IS still copied into the plugin cache
    // (the public repo carries it anyway) — non-declaration is a LOADING control, not
    // a redistribution control. See the ADL's Decision 3 note.
    expect(declared.some(p => p.endsWith('/agent-browser'))).toBe(false)
  })

  it('ships no root-level plugin component payload beyond skills (skills-only rule)', () => {
    // With `source: "./"` the whole repo IS the plugin payload, so non-declaration in
    // plugin.json prevents *loading* a component, not *copying* it. The payload-level
    // guarantee is the absence of the paths Claude Code discovers at the plugin root.
    expect(() =>
      assertNoRootPluginComponents(rel => existsSync(join(PLUGIN_ROOT, rel))),
    ).not.toThrow()
  })
})

describe('parseMarketplaceManifest — required Claude Code schema fields', () => {
  const valid = {
    name: 'pair',
    owner: { name: 'Foomakers' },
    plugins: [{ name: 'pair', source: './' }],
  }

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

  it('rejects a skills entry escaping the plugin root (a plugin cannot reach outside it)', () => {
    // ADL decision 1's invariant: the plugin root is the whole payload; a '..' segment
    // names a real mistake (escaping the root), so say that instead of letting it
    // surface downstream as a vague "stale entry".
    expect(() =>
      parsePluginManifest(
        JSON.stringify({ name: 'pair', skills: ['./../.claude/skills/pair-next'] }),
      ),
    ).toThrow(/plugin root/i)
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

describe('expectedPluginSkillPaths — derived from the bootstrap corpus, never hardcoded', () => {
  it('prefixes each bootstrap skill dir and sorts', () => {
    const paths = expectedPluginSkillPaths(['pair-assistant', 'pair-another-bootstrap'])
    expect(paths).toEqual(['./skills/pair-another-bootstrap', './skills/pair-assistant'])
  })
})

describe('assertDeclaredSkillsResolve — stale path detection', () => {

  it('FAILS naming each declared dir with no SKILL.md', () => {
    const message = captureThrownMessage(() =>
      assertDeclaredSkillsResolve(
        ['./.claude/skills/pair-next', './.claude/skills/pair-ghost'],
        p => p.endsWith('pair-next'),
      ),
    )
    expect(message).toContain('pair-ghost')
    // A resolving entry must NOT be reported as broken (the message renders one
    // `    - <path>/SKILL.md` line per broken dir, so match on that exact form).
    expect(message).not.toContain('pair-next/SKILL.md')
  })
})

describe('assertSkillsOnlyDistribution — allowlist, not denylist', () => {

  it('accepts every metadata key the published schemas declare', () => {
    // Without this, tightening to an allowlist could break a legitimate hand edit
    // (e.g. adding `license`) — the allowlist must cover the whole metadata surface.
    const metadataOnly = Object.fromEntries(
      ALLOWED_PLUGIN_MANIFEST_KEYS.filter(k => k !== 'skills').map(k => [k, 'x']),
    )
    expect(() => assertSkillsOnlyDistribution('plugin.json', metadataOnly)).not.toThrow()
    const entryMetadata = Object.fromEntries(ALLOWED_MARKETPLACE_ENTRY_KEYS.map(k => [k, 'x']))
    expect(() =>
      assertSkillsOnlyDistribution('marketplace.json → pair', entryMetadata, 'marketplace-entry'),
    ).not.toThrow()
    const marketplaceMetadata = Object.fromEntries(
      ALLOWED_MARKETPLACE_MANIFEST_KEYS.map(k => [k, 'x']),
    )
    expect(() =>
      assertSkillsOnlyDistribution(
        'marketplace.json',
        { ...marketplaceMetadata, metadata: { version: '1', description: 'x' } },
        'marketplace',
      ),
    ).not.toThrow()
  })

  it('FAILS on metadata.pluginRoot — an allowlist over top-level keys alone misses it', () => {
    // `metadata` is legitimately permitted (version/description), so the nested
    // behaviour key needs its own check: pluginRoot rebases relative plugin sources
    // and therefore changes which directory ships from under `source: "./"`.
    const message = captureThrownMessage(() =>
      assertSkillsOnlyDistribution(
        'marketplace.json',
        {
          name: 'pair',
          owner: { name: 'Foomakers' },
          plugins: [{ name: 'pair', source: './' }],
          metadata: { description: 'x', pluginRoot: './packages' },
        },
        'marketplace',
      ),
    )
    expect(message).toContain('metadata.pluginRoot')
    expect(message).toMatch(/ships as the plugin payload/)
  })

  it('explains that an entry-level `skills` voids the catalog guard', () => {
    const message = captureThrownMessage(() =>
      assertSkillsOnlyDistribution(
        'marketplace.json → pair',
        { name: 'pair', source: './', skills: ['./.claude/skills/agent-browser'] },
        'marketplace-entry',
      ),
    )
    expect(message).toMatch(/REPLACES plugin\.json/)
    expect(message).toContain('assertSkillCatalogInSync')
  })

  it('FAILS on a key the schema does not declare at all (typo / dead metadata)', () => {
    // An allowlist also catches `displayName`-style keys: not in the schema, silently
    // tolerated by `claude plugin validate`, never read by the runtime.
    const message = captureThrownMessage(() =>
      assertSkillsOnlyDistribution('plugin.json', { name: 'pair', displayName: 'pair' }),
    )
    expect(message).toContain('displayName')
  })
})

describe('assertNoRootPluginComponents — payload-level skills-only guarantee', () => {

  it.each(ROOT_PLUGIN_COMPONENT_PATHS)('FAILS when %s exists at the plugin root', path => {
    const message = captureThrownMessage(() => assertNoRootPluginComponents(rel => rel === path))
    expect(message).toContain(path)
    expect(message).toMatch(/bootstrap skills\/ dir and nothing else/i)
  })

  it('EXEMPTS `skills/` — at this plugin root it IS the declared payload', () => {
    // Under the previous shape (source: "./", the whole repo) a root `skills/` dir was
    // a hazard: additive auto-discovery would ship AND load skills absent from
    // plugin.json. Now the plugin root is the bootstrap corpus's parent, so `skills/`
    // sits there by construction and auto-discovery agrees with the manifest instead of
    // competing — the whole payload is what we mean to ship. Every OTHER component key
    // stays forbidden, which the cases above assert one by one.
    expect(ROOT_PLUGIN_COMPONENT_PATHS).not.toContain('skills')
    expect(SCHEMA_COMPONENT_KEYS).toContain('skills')
  })

  it('is DERIVED from the schema component keys, so it cannot lag the schema', () => {
    // The list used to be hand-enumerated and lagged by one corner at a time
    // (`monitors` — unsandboxed background scripts, hooks' trust tier — was missing).
    // Deriving it means a component key added to SCHEMA_COMPONENT_KEYS extends the
    // root-payload guard in the same edit as the manifest allowlist.
    for (const key of SCHEMA_COMPONENT_KEYS.filter(k => k !== 'skills')) {
      expect(ROOT_PLUGIN_COMPONENT_PATHS).toContain(key)
    }
    expect(ROOT_PLUGIN_COMPONENT_PATHS).toContain('monitors')
    // `.mcp.json` is the one root path that is a file, not a directory per key.
    expect(ROOT_PLUGIN_COMPONENT_PATHS).toContain('.mcp.json')
  })
})

describe('pair-assistant Step 0b (US-552)', () => {
  const skill = readFileSync(join(PLUGIN_ROOT, 'skills/pair-assistant/SKILL.md'), 'utf-8')
  it('explains the keep choice lives in pair.config.json skipRegistries, update honours it, how to opt back in', () => {
    expect(skill).toMatch(
      /skipRegistries[^\n]*pair\.config\.json[^\n]*every later `update` honours it/,
    )
    expect(skill).toMatch(
      /remove the name[\s\S]*mv AGENTS\.md AGENTS\.md\.bak[\s\S]*--persist-backup/,
    )
  })

  it('asks keep/overwrite per file, backs up with mv, keeps via --skip-registries', () => {
    expect(skill).toMatch(/\*\*Keep\*\*[\s\S]*--skip-registries agents/)
    expect(skill).toContain('mv AGENTS.md AGENTS.md.bak')
    expect(skill).toMatch(/never overwritten silently/)
    expect(skill).toMatch(/not reachable from their `AGENTS.md`/)
  })
  it('never says AGENTS.md is REPLACED', () => {
    expect(skill).not.toMatch(/REPLACED/)
  })
})
