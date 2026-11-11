import { describe, it, expect, vi } from 'vitest'
import { resolve } from 'node:path'
import { findSkillCountMismatches, findPluginSkillCountMismatches, countDeclaredPluginSkills, findGuideCountMismatches, findDeadLinks, findEmDashes, findDeadRepoCitations, githubHeadingSlugs, checkCatalogSync, checkCommandAnchors, checkDocsCommands, countHowToGuides, buildValidRoutes, readSkillDescription, checkCatalogContent, generateCatalogRows, checkBatchEnginePaths, checkBatchEngineAgents, checkBatchEngineWorkflows, batchEngineErrors, checkListTargetsSamples, PLANNED_MARKER_RE, findStalePlannedMarkers, plannedMarkerErrors, queryIssueState, findDeadAnchors, buildDocSlugs, parseIntentRequests, checkViaLines } from './docs-staleness-check'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// White-box unit tests for the docs-staleness gate LOGIC. Exported functions are
// tested directly — no spawning of any CLI/script. The thin `tsx` CLI wrapper is
// out of scope here (its logic is these functions); parity with the real docs
// tree is asserted in-process via runAllChecks() below.

const REPO_ROOT = resolve(__dirname, '../../..')

describe('githubHeadingSlugs memo (#543 AC12)', () => {
  it('returns an independent set per call, so a caller mutation never poisons the cache', () => {
    const md = '# Memo probe heading\n'
    const first = githubHeadingSlugs(md)
    first.add('poison')
    expect(githubHeadingSlugs(md)).toEqual(new Set(['memo-probe-heading']))
  })
})

