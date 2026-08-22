import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { loadConfigWithOverrides, validateConfig } from './loader'
import { readFileSync } from 'fs'
import { join } from 'path'

const REAL_CONFIG = readFileSync(join(__dirname, '..', '..', 'config.json'), 'utf-8')

describe('config loader - skills registry', () => {
  it('loads skills registry from config.json', () => {
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs)
    const skills = config.asset_registries['skills']

    expect(skills).toBeDefined()
    expect(skills!.source).toBe('.skills')
    expect(skills!.behavior).toBe('overwrite')
    expect(skills!.flatten).toBe(true)
    expect(skills!.prefix).toBe('pair')
    expect(skills!.targets).toHaveLength(6)
    expect(skills!.targets![0]!.mode).toBe('canonical')
  })

  it('validates config with skills registry', () => {
    const config = JSON.parse(REAL_CONFIG)
    const result = validateConfig(config)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('merges local override for skills targets', () => {
    const localOverride = {
      asset_registries: {
        skills: {
          targets: [
            { path: '.claude/skills/', mode: 'canonical' },
            { path: '.custom/skills/', mode: 'copy' },
          ],
        },
      },
    }

    const fs = new InMemoryFileSystemService(
      {
        '/module/config.json': REAL_CONFIG,
        '/project/pair.config.json': JSON.stringify(localOverride),
      },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs, { projectRoot: '/project' })
    const skills = config.asset_registries['skills']

    // Local override replaces targets array (shallow merge per registry)
    expect(skills!.targets).toHaveLength(2)
    expect(skills!.targets![1]!.path).toBe('.custom/skills/')
    // Base fields preserved
    expect(skills!.flatten).toBe(true)
    expect(skills!.prefix).toBe('pair')
  })

  it('preserves existing registries alongside skills', () => {
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG },
      '/module',
      '/project',
    )

    const { config } = loadConfigWithOverrides(fs)
    expect(config.asset_registries['github']).toBeDefined()
    expect(config.asset_registries['knowledge']).toBeDefined()
    expect(config.asset_registries['adoption']).toBeDefined()
    expect(config.asset_registries['agents']).toBeDefined()
    expect(config.asset_registries['skills']).toBeDefined()
  })
})

/**
 * US-396 half B — an external KB declares its registries in its own pair.config.json.
 * `install --source <kb>` used to resolve the CONSUMING project's config only, so the
 * KB's declared namespacing silently did not apply.
 *
 * Precedence: base CLI config < source KB declaration < consuming project override.
 */
