import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { stripAllMarkers, applyTransformCommands } from '@pair/content-ops'
import {
  buildMirrorTransform,
  buildInstallTransform,
  mirrorEntries,
  installedEntries,
  orphanedMirrorEntries,
  assertNoOrphanedMirrorEntries,
  datasetPathOf,
  mirrorPathOf,
  isMarkdownPath,
  assertMirrorMatches,
  isFrozenUntransformed,
  GUARDED_MIRRORS,
  KB_MIRROR,
  GITHUB_AGENTS_MIRROR,
  AGENTS_MD_MIRROR,
  CLAUDE_MD_MIRROR,
  type GuardedMirror,
} from './mirror-guard'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DATASET_SKILLS = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')

const transform = buildMirrorTransform(DATASET_SKILLS)

/** Runs `fn`, expecting it to throw, and returns the thrown Error's message. */
const captureThrownMessage = (fn: () => void): string => {
  try {
    fn()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the assertion to throw, but it did not')
}

interface RegistryConfigJson {
  source: string
  behavior: string
  include?: string[]
  flatten?: boolean
  prefix?: string
  targets: { path: string; mode: string; transform?: unknown }[]
}

const REGISTRY_CONFIG = (
  JSON.parse(readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8')) as {
    asset_registries: Record<string, RegistryConfigJson>
  }
).asset_registries

/**
 * Resolves a guarded mirror's `asset_registries` entry, or FAILS BY NAME.
 *
 * Deliberately not `REGISTRY_CONFIG[key]!`: this runs at module scope (the
 * fixtures are built at collection), so a renamed or removed registry key —
 * precisely the change the pin tests below exist to attribute — would otherwise
 * kill collection with `Cannot read properties of undefined (reading 'include')`
 * before a single test runs, blaming nothing and never reaching the explanatory
 * assertions.
 */
const registryConfigFor = (key: string): RegistryConfigJson => {
  const config = REGISTRY_CONFIG[key]
  if (!config) {
    throw new Error(
      `registry '${key}' is not declared in apps/pair-cli/config.json — GUARDED_MIRRORS is out of sync ` +
        `(declared registries: ${Object.keys(REGISTRY_CONFIG).join(', ')})`,
    )
  }
  return config
}

/**
 * The registry's declared `include` narrowing, as posix path prefixes without
 * the leading '/'. `pair-cli update` copies only these subtrees, so enumerating
 * anything outside them would demand a mirror the pipeline never writes (the
 * `github` registry declares `include: ["/agents"]` and its dataset tree could
 * grow a sibling directory tomorrow).
 */
const includedPrefixes = (key: string): string[] | undefined =>
  registryConfigFor(key).include?.map(p => p.replace(/^\//, '').replace(/\/$/, ''))

/**
 * THE membership predicate — one definition, used both by the fixture (to
 * narrow what is enumerated) and by the pin test (to assert nothing outside the
 * declared subtrees is enumerated). Two near-identical predicates had drifted
 * apart once already: an entry whose path EQUALS a prefix would have been
 * enumerated by one and rejected by the other, failing the pin with a message
 * about un-included sibling directories.
 *
 * An `include` entry is always a directory prefix, so membership is
 * "under the prefix" — the prefix path itself is a directory and never an
 * enumerated file.
 */
const isIncluded = (key: string, rel: string): boolean => {
  const prefixes = includedPrefixes(key)
  if (!prefixes) return true
  return prefixes.some(prefix => rel.startsWith(`${prefix}/`))
}

/**
 * Everything the data-driven guard needs for ONE guarded mirror: its file
 * partition and, per entry, the dataset source plus the full install output
 * computed ONCE, here at module scope (i.e. at collection, which no
 * `testTimeout` bounds).
 *
 * `rewriteSkillReferences` is O(lines x skills) — every non-fenced line is
 * matched against one compiled pattern per installed skill — so a full pass
 * over the KB corpus is the expensive operation in this file. Every consumer
 * below (the equality `it.each`, the frozen-untransformed sweep, the
 * idempotence check) reads from this fixture instead of transforming again,
 * leaving exactly ONE corpus pass inside a test body (the re-transform in the
 * idempotence assertion, which is the thing under test there). Recomputing per
 * consumer put the two aggregate tests over vitest's default 5s per-test budget
 * on CI's slower runners.
 */
interface MirrorFixture {
  mirror: GuardedMirror
  /** `<registry key> -> <installed path>`, the suite's per-mirror title */
  label: string
  /** markdown entries, relative to the dataset root, `include`-narrowed */
  markdown: string[]
  /** non-markdown entries, relative to the dataset root, `include`-narrowed */
  nonMarkdown: string[]
  /** the whole `include`-narrowed entry list — exactly `markdown` + `nonMarkdown` */
  all: string[]
  /**
   * what the INSTALLED tree contributes, in the same entry vocabulary and
   * narrowed by the SAME `include` predicate — the other side of the set
   * equality. Narrowing both sides with one predicate is load-bearing: the
   * `github` target really does hold un-included siblings (`.github/workflows`,
   * `.github/skills`) that `pair-cli update` never writes from this registry.
   */
  installedAll: string[]
  source: (rel: string) => string
  /** installed content, or `undefined` when the mirror file is genuinely absent */
  installed: (rel: string) => string | undefined
  /** precomputed `{ source, expected }` for any entry of this mirror */
  expectedFor: (rel: string) => { source: string; expected: string }
}

const buildFixture = (mirror: GuardedMirror): MirrorFixture => {
  const all = mirrorEntries(mirror, REPO_ROOT).filter(rel => isIncluded(mirror.key, rel))
  const source = (rel: string): string =>
    readFileSync(join(REPO_ROOT, datasetPathOf(mirror, rel)), 'utf-8')
  // the FULL per-target install: naming transform + marker strip + skill refs,
  // each applied only where `pair-cli update` applies it (see buildInstallTransform)
  const install = buildInstallTransform(mirror, transform)

  const expected = new Map(
    all.map(rel => {
      const src = source(rel)
      return [rel, { source: src, expected: install(rel, src) }] as const
    }),
  )

  return {
    mirror,
    label: `${mirror.key} -> ${mirror.mirrorRel}`,
    markdown: all.filter(isMarkdownPath),
    nonMarkdown: all.filter(rel => !isMarkdownPath(rel)),
    all,
    installedAll: installedEntries(mirror, REPO_ROOT).filter(rel => isIncluded(mirror.key, rel)),
    source,
    installed: rel => {
      const p = join(REPO_ROOT, mirrorPathOf(mirror, rel))
      return existsSync(p) ? readFileSync(p, 'utf-8') : undefined
    },
    expectedFor: rel => {
      const hit = expected.get(rel)
      if (!hit) throw new Error(`no precomputed install output for '${rel}' — not a dataset entry`)
      return hit
    },
  }
}

const FIXTURES: MirrorFixture[] = GUARDED_MIRRORS.map(buildFixture)
const fixtureFor = (m: GuardedMirror): MirrorFixture => {
  const hit = FIXTURES.find(f => f.mirror === m)
  if (!hit) throw new Error(`no fixture for '${m.key} -> ${m.mirrorRel}'`)
  return hit
}
const kb = fixtureFor(KB_MIRROR)
const githubAgents = fixtureFor(GITHUB_AGENTS_MIRROR)

/**
 * Generous explicit budget for the whole-corpus assertions. The default 5s is
 * a per-test timeout tuned for unit tests, not for a sweep over a 5 MB corpus on
 * a shared CI runner (~10x slower than a dev machine on this suite); an explicit
 * value keeps a slow runner from turning a green invariant red.
 */
const CORPUS_TEST_TIMEOUT_MS = 30_000

/**
 * Data-driven mirror-equality guard for EVERY guarded (dataset → installed)
 * pair (#393 AC1/AC5): for every file the dataset contributes, the installed
 * copy must equal the REAL `pair-cli update` install of its dataset source — not
 * the source itself.
 *
 * Four mirrors share this suite because they share the relationship: an install
 * that REWRITES what it copies. `knowledge` and `github` are `behavior:
 * "mirror"` directories with no flatten/prefix, so
 * `applySkillRefsToNonSkillRegistries` runs the identical skill-ref +
 * link-path rewrite over both; `agents` contributes its two TARGETS —
 * `AGENTS.md` and `CLAUDE.md`, both generated from `dataset/AGENTS.md` — whose
 * installs add marker stripping and, for `CLAUDE.md`, the `claude` naming
 * transform. `buildInstallTransform` is what makes them one suite: only the
 * per-target op set differs, so each mirror costs a list entry rather than a
 * second guard that would drift from this one.
 *
 * Markdown and non-markdown are both covered, because the `knowledge` registry
 * ships both: the content rewrites only walk markdown, so for the non-markdown
 * files (the `assets/*.sh` gate scripts and `gitleaks-example.toml`) the
 * transform is the identity by construction and `expected` IS the source. Same
 * helper, same failure format — a hand-edited `assets/pr-state.sh` mirror now
 * fails here instead of shipping unnoticed.
 *
 * The case list is derived from the dataset at collection time, so a new file is
 * covered with no test edit and no count is encoded anywhere.
 */
describe.each(FIXTURES)(
  'dataset -> installed mirror equality for every file of $label (data-driven) (#393)',
  fixture => {
    const { mirror, markdown, nonMarkdown, all, installedAll, source, installed, expectedFor } =
      fixture

    it('discovers dataset files directly from disk (no hardcoded count)', () => {
      expect(markdown.length).toBeGreaterThan(0)
      // the two partitions are exactly the tree, nothing dropped between them
      expect([...markdown, ...nonMarkdown].sort()).toEqual(all)
    })

    it.each(markdown)('mirror for %s equals the real install of its dataset source', rel => {
      assertMirrorMatches(mirror, rel, expectedFor(rel).expected, installed(rel))
    })

    it.each(nonMarkdown)(
      'mirror for non-markdown %s is byte-equal to its dataset source (transform is identity)',
      rel => {
        // stated as the SOURCE, not as `expectedFor(rel)`, because that is the
        // claim: the install-time rewrites walk '.md' only. The first line pins
        // that the modeled install agrees, so the two can never say different
        // things about the same file.
        expect(expectedFor(rel).expected).toBe(source(rel))
        assertMirrorMatches(mirror, rel, source(rel), installed(rel))
      },
    )

    /**
     * AC5 — the anomaly CLASS is closed, not just its one instance.
     *
     * `code-review-template.md` was the only KB file left byte-identical to its
     * dataset source while the transform would have rewritten it (i.e. while it
     * carried un-prefixed skill names). This asserts the set of such files is
     * EMPTY, so the next hand-port — or the next byte-equality guard pinning a
     * mirror to its raw source — fails here with the whole offending list rather
     * than being discovered years later by a reader typing a command that does
     * not exist.
     */
    it(
      'lists no mirror that is byte-identical to a source the transform would change (AC5)',
      () => {
        const frozen = markdown.filter(rel => {
          // source + install output both come from the module-scope fixture:
          // this sweep does no transforming of its own, only mirror reads.
          const { source: src, expected } = expectedFor(rel)
          return isFrozenUntransformed(src, installed(rel), expected)
        })
        expect(frozen).toEqual([])
      },
      CORPUS_TEST_TIMEOUT_MS,
    )

    /**
     * The REVERSE direction (#393 review round 10) — without it the two sweeps
     * above are blind to a whole drift class, because they enumerate DATASET
     * files: a file that exists only under the installed target is asserted by
     * nothing at all.
     *
     * That class is not hypothetical, it is the one THIS story removed by hand:
     * `how-to/04-how-to-define-subdomains.md` and
     * `05-how-to-define-bounded-contexts.md` were dropped from the dataset in
     * #246 and were still installed at the repo root ~5 months later, indexed
     * into `.pair/llms.txt` where agents read them. A hand-edit, a bad merge or
     * a `pair-cli update` run from an older dataset reopens it, and every other
     * assertion in this file stays green while it does.
     *
     * Adding it makes the guard a set EQUALITY over entry paths, and it is
     * DETECTION only — it reads two path lists, deletes nothing, and is
     * therefore independent of the open product decision about wiring
     * destructive cleanup onto `pair-cli update` (mirror-guard ADL, OPEN RESIDUAL).
     * Green on both directory mirrors when introduced: the dataset and installed
     * path sets were already identical for `.pair/knowledge` and
     * `.github/agents`, so this lands as a regression guard, not a red test.
     *
     * Single-FILE mirrors (`AGENTS.md`, `CLAUDE.md`) run it too and are
     * trivially exempt — a target that IS the file has no room for an orphan —
     * so the case list stays derived from `GUARDED_MIRRORS` with no special
     * casing to keep in sync.
     */
    it('ships no installed file with no dataset source (reverse sweep)', () => {
      assertNoOrphanedMirrorEntries(mirror, installedAll, all)
    })

    /**
     * Edge case from the story: the regeneration runs many times over this
     * corpus's lifetime, so the transform must be a fixed point on its own
     * output — an already-prefixed `/pair-capability-assess-cost` must never
     * become `/pair-capability-pair-capability-assess-cost`.
     */
    it(
      're-transforming the installed output of every file is a no-op (idempotence)',
      () => {
        // ONE test over the whole corpus, not one `it` per file: idempotence is a
        // property of the transform, not of any individual file, so 441 `it`
        // blocks bought nothing but collection cost.
        //
        // But the transform still runs PER FILE and never over a concatenation:
        // `rewriteSkillReferences` carries fence state to the end of the string it
        // is given, so joining the corpus lets a file that ends inside an open
        // fence exempt the head of the next one — the assertion would then hold
        // vacuously over a silently shrinking region (pinned by the fence-leak
        // case below). Filtering instead of comparing two arrays keeps the failure
        // naming the offending FILES rather than an array index.
        const notFixedPoints = markdown.filter(rel => {
          const output = expectedFor(rel).expected
          return transform(output) !== output
        })
        expect(notFixedPoints).toEqual([])
      },
      CORPUS_TEST_TIMEOUT_MS,
    )
  },
)

describe('the guarded mirrors are the ones this comparison is valid for (#393)', () => {
  it('covers every rewritten install target, and the exclusions are the asserted ones', () => {
    expect(GUARDED_MIRRORS.map(m => `${m.key}:${m.mirrorRel}`)).toEqual([
      'knowledge:.pair/knowledge',
      'github:.github',
      'agents:AGENTS.md',
      'agents:CLAUDE.md',
    ])
    // The excluded registries, and WHY each is excluded — asserted, not argued
    // in prose. `adoption` is seeded-then-owned (divergence is the point);
    // `skills` flattens, which makes the pipeline skip the skill-ref rewrite
    // for it (that pair is guarded by `skill-md-mirror`); `workflows` and
    // `agent-definitions` (US-219) copy VERBATIM — no transform, no rewrite —
    // so a transform-equality guard would assert nothing that byte-equality
    // doesn't already cover more strictly; that pair is guarded by
    // `workflow-mirror.test.ts`.
    expect(REGISTRY_CONFIG.adoption!.behavior).toBe('add')
    expect(REGISTRY_CONFIG.skills!.flatten).toBe(true)
    expect(REGISTRY_CONFIG.workflows!.behavior).toBe('overwrite')
    expect(REGISTRY_CONFIG['agent-definitions']!.behavior).toBe('overwrite')
    // ...and every OTHER declared registry is guarded, so a new rewritten
    // registry cannot be added to config.json and silently stay unguarded.
    const guardedKeys = new Set(GUARDED_MIRRORS.map(m => m.key))
    expect(
      Object.keys(REGISTRY_CONFIG)
        .filter(k => !guardedKeys.has(k))
        .sort(),
    ).toEqual(['adoption', 'agent-definitions', 'skills', 'workflows'])
  })

  it('guards the three .github agent files the github registry ships', () => {
    expect(githubAgents.markdown).toEqual([
      'agents/product-engineer.agent.md',
      'agents/product-manager.agent.md',
      'agents/staff-engineer.agent.md',
    ])
    // ...and the KB half still enumerates the file this story started from
    expect(kb.markdown).toContain('guidelines/collaboration/templates/code-review-template.md')
    expect(kb.markdown).toContain('skills-guide.md')
    expect(kb.nonMarkdown).toContain('assets/pr-state.sh')
  })

  /**
   * The two root files, and the two ops that separate their installed bytes
   * from `skillRefs(dataset)`. These are asserted HERE rather than trusted from
   * the on-disk comparison, because on-disk equality alone cannot tell a
   * correctly modeled install apart from a mirror that happens to match: the
   * real blocker for `AGENTS.md` was never the `claude` naming transform (that
   * target declares none) but the marker strip a single-FILE registry gets from
   * `postCopyOps` -> `stripMarkersFromTarget`.
   */
  describe('the two root files generated from dataset/AGENTS.md', () => {
    const datasetAgents = readFileSync(
      join(REPO_ROOT, AGENTS_MD_MIRROR.datasetRel),
      'utf-8',
    ) as string

    it('are one source installed at two targets, under different ops', () => {
      expect(AGENTS_MD_MIRROR.datasetRel).toBe(CLAUDE_MD_MIRROR.datasetRel)
      expect(AGENTS_MD_MIRROR.namingPrefix).toBeUndefined()
      expect(CLAUDE_MD_MIRROR.namingPrefix).toBe('claude')
      expect(AGENTS_MD_MIRROR.sourceKind).toBe('file')
      expect(CLAUDE_MD_MIRROR.sourceKind).toBe('file')
      // one entry each — the entry key of a single-file mirror is its basename
      expect(fixtureFor(AGENTS_MD_MIRROR).all).toEqual(['AGENTS.md'])
      expect(fixtureFor(CLAUDE_MD_MIRROR).all).toEqual(['AGENTS.md'])
    })

    it('carries the markers whose stripping is the real reason a naive guard fails', () => {
      // if this ever stops holding, the marker op below is no longer load-bearing
      // and the exclusion story in mirror-guard.ts must be re-derived, not copied
      expect(datasetAgents).toMatch(/<!--\s*@claude-/)
      expect(stripAllMarkers(datasetAgents)).not.toBe(datasetAgents)
    })

    it('installs AGENTS.md as skillRefs(stripAllMarkers(source)) — NOT skillRefs(source)', () => {
      const install = buildInstallTransform(AGENTS_MD_MIRROR, transform)
      expect(install('AGENTS.md', datasetAgents)).toBe(transform(stripAllMarkers(datasetAgents)))
      // the naive composition the guard would have used without the marker op
      expect(install('AGENTS.md', datasetAgents)).not.toBe(transform(datasetAgents))
    })

    it('installs CLAUDE.md through the naming transform FIRST, then the marker strip', () => {
      const install = buildInstallTransform(CLAUDE_MD_MIRROR, transform)
      expect(install('AGENTS.md', datasetAgents)).toBe(
        transform(stripAllMarkers(applyTransformCommands(datasetAgents, 'claude'))),
      )
      // the two targets genuinely differ, so one mirror cannot stand in for both
      expect(install('AGENTS.md', datasetAgents)).not.toBe(
        buildInstallTransform(AGENTS_MD_MIRROR, transform)('AGENTS.md', datasetAgents),
      )
    })
  })
})

/**
 * `buildInstallTransform` is the COMPLETE `pair-cli update` install for these
 * mirrors only under the config each one is modeled against. Pin that, as the
 * sibling `skill-md-mirror` pins `SKILL_COPY_OPTS`: if a registry later gains
 * `flatten`/`prefix`, the real pipeline both renames paths AND stops rewriting
 * skill references entirely (`applySkillRefsToNonSkillRegistries` skips any
 * registry with flatten/prefix), so the modeled install would no longer equal
 * `pair-cli update`'s output and the guard above would go permanently red with no
 * satisfiable mirror — the deadlock this story removed, reintroduced one level
 * up. Failing HERE attributes it to the registry change instead of blaming the
 * mirror.
 */
describe.each(FIXTURES)(
  'the $label guard stays pinned to its pair-cli registry declaration (#393)',
  ({ mirror, all }) => {
    const config = registryConfigFor(mirror.key)
    const target = config.targets.find(t => t.path === mirror.mirrorRel)

    it('declares no flatten/prefix, so the skill-ref + link-path pair IS the content rewrite', () => {
      expect(config.flatten).toBeUndefined()
      expect(config.prefix).toBeUndefined()
    })

    it('declares exactly the per-target naming transform the guard models', () => {
      // the ONLY per-target content op the model knows about is
      // `transform.prefix`; anything else appearing here means the installed
      // bytes are produced by an op `buildInstallTransform` does not run.
      expect(target?.transform).toEqual(
        mirror.namingPrefix === undefined ? undefined : { prefix: mirror.namingPrefix },
      )
    })

    it('has the source KIND the marker-strip op is switched on', () => {
      // `postCopyOps` runs `stripMarkersFromTarget` only when the installed
      // target is NOT a directory, so this flag decides an op, not a path shape.
      const datasetPath = join(REPO_ROOT, mirror.datasetRel)
      expect(statSync(datasetPath).isDirectory()).toBe(mirror.sourceKind === 'directory')
    })

    it('reads the dataset from, and asserts against, the registry-declared source and target', () => {
      expect(mirror.datasetRel.endsWith(config.source)).toBe(true)
      expect(config.targets.map(t => t.path)).toContain(mirror.mirrorRel)
      // 'mirror' behavior: the installed copy is meant to be the dataset's image,
      // which is what makes whole-tree equality the right assertion here.
      expect(config.behavior).toBe('mirror')
    })

    it('enumerates only what the registry declares it copies (`include` honored)', () => {
      const prefixes = includedPrefixes(mirror.key)
      if (!prefixes) {
        expect(config.include).toBeUndefined()
        return
      }
      // every enumerated path sits under a declared include prefix — an
      // un-included sibling directory added to the dataset must NOT be demanded
      // of the mirror, since `pair-cli update` never copies it. Uses THE membership
      // predicate the fixture narrowed with, so the two cannot disagree about
      // an edge case and blame it on a sibling directory.
      for (const rel of all) expect(isIncluded(mirror.key, rel)).toBe(true)
    })
  },
)

/**
 * Drift-injection coverage for the assertion helper: the real on-disk guard
 * above only ever exercises its happy path, so the failure paths — and above
 * all the WORDING of the failure (AC3) — are driven here.
 */
describe('assertMirrorMatches — failure paths and message (#393)', () => {
  const REL = 'guidelines/collaboration/templates/code-review-template.md'
  const expected = 'line one\nline two\nline three\n'
  const assertKb = (rel: string, exp: string, actual: string | undefined): void =>
    assertMirrorMatches(KB_MIRROR, rel, exp, actual)

  it('passes when the mirror equals the transform output', () => {
    // called directly, not wrapped in `expect().not.toThrow()`: vitest then reports
    // the guard's own message as the failure headline instead of truncating it
    // inside "expected [Function] to not throw an error but '...' was thrown".
    assertKb(REL, expected, expected)
  })

  it('throws when the mirror has drifted', () => {
    expect(() => assertKb(REL, expected, 'line one\nDRIFT\nline three\n')).toThrow(/drifted/)
  })

  it('states WHAT it compares — mirror vs. transform(dataset), not vs. the raw source (AC3)', () => {
    const message = captureThrownMessage(() => assertKb(REL, expected, 'drifted\n'))
    expect(message).toContain('COMPARED')
    expect(message).toContain('TRANSFORM(dataset source)')
    expect(message).toContain('NOT vs. the raw dataset source')
    // The refuted assumption is spelled out, so the "identical mirror"
    // invariant cannot be re-derived from this message.
    expect(message).toContain('byte-identical to its dataset source is itself the drift')
  })

  it('names both the mirror path and the dataset path, and the regenerate remedy', () => {
    const message = captureThrownMessage(() => assertKb(REL, expected, 'drifted\n'))
    expect(message).toContain(join(KB_MIRROR.mirrorRel, REL))
    expect(message).toContain(join(KB_MIRROR.datasetRel, REL))
    expect(message).toContain("Regenerate with 'pair-cli update'")
    expect(message).toContain('never hand-edit the mirror')
  })

  it('names the paths of the registry it was given, not the KB by default', () => {
    const rel = 'agents/product-manager.agent.md'
    const message = captureThrownMessage(() =>
      assertMirrorMatches(GITHUB_AGENTS_MIRROR, rel, expected, 'drifted\n'),
    )
    expect(message).toContain(join('.github', rel))
    expect(message).toContain(join('packages/knowledge-hub/dataset/.github', rel))
    expect(message).not.toContain('.pair/knowledge')
  })

  it('carries a compact expected-vs-actual diff of the drifted lines', () => {
    const message = captureThrownMessage(() =>
      assertKb(REL, expected, 'line one\nDRIFT\nline three\n'),
    )
    expect(message).toContain('-line two')
    expect(message).toContain('+DRIFT')
  })

  it('states the OTHER comparison for a non-markdown file — byte-equality IS the invariant', () => {
    const message = captureThrownMessage(() =>
      assertKb('assets/pr-state.sh', expected, 'drifted\n'),
    )
    expect(message).toContain('COMPARED')
    expect(message).toContain('byte for byte')
    expect(message).toContain('NOT markdown')
    expect(message).toContain('byte-equality IS the invariant')
    // and must NOT teach the markdown rule here, where it is false
    expect(message).not.toContain('is itself the drift')
  })

  it('names the EXTRA install ops of a single-file target, in pipeline order', () => {
    // the two directory mirrors above exercise none of these, so the sentence
    // that lets a CLAUDE.md reader reproduce `expected` by hand was asserted by
    // nothing — and it is the half of the message that differs per target
    const message = captureThrownMessage(() =>
      assertMirrorMatches(CLAUDE_MD_MIRROR, 'AGENTS.md', expected, 'drifted\n'),
    )
    expect(message).toContain("the 'claude' naming transform")
    expect(message).toContain('marker stripping')
    expect(message.indexOf('naming transform')).toBeLessThan(message.indexOf('marker stripping'))
  })

  it('names only the marker strip for the single-file target with no naming transform', () => {
    const message = captureThrownMessage(() =>
      assertMirrorMatches(AGENTS_MD_MIRROR, 'AGENTS.md', expected, 'drifted\n'),
    )
    expect(message).toContain('marker stripping')
    expect(message).not.toContain('naming transform')
  })

  it('reports a missing mirror as missing, with the regenerate hint (not as drift)', () => {
    expect(() => assertKb(REL, expected, undefined)).toThrow(
      /Mirror missing.*does not exist.*pair-cli update/s,
    )
  })
})

/**
 * Drift-injection coverage for the REVERSE sweep, for the same reason the
 * forward assertion has it: on disk the sweep only ever runs its happy path, so
 * the failure — and above all its remedy sentence — is driven here.
 */
describe('assertNoOrphanedMirrorEntries — the reverse sweep (#393)', () => {
  const dataset = ['how-to/01-a.md', 'how-to/02-b.md', 'assets/pr-state.sh']

  it('reports nothing when the installed tree is exactly the dataset (order-independent)', () => {
    // called directly rather than through `expect().not.toThrow()`, so a failure
    // reports the guard's own message as the headline
    assertNoOrphanedMirrorEntries(KB_MIRROR, [...dataset].reverse(), dataset)
  })

  it('reports nothing when the installed tree is a SUBSET — that is the forward guard job', () => {
    // a dataset file missing from the mirror is the missing-mirror failure of
    // `assertMirrorMatches`; reporting it here too would blame one defect twice
    // in two vocabularies
    assertNoOrphanedMirrorEntries(KB_MIRROR, ['how-to/01-a.md'], dataset)
  })

  it('lists an installed-only file — the class this story removed by hand', () => {
    const orphan = 'how-to/04-how-to-define-subdomains.md'
    const message = captureThrownMessage(() =>
      assertNoOrphanedMirrorEntries(KB_MIRROR, [...dataset, orphan], dataset),
    )
    expect(message).toContain(join(KB_MIRROR.mirrorRel, orphan))
    // the dataset-sourced files are NOT in the report
    expect(message).not.toContain('how-to/01-a.md')
  })

  it('names both remedies — delete it, or add it to the dataset — and the regenerate step', () => {
    const message = captureThrownMessage(() =>
      assertNoOrphanedMirrorEntries(KB_MIRROR, [...dataset, 'ZZ-orphan.md'], dataset),
    )
    expect(message).toContain('DELETE it')
    expect(message).toContain(`ADD it to the dataset under ${KB_MIRROR.datasetRel}`)
    expect(message).toContain("'pair-cli update'")
    // states what it compared, like its forward sibling, so the reader cannot
    // mistake it for the transform assertion
    expect(message).toContain('COMPARED')
    expect(message).toContain('reverse')
  })

  it('reports the WHOLE offending set, not the first one', () => {
    const orphans = ['ZZ-a.md', 'nested/deep/ZZ-b.md']
    const message = captureThrownMessage(() =>
      assertNoOrphanedMirrorEntries(KB_MIRROR, [...dataset, ...orphans], dataset),
    )
    for (const rel of orphans) expect(message).toContain(join(KB_MIRROR.mirrorRel, rel))
    expect(message).toContain('2 file(s)')
  })

  it('names the paths of the registry it was given, not the KB by default', () => {
    const message = captureThrownMessage(() =>
      assertNoOrphanedMirrorEntries(GITHUB_AGENTS_MIRROR, ['agents/ZZ.agent.md'], []),
    )
    expect(message).toContain(join('.github', 'agents/ZZ.agent.md'))
    expect(message).not.toContain('.pair/knowledge')
    // ...and does not claim THIS target is indexed into .pair/llms.txt, which is
    // true of the KB tree only
    expect(message).not.toContain('.pair/llms.txt')
  })

  it('tells the KB reader the extra consequence: an orphan there is indexed for agents', () => {
    const message = captureThrownMessage(() =>
      assertNoOrphanedMirrorEntries(KB_MIRROR, ['ZZ-orphan.md'], []),
    )
    expect(message).toContain('.pair/llms.txt')
  })

  it('sorts the orphan list, so the report is stable across filesystem walk order', () => {
    expect(orphanedMirrorEntries(['b.md', 'a.md', 'how-to/01-a.md'], dataset)).toEqual([
      'a.md',
      'b.md',
    ])
  })
})

describe('installedEntries — the target side of the set equality (#393)', () => {
  it('keys the installed KB tree exactly like the dataset side', () => {
    // same vocabulary on both sides is what makes the two lists subtract; if the
    // walk ever diverged (separators, recursion, sorting) every file would read
    // as an orphan
    const installed = installedEntries(KB_MIRROR, REPO_ROOT)
    expect(installed).toContain('guidelines/collaboration/templates/code-review-template.md')
    expect(installed).toContain('assets/pr-state.sh')
    expect(installed).toEqual([...installed].sort())
  })

  it('walks the whole target, INCLUDING what the registry does not copy', () => {
    // the narrowing is the caller's (`isIncluded`), not the walk's — and it is
    // load-bearing here: `.github` really does hold subtrees this registry never
    // writes, so a sweep without the narrowing would report them as orphans
    const installed = installedEntries(GITHUB_AGENTS_MIRROR, REPO_ROOT)
    expect(installed.some(rel => !isIncluded(GITHUB_AGENTS_MIRROR.key, rel))).toBe(true)
    expect(installed.filter(rel => isIncluded(GITHUB_AGENTS_MIRROR.key, rel))).toEqual(
      githubAgents.installedAll,
    )
  })

  it('gives a single-FILE mirror its one entry, keyed by the dataset basename', () => {
    expect(installedEntries(CLAUDE_MD_MIRROR, REPO_ROOT)).toEqual(['AGENTS.md'])
    expect(installedEntries(AGENTS_MD_MIRROR, REPO_ROOT)).toEqual(['AGENTS.md'])
  })

  it('yields nothing for a target that does not exist (that is the forward failure)', () => {
    const missing: GuardedMirror = { ...KB_MIRROR, mirrorRel: '.pair/knowledge-does-not-exist' }
    expect(installedEntries(missing, REPO_ROOT)).toEqual([])
    const missingFile: GuardedMirror = { ...CLAUDE_MD_MIRROR, mirrorRel: 'NO-SUCH-FILE.md' }
    expect(installedEntries(missingFile, REPO_ROOT)).toEqual([])
  })
})

/**
 * WHY the guards above map over files instead of transforming a concatenation:
 * fence state is carried to the end of whatever string the transform is handed.
 * A corpus-wide `transform(join(files))` therefore turns any file that ends
 * inside an open fence into a silent, unbounded exemption for the files after
 * it — an assertion that still passes while covering less and less. This pins
 * the mechanism so the join form cannot come back as an "equivalent"
 * simplification.
 */
describe('the transform carries fence state to end-of-string (#393)', () => {
  const endsInsideAnOpenFence = '```text\nan opened block, never closed\n'
  const rewritable = 'Compose `/assess-cost` in the flow.\n'

  it('rewrites a skill reference when the file is transformed on its own', () => {
    expect(transform(rewritable)).not.toBe(rewritable)
  })

  it('leaves that same reference alone once appended to a file with an open fence', () => {
    const joined = endsInsideAnOpenFence + rewritable
    expect(transform(joined)).toBe(joined)
  })
})

describe('isFrozenUntransformed (#393)', () => {
  const source = 'Compose `/assess-cost` here.\n'
  const transformed = 'Compose `/pair-capability-assess-cost` here.\n'

  it('flags a mirror byte-identical to a source the transform would have changed', () => {
    expect(isFrozenUntransformed(source, source, transformed)).toBe(true)
  })

  it('does not flag a correctly transformed mirror', () => {
    expect(isFrozenUntransformed(source, transformed, transformed)).toBe(false)
  })

  it('does not flag a file the transform legitimately leaves untouched', () => {
    const plain = '# No skill references\n'
    expect(isFrozenUntransformed(plain, plain, plain)).toBe(false)
  })

  it('does not flag a missing mirror (that is the missing-file failure, not this class)', () => {
    expect(isFrozenUntransformed(source, undefined, transformed)).toBe(false)
  })
})