describe('findSkillCountMismatches', () => {
  it('flags a wrong bare "N skills"', () => {
    expect(findSkillCountMismatches('has 5 skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('flags a wrong "N composable skills" (adjective between number and skills)', () => {
    const errs = findSkillCountMismatches('7 composable skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 composable skills')
  })

  it('flags a wrong "N agent skills"', () => {
    const errs = findSkillCountMismatches('exposes 7 agent skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 agent skills')
  })

  // The two phrasings the marketplace docs introduced, both of which drifted
  // silently (docs said 40 while the dataset held 41) because neither matched.
  it('flags a wrong "N declared pair skills"', () => {
    const errs = findSkillCountMismatches('exactly the 40 declared pair skills', 'a.mdx', 41)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('40 declared pair skills')
  })
})

describe('findPluginSkillCountMismatches', () => {
  it('flags a `Skills (N)` transcript that disagrees with the manifest', () => {
    const errs = findPluginSkillCountMismatches('reports `Skills (40)`, `Agents (0)`', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Skills (40)')
    expect(errs[0]).toContain('Plugin skill count')
  })
})

describe('countDeclaredPluginSkills', () => {
  it('reads the real manifest at the plugin root', () => {
    const manifest = join(
      REPO_ROOT,
      'packages/knowledge-hub/dataset/plugin/.claude-plugin/plugin.json',
    )
    expect(countDeclaredPluginSkills(manifest)).toBeGreaterThan(0)
  })

  it('returns null for a missing manifest, so the probe check is skipped not zeroed', () => {
    expect(countDeclaredPluginSkills(join(REPO_ROOT, 'nope/plugin.json'))).toBeNull()
  })
})

describe('findGuideCountMismatches', () => {

  it('flags wrong counts in adjective phrasings ("N sequential/step-by-step guides")', () => {
    const errs = findGuideCountMismatches(
      '11 sequential guides and 11 step-by-step guides',
      'a.mdx',
      9,
    )
    expect(errs).toHaveLength(2)
    expect(errs[0]).toContain('11 sequential guides')
    expect(errs[1]).toContain('11 step-by-step guides')
  })

  it('flags "N step-by-step process guides" and "N process guides"', () => {
    expect(findGuideCountMismatches('11 step-by-step process guides', 'a.mdx', 9)).toHaveLength(1)
    expect(findGuideCountMismatches('11 process guides', 'a.mdx', 9)).toHaveLength(1)
  })
})

describe('countHowToGuides', () => {
  it('returns null when the how-to dir is missing (drives the loud gate failure)', () => {
    expect(countHowToGuides(resolve(REPO_ROOT, 'does/not/exist'))).toBeNull()
  })
})

describe('findDeadLinks', () => {
  const routes = new Set(['/docs', '/docs/reference/skills-catalog', '/docs/tutorials'])

  it('flags a dead JSX href="/docs/..." card link', () => {
    const errs = findDeadLinks('<Card href="/docs/does-not-exist">x</Card>', 'a.mdx', routes)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('/docs/does-not-exist')
  })
})

describe('findDeadRepoCitations', () => {
  // The tracked set stands in for `git ls-files`: exact paths, exact case — the case-insensitive
  // macOS filesystem would otherwise pass a `readme.md` citation that github.com serves as 404.
  const tracked = new Set([
    'README.md',
    'docs/contributing/index.mdx',
    'packages/content-ops/src/index.ts',
    'apps/website/app/(landing)/constants.ts',
  ])
  const DEAD = 'https://github.com/foomakers/pair/blob/main/does/not/exist.md'

  // Every `hrefs` below is what the site's own MDX compiler (@mdx-js/mdx + remark-gfm, the same
  // pair fumadocs runs) emits as a link for that source — the oracle is the renderer, not a regex.
  const ROWS: ReadonlyArray<{ why: string; content: string; dead: number }> = [{ why: 'a bare GFM autolink to a missing repo file', content: `See ${DEAD} here.\n`, dead: 1 },
{
      // ADL decision 4: a page the compiler rejects is next build's finding, not this gate's —
      // the gate returns nothing rather than a misleading citation error.
      why: 'a page the compiler rejects — next build reports it, not this gate',
      content: `See [x](${DEAD}).\n\n<Broken attr={ unclosed\n`,
      dead: 0,
    },
{
      // A literal `%` is not a valid escape. The gate must REPORT the citation, never throw a
      // URIError out of the whole run — that would also discard every other check's findings.
      why: 'a path with a malformed percent-escape, reported instead of crashing the gate',
      content: `See [x](https://github.com/foomakers/pair/blob/main/scripts/100%coverage.sh).\n`,
      dead: 1,
    },]
  for (const { why, content, dead } of ROWS) {
    it(`${dead === 0 ? 'ignores' : 'flags'} ${why}`, () => {
      expect(
        findDeadRepoCitations(content, 'a.mdx', tracked, () => undefined),
        why,
      ).toHaveLength(dead)
    })
  }
  it('names the file, the cited path and the reason in the error', () => {
    const [err] = findDeadRepoCitations(
      `See [x](${DEAD}).\n`,
      'pm-tools/index.mdx',
      tracked,
      () => undefined,
    )
    expect(err).toContain('pm-tools/index.mdx')
    expect(err).toContain('does/not/exist.md')
    expect(err).toMatch(/not a git-tracked file/)
  })
})

describe('findDeadRepoCitations — #fragment anchors (Check 5c)', () => {
  // github.com's own rules, measured on the rendered pages (ADL
  // 2026-09-08-repo-citation-anchors-are-githubs-own-slugs): a rendered Markdown heading (.md,
  // .markdown, .mdx alike) gets `id="user-content-<slug>"`, <slug> being github-slugger over its
  // text, duplicates `-1`, `-2`…; a tree/ page renders the directory's README under the listing;
  // `#L<n>` line anchors exist only where a source panel is shown — non-Markdown blobs, or a
  // Markdown blob under `?plain=1`; raw/ has no anchors at all.
  const tracked = new Set([
    'README.md',
    'docs/guide.md',
    'docs/page.mdx',
    'packages/x/src/index.ts',
    'qa/plan.md',
    'apps/cli/README.md',
    'apps/cli/src/main.ts',
  ])
  const targets = new Map<string, string>([
    [
      'README.md',
      [
        '---',
        'title: Frontmatter Heading',
        '---',
        '# Intro',
        '',
        '## 6. `tech/risk-matrix.md` — Adoption Delta',
        '',
        '## Steps',
        'one',
        '## Steps',
        'two',
        '## Café',
        '',
        '<a name="legacy"></a>',
        '',
        "<a id='single-quoted'></a>",
        '',
        '## <a id="inline"></a> Inline Anchored',
        '',
        '```md',
        '# not a heading',
        '```',
        '',
        'Setext Title',
        '============',
        '',
      ].join('\n'),
    ],
    ['docs/guide.md', '## Execution Log\n'],
    ['docs/page.mdx', '## Rendered By Fumadocs\n'],
    ['packages/x/src/index.ts', Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')],
    ['qa/plan.md', '## Execution Log\n'],
    ['apps/cli/README.md', '# cli\n\n## Development\n'],
    ['apps/cli/src/main.ts', 'export {}\n'],
  ])
  const src = (path: string) => targets.get(path)
  const B = 'https://github.com/foomakers/pair/blob/main/'

  const ROWS: Array<[string, string, number]> = [['an explicit html <a name> anchor', `[x](${B}README.md#legacy)`, 0],
[
      'a single-quoted html id is an anchor too (GitHub parses HTML, not quotes)',
      `[x](${B}README.md#single-quoted)`,
      0,
    ],
['line range whose end is past the end', `[x](${B}packages/x/src/index.ts#L5-L30)`, 1],
['line range with columns', `[x](${B}packages/x/src/index.ts#L5C1-L9C4)`, 0],
[
      'line anchor on a RENDERED markdown file is dead — github.com serves line anchors only under ?plain=1',
      `[x](${B}docs/guide.md#L1)`,
      1,
    ],
[
      '?plain=1 shows source, so a heading anchor is dead there',
      `[x](${B}docs/guide.md?plain=1#execution-log)`,
      1,
    ],
['?plain=1 keeps line anchors', `[x](${B}docs/guide.md?plain=1#L1)`, 0],
[
      'tree/ renders the directory README — its heading anchors are live',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli#development)`,
      0,
    ],
[
      'tree/ has no source panel, so no line anchors',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli#L2)`,
      1,
    ],
[
      'raw/ has no anchors',
      `[x](https://github.com/foomakers/pair/raw/main/docs/guide.md#execution-log)`,
      1,
    ],]

  it.each(ROWS)('%s', (_label, body, dead) => {
    expect(findDeadRepoCitations(`See ${body}.\n`, 'a.mdx', tracked, src)).toHaveLength(dead)
  })

  it('names the fragment and the reason', () => {
    const [err] = findDeadRepoCitations(
      `See [x](${B}docs/guide.md#deployment-log).\n`,
      'a.mdx',
      tracked,
      src,
    )
    expect(err).toContain('docs/guide.md#deployment-log')
    expect(err).toMatch(/no heading or anchor/)
  })

  it('names the line count when a line anchor is past the end', () => {
    const [err] = findDeadRepoCitations(
      `See [x](${B}packages/x/src/index.ts#L40).\n`,
      'a.mdx',
      tracked,
      src,
    )
    expect(err).toContain('#L40')
    expect(err).toContain('20 lines')
  })

  it('names the missing README when a tree/ anchor cannot resolve', () => {
    const [err] = findDeadRepoCitations(
      `See [x](https://github.com/foomakers/pair/tree/main/docs#execution-log).\n`,
      'a.mdx',
      tracked,
      src,
    )
    expect(err).toMatch(/no README/)
  })

  it('a tracked target the run cannot read is a finding, not a pass', () => {
    const [err] = findDeadRepoCitations(
      `See [x](${B}qa/plan.md#execution-log).\n`,
      'a.mdx',
      tracked,
      () => undefined,
    )
    expect(err).toMatch(/could not be read/)
  })
})

describe('githubHeadingSlugs', () => {
  it('reads single-quoted and unquoted html ids as well as double-quoted ones', () => {
    expect([...githubHeadingSlugs(`<a id='a'></a>\n\n<a name=b></a>\n\n<a id="c"></a>\n`)]).toEqual(
      ['a', 'b', 'c'],
    )
  })
  it('ignores frontmatter and fenced code, keeps setext and html anchors', () => {
    const md = '---\ntitle: T\n---\n```\n# fenced\n```\nS\n=\n<a id="x"></a>\n'
    expect([...githubHeadingSlugs(md)]).toEqual(['s', 'x'])
  })
  it('a heading with an inline html anchor yields its (untrimmed) slug and the anchor id', () => {
    expect([...githubHeadingSlugs('## <a id="k"></a> Key Term\n')]).toEqual(['-key-term', 'k'])
  })
})

describe('checkCatalogSync', () => {
  it('flags a skill dir missing from the catalog', () => {
    expect(checkCatalogSync(['implement'], 'no rows here')).toHaveLength(1)
  })

  it('flags a catalog row with no matching dir', () => {
    expect(checkCatalogSync([], '| **ghost** | row |')).toHaveLength(1)
  })
})

describe('checkCommandAnchors', () => {
  it('flags a command dir with no anchor', () => {
    expect(checkCommandAnchors(['install'], 'no anchors')).toHaveLength(1)
  })
})

describe('checkDocsCommands', () => {
  const commands = ['install', 'update', 'kb-validate']
  const doc = (content: string) => [{ rel: 'a.mdx', content }]

  it('flags a command a doc tells the reader to run that does not exist', () => {
    const errs = checkDocsCommands(doc('Run `pair-cli init` first.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli init')
  })

  it('flags a bare `pair` behind npx — the runner does not launder the wrong binary', () => {
    const errs = checkDocsCommands(doc('```bash\nnpx --no @foomakers/pair install\n```'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('pair-cli install')
  })

  // US-449 round 5: `pair --version` is the exact form 9 pages already carry in its
  // CORRECT spelling, so the bare slip is one edit away — and the old command group
  // (`[A-Za-z][\w.-]*`) could not match a leading `-`, so the whole prefix failed and the
  // line was not seen as an invocation at all. The page shipped green telling the reader
  // to run a binary no npm install creates.
  it('flags a bare `pair --version` in a fence — a flag does not launder the binary', () => {
    const errs = checkDocsCommands(doc('```bash\npair --version\n```'), commands)
    expect(errs).toEqual([
      'a.mdx tells the reader to run "pair --version", but the published binary is "pair-cli"',
    ])
  })

  it('flags a bare `pair <cmd>` behind a shell prompt', () => {
    expect(checkDocsCommands(doc('```bash\n$ pair update\n```'), commands)).toHaveLength(1)
  })

  it('flags a wrong form quoted in a doubled span — doubling is not an exemption', () => {
    const errs = checkDocsCommands(doc('Never write ``pair init``.'), commands)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('"init" is not one of its commands')
    // The way to show a wrong form on a docs page is unbackticked prose: the rule is
    // positional (span content / fenced line), so prose is outside it by construction.
    expect(checkDocsCommands(doc('Never write pair init.'), commands)).toHaveLength(0)
  })
})

describe('buildValidRoutes', () => {
  it('maps index.mdx to /docs and folder index to the folder route', () => {
    const docsDir = '/x/docs'
    const routes = buildValidRoutes(
      ['/x/docs/index.mdx', '/x/docs/reference/index.mdx', '/x/docs/tutorials/first.mdx'],
      docsDir,
    )
    expect(routes.has('/docs')).toBe(true)
    expect(routes.has('/docs/reference')).toBe(true)
    expect(routes.has('/docs/tutorials/first')).toBe(true)
  })
})

describe('readSkillDescription', () => {
  it('returns empty string when absent', () => {
    expect(readSkillDescription('---\nname: x\n---\n')).toBe('')
  })
})

describe('checkCatalogContent (Check 2c)', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('flags command drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify-X', description: 'Applies the model.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('command drift') && e.includes('classify'))).toBe(true)
  })
  it('flags description drift, naming the skill', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Something else.' }],
    ])
    const errs = checkCatalogContent(expected, catalog)
    expect(errs.some(e => e.includes('description drift') && e.includes('classify'))).toBe(true)
  })
  it('skips a skill with no catalog row (checkCatalogSync owns presence)', () => {
    const expected = new Map([['ghost', { command: '/pair-ghost', description: 'X.' }]])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
})

describe('generateCatalogRows + committed catalog parity (Check 2c integration)', () => {
  const SKILLS_DIR = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
  it('derives a command + non-empty description for every dataset skill', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    expect(rows.size).toBe(51)
    expect(rows.get('next')?.command).toBe('/pair-next')
    for (const [, row] of rows) expect(row.description.length).toBeGreaterThan(0)
  })
})

// US-514 T-8: check 2d — the catalog header's `Last updated` date compared against the dataset's
// newest git change — is REMOVED. It failed `pnpm docs:staleness` on a content-correct skill
// change whenever the header's own date was not also bumped in the same commit, which every
// other catalog check (row list, row content) already catches independently on its own terms.
describe('US-514 T-8: check 2d removed — a stale header no longer fails docs:staleness', () => {
  it('checkCatalogFreshness/newestChangeDate/parseCatalogLastUpdated no longer exist', async () => {
    const mod = (await import('./docs-staleness-check')) as Record<string, unknown>
    expect(mod['checkCatalogFreshness']).toBeUndefined()
    expect(mod['newestChangeDate']).toBeUndefined()
    expect(mod['parseCatalogLastUpdated']).toBeUndefined()
  })

  // A full `runAllChecks(REPO_ROOT)` walk timed out in CI (>5000ms) — deterministic and fast
  // instead: since check 2d (`checkCatalogFreshness`) is gone (proven above), the ONLY way
  // `runAllChecks` could still fail on the header date alone is if its own retired error message
  // ("dates itself before the content") were emitted by some other check in the source. It never
  // is — confirmed by reading the production module's own text once, no repo walk required.
  it('no check in the module can emit the retired header-date error message', () => {
    const source = readFileSync(join(__dirname, 'docs-staleness-check.ts'), 'utf-8')
    expect(source.includes('dates itself before the content')).toBe(false)
  })

  // AC10, proven for real: the repo's own catalog header date equals the newest skill change today,
  // so a plain `runAllChecks(REPO_ROOT)` never exercises a STALE header. Here the module is re-imported
  // with `node:fs` mocked so that ONLY the catalog's `Last updated` line reads as 2000-01-01; every
  // other file (skills, docs, CLI config) is read for real. Zero errors means no header-date check is
  // alive under any name.
  it('AC10: runAllChecks reports ZERO errors when the catalog header is far OLDER than the newest skill change', async () => {
    vi.resetModules()
    vi.doMock('node:fs', async importOriginal => {
      const actual = await importOriginal<typeof import('node:fs')>()
      const readFileSync = ((...args: Parameters<typeof actual.readFileSync>) => {
        const result = actual.readFileSync(...args)
        const path = String(args[0])
        return path.endsWith('skills-catalog.mdx') && typeof result === 'string'
          ? result.replace(/(\*\*Last updated:\*\*\s*)\d{4}-\d{2}-\d{2}/, '$12000-01-01')
          : result
      }) as typeof actual.readFileSync
      return { ...actual, readFileSync, default: { ...actual, readFileSync } }
    })
    try {
      const mod = await import('./docs-staleness-check')
      const { readFileSync: mockedRead } = await import('node:fs')
      const catalog = mockedRead(
        join(REPO_ROOT, 'apps/website/content/docs/reference/skills-catalog.mdx'),
        'utf-8',
      )
      expect(catalog).toContain('**Last updated:** 2000-01-01')
      const { errors } = mod.runAllChecks(REPO_ROOT, () => 'open')
      expect(errors, errors.join('\n')).toHaveLength(0)
    } finally {
      vi.doUnmock('node:fs')
      vi.resetModules()
    }
  }, 60_000)
})

// ── The batch-engine page's claims (#219, review of #432) ─────────────────────
// Both gates were shipped without a unit test, so their failure branches had never been
// executed — including the one for a DELETED registry, which cannot be reached from the real
// config at all. The repo's own convention (ADL 2026-07-13) is that gate logic lives in tested
// production modules, and every sibling check in this file has tests.
describe('checkBatchEnginePaths', () => {
  const doc = 'installs into `.claude/workflows/` and `.claude/agents/`'
  const registries = {
    workflows: { targets: [{ path: '.claude/workflows/' }] },
    'agent-definitions': { targets: [{ path: '.claude/agents/' }] },
  }

  it('fails when a registry target is RENAMED and the page still names the old one', () => {
    const renamed = { ...registries, workflows: { targets: [{ path: '.claude/flows/' }] } }
    expect(checkBatchEnginePaths(renamed, doc)).toEqual([
      'batch-engine.mdx does not mention ".claude/flows/", where the "workflows" registry installs',
    ])
  })

  it('fails when a registry is REMOVED entirely but the page still documents it', () => {
    // Unreachable from the real config, which is exactly why it needs a test: this branch had
    // never run, so a doc describing an install that no longer happens would have passed.
    const rest = Object.fromEntries(
      Object.entries(registries).filter(([name]) => name !== 'workflows'),
    )
    expect(checkBatchEnginePaths(rest, doc)).toEqual([
      'asset_registries."workflows" is gone but batch-engine.mdx still documents it',
    ])
  })
})

describe('checkBatchEngineAgents', () => {
  const agents = [
    { name: 'pair-implementer', tools: 'Read, Edit, Write, Bash' },
    { name: 'pair-reviewer', tools: 'Read, Grep, Bash' },
  ]
  const doc =
    '`pair-implementer` holds `Read, Edit, Write, Bash`; `pair-reviewer` holds `Read, Grep, Bash`'

  it('fails when an agent is not enumerated at all', () => {
    const withThird = [...agents, { name: 'pair-contract-generator', tools: 'Read, Write, Bash' }]
    expect(checkBatchEngineAgents(withThird, doc)).toEqual([
      'batch-engine.mdx does not name the shipped agent "pair-contract-generator"',
    ])
  })

  it('fails when an agent is named but its tool list is understated', () => {
    // The measured case: the page said `pair-reviewer` holds `Bash` while its frontmatter
    // declared five tools, so the note understated the authority an adopter installs.
    const widened = [{ name: 'pair-reviewer', tools: 'Read, Grep, Glob, Bash, Skill' }]
    expect(checkBatchEngineAgents(widened, doc)).toEqual([
      'batch-engine.mdx does not state "pair-reviewer" tools as declared in its frontmatter: "Read, Grep, Glob, Bash, Skill"',
    ])
  })

  it('reports an empty agent set rather than passing vacuously', () => {
    // Deleting the dataset agents directory would otherwise turn the check green.
    expect(checkBatchEngineAgents([], doc)).toEqual([
      'no agent definitions found in the dataset — the batch-engine agent check is vacuous',
    ])
  })
})

// The AGENT table is derived; the WORKFLOW table beside it was not, so a third shipped
// workflow — or a renamed one — left the page silently describing a set that no longer exists.
// Same shape as the agent check, same reason: what installs is a fact, and a fact on this page
// is read from the dataset rather than hand-copied.
describe('checkBatchEngineWorkflows', () => {
  const doc =
    '| Workflow | What it drives |\n| --- | --- |\n| `pair-implement-batch` | … |\n| `pair-refine-batch` | … |\n\nprose about `pair-implementer` and `pair-reviewer`.'

  it('fails when the page names a workflow that no longer ships', () => {
    // The reverse direction matters as much: a page promising a workflow the adopter never
    // receives is the same defect pointed the other way.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], doc)).toEqual([
      'batch-engine.mdx names "pair-refine-batch", which the workflows registry does not ship',
    ])
  })

  it('reports an empty workflow set rather than passing vacuously', () => {
    expect(checkBatchEngineWorkflows([], doc)).toEqual([
      'no shipped workflows found in the dataset — the batch-engine workflow check is vacuous',
    ])
  })

  it('reports a missing workflow TABLE rather than passing its reverse check vacuously', () => {
    // Same loud-on-absence rule the sibling checks follow: with no table to read, the reverse
    // direction proves nothing and must say so instead of returning green.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], 'no table here')).toEqual([
      'batch-engine.mdx does not name the shipped workflow "pair-implement-batch"',
      'batch-engine.mdx has no workflow table — the reverse check (a name the registry does not ship) cannot run',
    ])
  })
})