describe('config loader - source KB declaration', () => {
  const SOURCE_DECLARATION = JSON.stringify({
    asset_registries: {
      skills: { prefix: 'acme-kb' },
      knowledge: { source: '.pair/knowledge' },
    },
  })

  function fsWith(files: Record<string, string>) {
    return new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, ...files },
      '/module',
      '/project',
    )
  }

  it('honours the source declaration when the consumer declares nothing', () => {
    const fs = fsWith({ '/kb/pair.config.json': SOURCE_DECLARATION })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
    // Fields the source does not restate keep the CLI's defaults
    expect(config.asset_registries['skills']!.flatten).toBe(true)
    expect(sourceDeclaration).toEqual({ applied: true, unknownRegistries: [] })
  })

  it("lets the consuming project's own config win over the source declaration", () => {
    const fs = fsWith({
      '/kb/pair.config.json': SOURCE_DECLARATION,
      '/project/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'house-rules' } },
      }),
    })

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('house-rules')
  })

  it('lets an explicit --config win over the source declaration', () => {
    const fs = fsWith({
      '/kb/pair.config.json': SOURCE_DECLARATION,
      '/custom.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'explicit' } },
      }),
    })

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
      customConfigPath: '/custom.json',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('explicit')
  })

  it('falls back to the consumer resolution and warns when the source config is malformed', () => {
    const fs = fsWith({ '/kb/pair.config.json': '{ this is not json' })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    // No half-parsed declaration applied — the CLI default stands
    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toMatch(/pair\.config\.json/)
  })

  it('reports a source-declared registry this CLI does not know, instead of installing it', () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          skills: { prefix: 'acme-kb' },
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.telemetry', mode: 'canonical' }],
          },
        },
      }),
    })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['telemetry']).toBeUndefined()
    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
    expect(sourceDeclaration!.unknownRegistries).toEqual(['telemetry'])
  })

  it('adopts a source-declared registry the consuming project also declares', () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.telemetry', mode: 'canonical' }],
          },
        },
      }),
      '/project/pair.config.json': JSON.stringify({
        asset_registries: {
          telemetry: {
            source: '.telemetry',
            behavior: 'mirror',
            targets: [{ path: '.tele', mode: 'canonical' }],
          },
        },
      }),
    })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['telemetry']!.targets![0]!.path).toBe('.tele')
    expect(sourceDeclaration!.unknownRegistries).toEqual([])
  })

  it('is inert when no source root is named — the default path is untouched', () => {
    const fs = fsWith({ '/kb/pair.config.json': SOURCE_DECLARATION })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, { projectRoot: '/project' })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration).toBeUndefined()
  })

  it('does not re-apply the base config.json over the declaration as if it were a project override', () => {
    // Released layout: the project root and the CLI module dir can be the same directory,
    // and `config.json` there IS the base config — re-merging it as an "override" would
    // silently undo every source declaration.
    const fs = new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, '/module/kb/pair.config.json': SOURCE_DECLARATION },
      '/module',
      '/module',
    )

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/module',
      sourceRoot: '/module/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
  })

  it('is silent when the named source declares nothing at all', () => {
    const fs = fsWith({})

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(sourceDeclaration).toEqual({ applied: false, unknownRegistries: [] })
  })
})

/**
 * US-396 half B, trust boundary — layer 2 is the ONE layer the consuming project does not
 * control: it ships inside a remote, third-party KB. It may describe the source's own
 * content and namespacing; it may never decide WHERE the install writes.
 */