// The page's own gate must not be disabled by deleting the page. `batchEngineErrors` returned
// `[]` when the file was absent, so removing `batch-engine.mdx` turned every check above green
// — and AC8 requires the note to EXIST. The same file states the loud-on-absence convention
// twice for other checks; this one contradicted it.
describe('batchEngineErrors on a missing page', () => {
  it('fails loudly instead of self-disabling when the page is gone', () => {
    const errors = batchEngineErrors({
      BATCH_ENGINE_FILE: '/nowhere/batch-engine.mdx',
      CLI_CONFIG: '/nowhere/config.json',
      AGENTS_DIR: '/nowhere/.agents',
      WORKFLOWS_DIR: '/nowhere/.workflows',
    })
    expect(errors).toEqual([
      'Batch engine page not found: /nowhere/batch-engine.mdx — the batch-engine checks cannot run',
    ])
  })
})

describe('checkListTargetsSamples', () => {
  // The shipped shape, trimmed to two registries.
  const registries = {
    github: { behavior: 'mirror', targets: [{ path: '.github' }] },
    knowledge: { behavior: 'mirror', targets: [{ path: '.pair/knowledge' }] },
  }

  // What `listTargets` really prints (handler.ts), uncoloured.
  const real = [
    '  Asset Registries',
    '',
    '  github',
    '    target:   .github',
    '    behavior: mirror',
    '    GitHub workflows and configuration files',
    '',
    '  knowledge',
    '    target:   .pair/knowledge',
    '    behavior: mirror',
    '    Knowledge base and documentation',
  ].join('\n')

  // What the three pages carried before #216 — a columnar table under an invented
  // header, with `.pair` where the registry installs `.pair/knowledge`.
  const invented = [
    'Available asset registries:',
    '  github     .github         GitHub workflows and configuration files',
    '  knowledge  .pair            Knowledge base and documentation',
  ].join('\n')

  it('flags the invented columnar transcript on every count', () => {
    const errors = checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: invented }])
    expect(errors).toHaveLength(4) // missing header + invented header + 2 registries
    expect(errors.some(e => e.includes('Available asset registries:'))).toBe(true)
    expect(errors.some(e => e.includes('"knowledge" registry'))).toBe(true)
  })

  it('flags a registry the sample omits', () => {
    const withExtra = {
      ...registries,
      adoption: { behavior: 'add', targets: [{ path: '.pair/adoption' }] },
    }
    const errors = checkListTargetsSamples(withExtra, [{ rel: 'a.mdx', content: real }])
    expect(errors).toEqual([
      'a.mdx: --list-targets sample does not print the "adoption" registry as the CLI does ' +
        '(expected "  adoption" / "    target:   .pair/adoption" / "    behavior: add")',
    ])
  })
})