describe('config loader - the source declaration is validated, not trusted', () => {
  function fsWith(files: Record<string, string>) {
    return new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, ...files },
      '/module',
      '/project',
    )
  }

  function load(files: Record<string, string>) {
    return loadConfigWithOverrides(fsWith(files), { projectRoot: '/project', sourceRoot: '/kb' })
  }

  it('ignores targets declared by the source, however innocent they look', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          agents: { targets: [{ path: '../../.zshenv', mode: 'canonical' }] },
          knowledge: { targets: [{ path: 'unused-corner', mode: 'canonical' }] },
        },
      }),
    })

    // The CLI's own targets stand — a KB cannot repoint the install, inside or outside the project
    expect(config.asset_registries['agents']!.targets).toEqual(
      JSON.parse(REAL_CONFIG).asset_registries.agents.targets,
    )
    expect(config.asset_registries['knowledge']!.targets).toEqual(
      JSON.parse(REAL_CONFIG).asset_registries.knowledge.targets,
    )
  })

  it('ignores legacy target_path and behavior from the source', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { knowledge: { target_path: '/etc', behavior: 'mirror' } },
      }),
    })

    const base = JSON.parse(REAL_CONFIG).asset_registries.knowledge
    expect(config.asset_registries['knowledge']!.targets).toEqual(base.targets)
    expect(config.asset_registries['knowledge']!.behavior).toBe(base.behavior)
  })

  it('ignores a source prefix that would traverse — a prefix is a path SEGMENT', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: '../../../tmp/evil' } },
      }),
    })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
  })

  it('ignores a source prefix carrying a separator', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'acme/nested' } },
      }),
    })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
  })

  it.each([
    ['an absolute POSIX path', '/home/victim/.ssh'],
    ['a parent traversal', '../../../../Users'],
    ['a traversal that only shows up after normalisation', 'a/../../outside'],
    ['a bare parent', '..'],
    ['a Windows drive path', 'C:\\Users\\victim'],
    ['a backslash root', '\\\\server\\share'],
    ['an empty string', ''],
    ['a non-string', 42],
  ])(
    'ignores a source-declared source that is %s — layer 2 may not read outside the KB',
    (_label, declared) => {
      const { config } = load({
        '/kb/pair.config.json': JSON.stringify({
          asset_registries: { knowledge: { source: declared } },
        }),
      })

      expect(config.asset_registries['knowledge']!.source).toBe(
        JSON.parse(REAL_CONFIG).asset_registries.knowledge.source,
      )
    },
  )

  it('honours a source-declared source that stays inside the KB', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { knowledge: { source: 'docs/./knowledge' } },
      }),
    })

    expect(config.asset_registries['knowledge']!.source).toBe('docs/./knowledge')
  })

  /**
   * A declared value that survives the guards becomes a DIRECTORY NAME in the consumer's
   * repository (`prefix`) or a line on their terminal (`source`, `description`), so shape
   * and containment are not the whole boundary — the character set is part of it.
   *
   * Before this: a KB shipping `{"skills":{"prefix":"<ESC>[31mACME<ESC>[0m"}}` passed
   * `isSafePrefix` (no `/`, `\`, `..`) and the consumer's skills installed into
   * `.claude/skills/<ESC>[31mACME<ESC>[0m-example-skill`; a prefix carrying a newline
   * yielded a directory name that breaks any line-oriented script reading `ls`. And
   * `{"knowledge":{"source":"docs<ESC>[2K<ESC>[1A"}}` was echoed raw by `registryStart`
   * as `source: <path>`, letting remote content erase or forge the very lines the user
   * reads to judge whether the install went well (US-396 review round 6).
   */
  it.each([
    ['a prefix carrying an ANSI colour escape', { prefix: '\u001b[31mACME\u001b[0m' }, 'prefix'],
    ['a prefix carrying a newline', { prefix: 'acme\nEvil' }, 'prefix'],
    ['a prefix carrying a NUL byte', { prefix: 'acme\u0000evil' }, 'prefix'],
    ['a source carrying an erase-line sequence', { source: 'docs\u001b[2K\u001b[1A' }, 'source'],
    ['a source carrying a carriage return', { source: 'docs\rknowledge' }, 'source'],
    [
      'a description carrying a cursor-up sequence',
      { description: 'Acme\u001b[1AInstallation complete' },
      'description',
    ],
  ])('ignores %s — a declared value is plain text, never terminal control', (_l, bad, field) => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({ asset_registries: { knowledge: bad } }),
    })

    const knowledge = config.asset_registries['knowledge']! as unknown as Record<string, unknown>
    expect(knowledge[field]).toBe(JSON.parse(REAL_CONFIG).asset_registries.knowledge[field])
  })

  /**
   * Same forged-output risk as the field values above, on the REGISTRY NAME itself
   * (`asset_registries` key): an unknown name reaches `unknownRegistries`, which the
   * install summary prints verbatim via `registrySkipped` (US-396 review round 2). Unlike
   * `prefix`/`source`/`description` it has no allowlist guard of its own — it is never
   * merged into the config — so it is dropped at the point `declaredNames` is built.
   */
  it('drops a declared registry name carrying a control character before it can be reported', () => {
    const { config, sourceDeclaration } = loadConfigWithOverrides(
      fsWith({
        '/kb/pair.config.json': JSON.stringify({
          asset_registries: { 'future-registry\u001b[2K\r  \u001b[32mFORGED': {} },
        }),
      }),
      { projectRoot: '/project', sourceRoot: '/kb' },
    )

    expect(sourceDeclaration!.unknownRegistries).toEqual([])
    expect(Object.keys(config.asset_registries)).toEqual(
      Object.keys(JSON.parse(REAL_CONFIG).asset_registries),
    )
  })

  it('names the whole resolution chain, weakest first — not just the last writer', () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' } },
      }),
      '/project/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'house-rules' } },
      }),
      '/project/custom.json': JSON.stringify({ asset_registries: {} }),
    })

    const { source } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
      customConfigPath: '/project/custom.json',
    })

    expect(source).toBe(
      'pair-cli config.json < source KB declaration: /kb < pair.config.json < custom config: /project/custom.json',
    )
  })

  it('honours the fields that describe the source itself', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          skills: {
            prefix: 'acme-kb',
            source: '.acme-skills',
            exclude: ['internal/**'],
            flatten: true,
            flattenDepth: 3,
            description: 'Acme skills',
          },
        },
      }),
    })

    const skills = config.asset_registries['skills']!
    expect(skills.prefix).toBe('acme-kb')
    expect(skills.source).toBe('.acme-skills')
    expect(skills.exclude).toEqual(['internal/**'])
    expect(skills.flatten).toBe(true)
    expect(skills.flattenDepth).toBe(3)
    expect(skills.description).toBe('Acme skills')
  })

  /**
   * US-396 review round 2 (escalated Critical) — `include` looks like a content field but
   * for a `mirror` registry it scopes MIRROR-CLEANUP OWNERSHIP (`registry/operations.ts`),
   * a write decision. A source declaring `{"include":[]}` widened cleanup to the whole
   * target instead of narrowing it, and deleted files the source never shipped. `include`
   * is therefore dropped like `targets`, never merged, regardless of shape.
   */
  it('never honours include — it decides mirror-cleanup ownership, a write decision', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: {
          github: { include: [] },
        },
      }),
    })

    const github = config.asset_registries['github']!
    expect(github.include).toEqual(JSON.parse(REAL_CONFIG).asset_registries.github.include)
  })

  it('ignores top-level keys declared by the source, such as working_path', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({
        working_path: '../outside/working',
        target: '/etc',
        asset_registries: { skills: { prefix: 'acme-kb' } },
      }),
    })

    expect(config['working_path']).toBeUndefined()
    expect(config['target']).toBeUndefined()
    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
  })

  it.each([
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['a string', '"x"'],
    ['a number', '42'],
    ['asset_registries that is not an object', '{"asset_registries": ["skills"]}'],
  ])('warns and ignores a declaration that is %s', (_label, content) => {
    const { config, sourceDeclaration } = loadConfigWithOverrides(
      fsWith({ '/kb/pair.config.json': content }),
      { projectRoot: '/project', sourceRoot: '/kb' },
    )

    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toMatch(/pair\.config\.json/)
    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    // Nothing half-parsed leaked in: no index keys, no stray registries
    expect(config.asset_registries['0']).toBeUndefined()
  })

  it('drops a non-object registry entry instead of spreading it', () => {
    const { config } = load({
      '/kb/pair.config.json': JSON.stringify({ asset_registries: { skills: 'evil' } }),
    })

    expect(config.asset_registries['skills']!.prefix).toBe('pair')
    expect(config.asset_registries['skills']!.targets).toEqual(
      JSON.parse(REAL_CONFIG).asset_registries.skills.targets,
    )
  })
})

/**
 * US-396 — `projectRoot` is the directory being installed INTO. In the released CJS
 * layout it is NOT the CLI module dir, so the loader must read the consumer's config
 * where the consumer actually is (AC4), and must not mistake a project's own
 * `config.json` (a very common name) for a Pair config.
 */
describe('config loader - project layer when the module dir is not the project root', () => {
  const SOURCE_DECLARATION = JSON.stringify({
    asset_registries: { skills: { prefix: 'acme-kb' } },
  })

  it("reads the consumer's pair.config.json at a projectRoot far from the module dir", () => {
    const fs = new InMemoryFileSystemService(
      {
        '/opt/pair-cli/config.json': REAL_CONFIG,
        '/kb/pair.config.json': SOURCE_DECLARATION,
        '/consumer/pair.config.json': JSON.stringify({
          asset_registries: { skills: { prefix: 'house-rules' } },
        }),
      },
      '/opt/pair-cli',
      '/consumer',
    )

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/consumer',
      sourceRoot: '/kb',
      projectConfigOnly: true,
    })

    expect(config.asset_registries['skills']!.prefix).toBe('house-rules')
  })

  it("does not read an unrelated config.json sitting in the consumer's root", () => {
    const fs = new InMemoryFileSystemService(
      {
        '/opt/pair-cli/config.json': REAL_CONFIG,
        '/kb/pair.config.json': SOURCE_DECLARATION,
        // Someone else's config.json — a webpack/eslint/whatever file, not a Pair config
        '/consumer/config.json': JSON.stringify({
          asset_registries: { skills: { prefix: 'not-a-pair-config' } },
        }),
      },
      '/opt/pair-cli',
      '/consumer',
    )

    const { config } = loadConfigWithOverrides(fs, {
      projectRoot: '/consumer',
      sourceRoot: '/kb',
      projectConfigOnly: true,
    })

    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
  })
})