// US-353 AC8 — a planned-capability marker whose issue is closed (or unresolvable) fails the gate.
describe('planned-capability marker (US-353 AC7/AC8)', () => {
  const marker = (n: number) =>
    `<Callout type="info">\n**Planned** — tracked in #${n}, not yet wired.\n</Callout>`
  const stateOf =
    (m: Record<number, 'open' | 'closed' | 'unresolvable' | 'unavailable'>) => (n: number) =>
      m[n] ?? 'unresolvable'

  it('matches the pinned sentence and captures the issue number', () => {
    const nums = [...marker(212).matchAll(PLANNED_MARKER_RE)].map(m => Number(m[1]))
    expect(nums).toEqual([212])
  })

  it('does not match prose that merely mentions an issue or PR number', () => {
    const prose = 'See ADR-3. PR #212 fixed X. Planned for later, tracked in #212 of the board.'
    expect([...prose.matchAll(PLANNED_MARKER_RE)]).toHaveLength(0)
  })

  it('open issue passes', () => {
    expect(findStalePlannedMarkers(marker(212), 'a.mdx', stateOf({ 212: 'open' }))).toEqual([])
  })

  it('closed issue fails naming the page and the issue', () => {
    const errors = findStalePlannedMarkers(
      marker(212),
      'developer-journey/x.mdx',
      stateOf({ 212: 'closed' }),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('developer-journey/x.mdx')
    expect(errors[0]).toContain('#212')
    expect(errors[0]).toContain('closed')
  })

  it('unresolvable issue fails with a message distinct from closed', () => {
    const closed = findStalePlannedMarkers(marker(9), 'a.mdx', stateOf({ 9: 'closed' }))
    const missing = findStalePlannedMarkers(marker(9), 'a.mdx', stateOf({}))
    expect(missing).toHaveLength(1)
    expect(missing[0]).toContain('does not resolve')
    expect(missing[0]).not.toEqual(closed[0])
  })

  it('unavailable lookup yields no per-page error (handled by plannedMarkerErrors)', () => {
    expect(findStalePlannedMarkers(marker(212), 'a.mdx', stateOf({ 212: 'unavailable' }))).toEqual(
      [],
    )
  })

  it('reports every stale marker on a page, once per marker', () => {
    const errors = findStalePlannedMarkers(
      `${marker(1)}\n\n${marker(2)}\n\n${marker(3)}`,
      'a.mdx',
      stateOf({ 1: 'closed', 2: 'open', 3: 'closed' }),
    )
    expect(errors).toHaveLength(2)
  })

  describe('queryIssueState (gh adapter)', () => {
    it('maps OPEN/CLOSED', () => {
      expect(queryIssueState(1, () => 'OPEN\n')).toBe('open')
      expect(queryIssueState(1, () => 'CLOSED\n')).toBe('closed')
    })
    it('maps a gh not-found failure to unresolvable', () => {
      const exec = () => {
        throw Object.assign(new Error('x'), {
          stderr: 'GraphQL: Could not resolve to an Issue with the number of 9.',
        })
      }
      expect(queryIssueState(9, exec)).toBe('unresolvable')
    })
    it('maps any other failure (gh missing, offline, unauthenticated) to unavailable', () => {
      const exec = () => {
        throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
      }
      expect(queryIssueState(9, exec)).toBe('unavailable')
    })
  })

  describe('plannedMarkerErrors', () => {
    const docs = [{ rel: 'a.mdx', content: marker(212) }]
    it('local run with unavailable lookup warns, never fails', () => {
      const warn = vi.fn()
      expect(plannedMarkerErrors(docs, () => 'unavailable', { ci: false, warn })).toEqual([])
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('#212')
    })
    it('CI run with unavailable lookup fails loudly', () => {
      const errors = plannedMarkerErrors(docs, () => 'unavailable', { ci: true, warn: vi.fn() })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('#212')
    })
    it('queries each distinct issue once', () => {
      const lookup = vi.fn(() => 'open' as const)
      plannedMarkerErrors(
        [
          { rel: 'a.mdx', content: marker(212) },
          { rel: 'b.mdx', content: marker(212) },
        ],
        lookup,
        { ci: false, warn: vi.fn() },
      )
      expect(lookup).toHaveBeenCalledTimes(1)
    })
    it('no markers ⇒ no lookup', () => {
      const lookup = vi.fn(() => 'open' as const)
      expect(
        plannedMarkerErrors([{ rel: 'a.mdx', content: 'plain' }], lookup, {
          ci: true,
          warn: vi.fn(),
        }),
      ).toEqual([])
      expect(lookup).not.toHaveBeenCalled()
    })
  })
})

describe('findDeadAnchors (US-552 AC30)', () => {
  const slugs = buildDocSlugs(new Map([['/docs/a', '# A\n\n## Hello World\n\n## Hello World\n']]))
  it('passes a live anchor, incl. duplicate suffix', () => {
    expect(
      findDeadAnchors('[x](/docs/a#hello-world) [y](/docs/a#hello-world-1)', 'p.mdx', slugs),
    ).toEqual([])
  })
  it('flags a dead anchor', () => {
    const e = findDeadAnchors('[x](/docs/a#nope)', 'p.mdx', slugs)
    expect(e).toHaveLength(1)
    expect(e[0]).toContain('/docs/a#nope')
  })
  it('ignores links without fragment and unknown routes (check 5 owns those)', () => {
    expect(findDeadAnchors('[x](/docs/a) [y](/docs/zzz#q)', 'p.mdx', slugs)).toEqual([])
  })
})

describe('checkViaLines (US-552 AC25)', () => {
  const skill =
    '| The user wants | Source | Notes |\n| --- | --- | --- |\n| the KB and skills refreshed | `update` | n |\n| pair in this project | `install` | n |\n'
  const doc = (u: string, i: string) =>
    `## install\n\n${i}\n\n## update\n\n${u}\n\n## Global Options\n`
  const ok = '**Via `/pair-assistant`:** ask for "the KB and skills refreshed"'
  const okI = '**Via `/pair-assistant`:** ask for "pair in this project"'
  it('parses intent rows', () => {
    expect(parseIntentRequests(skill).get('update')).toEqual(['the KB and skills refreshed'])
  })
  it('passes complete lines', () => {
    expect(checkViaLines(['install', 'update'], doc(ok, okI), skill)).toEqual([])
  })
  it('passes CLI only', () => {
    expect(checkViaLines(['install', 'update'], doc('**Via:** CLI only', okI), skill)).toEqual([])
  })
  it('flags a missing Via line', () => {
    expect(checkViaLines(['install', 'update'], doc('text', okI), skill)).toHaveLength(1)
  })
  it('flags a request absent from the intent table', () => {
    expect(
      checkViaLines(
        ['install', 'update'],
        doc('**Via `/pair-assistant`:** ask for "bogus"', okI),
        skill,
      ),
    ).toHaveLength(1)
  })
})

describe('findEmDashes', () => {
  it('flags each line with U+2014 and passes clean content', () => {
    expect(findEmDashes('a\nb \u2014 c\nd', 'a.mdx')).toEqual(['a.mdx:2: em dash (U+2014)'])
    expect(findEmDashes('a - b, c', 'a.mdx')).toEqual([])
  })
})