/**
 * US-396 review round 3 — a source KB's bad config may cost the source its declaration,
 * never the consumer their install. Every honoured field is type-checked on its own, and
 * a declaration that is well-formed field-by-field but incoherent with the layer beneath
 * is backed out whole, with a warning.
 *
 * Before this: `pair install --source ./kb` against a KB shipping
 * `{"asset_registries":{"knowledge":{"include":"*.md"}}}` (string, not array) threw
 * `Registry 'knowledge' include must be an array of strings` out of `setupInstallContext`,
 * printed it naming the CONSUMER's registry, exited 1 and installed nothing. `include` is
 * no longer declarable at all (round 2 escalation — it decides mirror-cleanup ownership,
 * a write decision), so its malformed-shape case below moved to
 * `never honours include — it decides mirror-cleanup ownership, a write decision` above;
 * `exclude` keeps the type-check coverage this table exists for.
 */
describe('config loader - a source declaration never aborts the consumer install', () => {
  function fsWith(files: Record<string, string>) {
    return new InMemoryFileSystemService(
      { '/module/config.json': REAL_CONFIG, ...files },
      '/module',
      '/project',
    )
  }

  function load(declaration: unknown) {
    return loadConfigWithOverrides(
      fsWith({ '/kb/pair.config.json': JSON.stringify(declaration) }),
      { projectRoot: '/project', sourceRoot: '/kb' },
    )
  }

  const base = JSON.parse(REAL_CONFIG).asset_registries

  it.each([
    ['exclude as an object', { exclude: { a: 1 } }, 'exclude'],
    ['flatten as a string', { flatten: 'true' }, 'flatten'],
    ['flattenDepth as a string', { flattenDepth: '2' }, 'flattenDepth'],
    ['flattenDepth as zero', { flattenDepth: 0 }, 'flattenDepth'],
    ['description as a number', { description: 42 }, 'description'],
  ])('drops %s and keeps the rest of the declaration', (_label, bad, field) => {
    const { config } = load({
      asset_registries: { knowledge: { ...(bad as object), prefix: 'acme' } },
    })

    const knowledge = config.asset_registries['knowledge']!
    expect((knowledge as unknown as Record<string, unknown>)[field]).toEqual(base.knowledge[field])
    // The field beside it survives: a bad field is dropped on its own
    expect(knowledge.prefix).toBe('acme')
  })

  it('validates the merged result and backs the whole declaration out when it breaks it', () => {
    // Field-by-field valid — `flattenDepth: 2` is a positive integer — but the base
    // registry has `flatten: false`, and `flattenDepth requires flatten: true`.
    const { config, sourceDeclaration } = load({
      asset_registries: { knowledge: { flattenDepth: 2, prefix: 'acme' } },
    })

    expect(validateConfig(config).valid).toBe(true)
    expect(config.asset_registries['knowledge']!.flattenDepth).toBeUndefined()
    expect(config.asset_registries['knowledge']!.prefix).toBe(base.knowledge.prefix)
    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toMatch(/invalid/i)
  })

  it('still reports the unknown registries of a declaration it backed out', () => {
    // A KB declares a registry this CLI has no definition for (`mcp`) BESIDE a coherent
    // typo that costs it the whole declaration. The back-out must not also erase the
    // record of what was declared: without `mcp` in `unknownRegistries` the install
    // prints no `skipped — declared by source, unknown to this CLI` line for it and does
    // not count it in the announced total, so the maintainer debugging why their new
    // registry never appears gets that line only when the REST of their declaration
    // happens to validate (US-396 review round 5).
    const { sourceDeclaration } = load({
      asset_registries: { mcp: { prefix: 'acme' }, knowledge: { flattenDepth: 2 } },
    })

    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toMatch(/invalid/i)
    expect(sourceDeclaration!.unknownRegistries).toEqual(['mcp'])
  })

  it("reports the consumer's own broken config rather than blaming the source", () => {
    const fs = fsWith({
      '/kb/pair.config.json': JSON.stringify({
        asset_registries: { skills: { prefix: 'acme-kb' } },
      }),
      '/project/pair.config.json': JSON.stringify({
        asset_registries: { knowledge: { flattenDepth: 'two' } },
      }),
    })

    const { config, sourceDeclaration } = loadConfigWithOverrides(fs, {
      projectRoot: '/project',
      sourceRoot: '/kb',
    })

    expect(validateConfig(config).valid).toBe(false)
    expect(sourceDeclaration!.warning).toBeUndefined()
    expect(config.asset_registries['skills']!.prefix).toBe('acme-kb')
  })
})

/**
 * US-396 review round 3 — `applied` means the declaration CHANGED the resolution. It is
 * what gates the `Configuration: …` chain line, the one place a KB maintainer confirms
 * their declaration was honoured, so a wholly-discarded declaration reporting itself as
 * applied misreports exactly the malicious/mistaken case.
 */
describe('config loader - applied means honoured, not merely parseable', () => {
  function load(declaration: unknown) {
    const fs = new InMemoryFileSystemService(
      {
        '/module/config.json': REAL_CONFIG,
        '/kb/pair.config.json': JSON.stringify(declaration),
      },
      '/module',
      '/project',
    )
    return loadConfigWithOverrides(fs, { projectRoot: '/project', sourceRoot: '/kb' })
  }

  it('is not applied when every declared field was dropped by the allowlist', () => {
    const { sourceDeclaration, source } = load({
      asset_registries: { skills: { targets: [{ path: '../../.zshenv', mode: 'canonical' }] } },
    })

    expect(sourceDeclaration!.applied).toBe(false)
    expect(source).not.toMatch(/source KB declaration/)
    expect(sourceDeclaration!.warning).toMatch(/no field this CLI honours/)
  })

  it('is applied when one honoured field survives, even beside dropped ones', () => {
    const { sourceDeclaration, source } = load({
      asset_registries: { skills: { prefix: 'acme-kb', behavior: 'mirror' } },
    })

    expect(sourceDeclaration!.applied).toBe(true)
    expect(source).toMatch(/source KB declaration: \/kb/)
    expect(sourceDeclaration!.warning).toBeUndefined()
  })

  it('does not warn about honoured fields when the only declared registry is unknown', () => {
    const { sourceDeclaration } = load({
      asset_registries: { 'acme-prompts': { prefix: 'acme' } },
    })

    expect(sourceDeclaration!.applied).toBe(false)
    expect(sourceDeclaration!.warning).toBeUndefined()
    expect(sourceDeclaration!.unknownRegistries).toEqual(['acme-prompts'])
  })
})
