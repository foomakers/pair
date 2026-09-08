import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import {
  findSkillCountMismatches,
  findPluginSkillCountMismatches,
  countDeclaredPluginSkills,
  findGuideCountMismatches,
  findDeadLinks,
  findDeadRepoCitations,
  githubHeadingSlugs,
  checkCatalogSync,
  checkCommandAnchors,
  checkDocsCommands,
  countHowToGuides,
  buildValidRoutes,
  runAllChecks,
  deriveSkillCommand,
  extractFirstSentence,
  transformCommandTokens,
  readSkillDescription,
  parseCatalogRow,
  checkCatalogContent,
  generateCatalogRows,
  checkBatchEnginePaths,
  checkBatchEngineAgents,
  checkBatchEngineWorkflows,
  batchEngineErrors,
  checkListTargetsSamples,
} from './docs-staleness-check'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

// White-box unit tests for the docs-staleness gate LOGIC. Exported functions are
// tested directly — no spawning of any CLI/script. The thin `tsx` CLI wrapper is
// out of scope here (its logic is these functions); parity with the real docs
// tree is asserted in-process via runAllChecks() below.

const REPO_ROOT = resolve(__dirname, '../../..')

describe('findSkillCountMismatches', () => {
  it('flags a wrong bare "N skills"', () => {
    expect(findSkillCountMismatches('has 5 skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('passes a matching "N skills"', () => {
    expect(findSkillCountMismatches('has 35 skills', 'a.mdx', 35)).toHaveLength(0)
  })

  it('flags a wrong "N composable skills" (adjective between number and skills)', () => {
    const errs = findSkillCountMismatches('7 composable skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 composable skills')
  })

  it('flags a wrong "N+ skills" (trailing plus)', () => {
    expect(findSkillCountMismatches('30+ skills', 'a.mdx', 35)).toHaveLength(1)
  })

  it('flags a wrong "N agent skills"', () => {
    const errs = findSkillCountMismatches('exposes 7 agent skills', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('7 agent skills')
  })

  it('passes matching "N composable skills" and "N+ skills"', () => {
    expect(findSkillCountMismatches('1 composable skills and 1+ skills', 'a.mdx', 1)).toHaveLength(
      0,
    )
  })

  it('ignores subset counts ("N process skills")', () => {
    expect(findSkillCountMismatches('9 process skills', 'a.mdx', 35)).toHaveLength(0)
  })

  // The two phrasings the marketplace docs introduced, both of which drifted
  // silently (docs said 40 while the dataset held 41) because neither matched.
  it('flags a wrong "N declared pair skills"', () => {
    const errs = findSkillCountMismatches('exactly the 40 declared pair skills', 'a.mdx', 41)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('40 declared pair skills')
  })

  // The `Skills (N)` transcript is NOT a dataset-skill count — check 1 must ignore it,
  // or the two readings fight over one number (the plugin declares 1, the dataset 41).
  it('leaves the `Skills (N)` plugin transcript to the plugin check', () => {
    expect(findSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 41)).toHaveLength(0)
  })
})

describe('findPluginSkillCountMismatches', () => {
  it('flags a `Skills (N)` transcript that disagrees with the manifest', () => {
    const errs = findPluginSkillCountMismatches('reports `Skills (40)`, `Agents (0)`', 'a.mdx', 1)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Skills (40)')
    expect(errs[0]).toContain('Plugin skill count')
  })

  it('passes a matching transcript', () => {
    expect(findPluginSkillCountMismatches('reports `Skills (1)`', 'a.mdx', 1)).toHaveLength(0)
  })

  it('does not read a sibling `Agents (N)`/`Hooks (N)` count as a skill count', () => {
    expect(
      findPluginSkillCountMismatches('`Agents (0)`, `Hooks (0)`, `MCP servers (0)`', 'a.mdx', 1),
    ).toHaveLength(0)
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
  it('flags a wrong "N how-to guides"', () => {
    expect(findGuideCountMismatches('11 how-to guides', 'a.mdx', 9)).toHaveLength(1)
  })

  it('passes a matching "N how-to guides"', () => {
    expect(findGuideCountMismatches('9 how-to guides', 'a.mdx', 9)).toHaveLength(0)
  })

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

  it('does NOT false-positive on bare "N guides" prose (no how-to qualifier)', () => {
    expect(
      findGuideCountMismatches('5 guides at the museum and 3 tour guides', 'a.mdx', 9),
    ).toHaveLength(0)
  })
})

describe('countHowToGuides', () => {
  it('returns null when the how-to dir is missing (drives the loud gate failure)', () => {
    expect(countHowToGuides(resolve(REPO_ROOT, 'does/not/exist'))).toBeNull()
  })

  it('counts NN-how-to-*.md files in the real dataset (ignoring README)', () => {
    const n = countHowToGuides(
      resolve(REPO_ROOT, 'packages/knowledge-hub/dataset/.pair/knowledge/how-to'),
    )
    expect(n).toBe(9)
  })
})

describe('findDeadLinks', () => {
  const routes = new Set(['/docs', '/docs/reference/skills-catalog', '/docs/tutorials'])

  it('flags a dead markdown link', () => {
    expect(findDeadLinks('see [x](/docs/nope)', 'a.mdx', routes)).toHaveLength(1)
  })

  it('flags a dead JSX href="/docs/..." card link', () => {
    const errs = findDeadLinks('<Card href="/docs/does-not-exist">x</Card>', 'a.mdx', routes)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('/docs/does-not-exist')
  })

  it('passes a valid JSX href and a valid markdown link (incl. anchors)', () => {
    const ok = '<Card href="/docs/reference/skills-catalog">x</Card> and [t](/docs/tutorials#top)'
    expect(findDeadLinks(ok, 'a.mdx', routes)).toHaveLength(0)
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
  const LIVE = 'https://github.com/foomakers/pair/blob/main/README.md'
  const DEAD = 'https://github.com/foomakers/pair/blob/main/does/not/exist.md'

  // Every `hrefs` below is what the site's own MDX compiler (@mdx-js/mdx + remark-gfm, the same
  // pair fumadocs runs) emits as a link for that source — the oracle is the renderer, not a regex.
  const ROWS: ReadonlyArray<{ why: string; content: string; dead: number }> = [
    {
      why: 'a markdown link to a missing repo file',
      content: `See [the file](${DEAD}) here.\n`,
      dead: 1,
    },
    { why: 'a bare GFM autolink to a missing repo file', content: `See ${DEAD} here.\n`, dead: 1 },
    { why: 'a live citation', content: `See [readme](${LIVE}).\n`, dead: 0 },
    {
      why: 'a tree/ citation to a tracked directory',
      content: `See [src](https://github.com/foomakers/pair/tree/main/packages/content-ops/src).\n`,
      dead: 0,
    },
    {
      why: 'the dead URL inside a fenced code block (rendered as code, not a link)',
      content: '```bash\ngh api ' + DEAD + '\n```\n',
      dead: 0,
    },
    {
      why: 'the dead URL inside an inline code span',
      content: `Run \`curl ${DEAD}\` first.\n`,
      dead: 0,
    },
    {
      why: 'the dead URL inside a JSX comment (compiled away)',
      content: `{/* TODO ${DEAD} */}\n\nText.\n`,
      dead: 0,
    },
    {
      why: 'a case-mismatched path the filesystem would forgive',
      content: `See [x](https://github.com/foomakers/pair/blob/main/readme.md).\n`,
      dead: 1,
    },
    {
      why: 'a github URL to another repository',
      content: `See [x](https://github.com/vercel/next.js/blob/main/nope.md).\n`,
      dead: 0,
    },
    {
      why: 'a citation with a fragment and query',
      content: `See [x](${DEAD}#anchor?plain=1).\n`,
      dead: 1,
    },
    {
      // Not "frontmatter above the prose" — MDX compiles well-formed frontmatter as a thematic
      // break plus a paragraph, so that row passes with or without the strip. This one does not:
      // an unbalanced `{` in the frontmatter is an MDX expression the compiler rejects, and
      // without the strip the page falls into the compile-failure catch and goes UNCHECKED.
      why: 'frontmatter MDX cannot parse, stripped before compiling',
      content: `---\ntitle: 'a { b'\n---\n\nSee [x](${DEAD}).\n`,
      dead: 1,
    },
    {
      // ADL decision 3: a pinned ref is a citation of a moment in time, left alone.
      why: 'a citation pinned to a SHA rather than main',
      content: `See [x](https://github.com/foomakers/pair/blob/1bbccf6f/does/not/exist.md).\n`,
      dead: 0,
    },
    {
      // ADL decision 2: raw/ is a file URL form exactly like blob/.
      why: 'a raw/ citation to a missing repo file',
      content: `See [x](https://github.com/foomakers/pair/raw/main/does/not/exist.md).\n`,
      dead: 1,
    },
    {
      // ADL decision 4: a page the compiler rejects is next build's finding, not this gate's —
      // the gate returns nothing rather than a misleading citation error.
      why: 'a page the compiler rejects — next build reports it, not this gate',
      content: `See [x](${DEAD}).\n\n<Broken attr={ unclosed\n`,
      dead: 0,
    },
    {
      // The tree/ arm must still CHECK: a tree/ URL whose prefix matches nothing tracked is dead.
      // Without this row the arm can be mutated to accept everything with the suite green.
      why: 'a tree/ citation to a directory that does not exist',
      content: `See [x](https://github.com/foomakers/pair/tree/main/packages/deleted-package).\n`,
      dead: 1,
    },
    {
      // github.com serves `tree/<dir>/` and `tree/<dir>` alike; the trailing slash is stripped
      // before the prefix test, or a live directory citation would be reported dead.
      why: 'a live tree/ citation with a trailing slash',
      content: `See [x](https://github.com/foomakers/pair/tree/main/packages/content-ops/src/).\n`,
      dead: 0,
    },
    {
      // GitHub's copy-link percent-escapes `(` and `)`; 13 tracked paths under
      // apps/website/app/(landing)/ carry them. The citation must resolve through the decode.
      why: 'a live citation whose path is percent-escaped the way GitHub copies it',
      content: `See [x](https://github.com/foomakers/pair/blob/main/apps/website/app/%28landing%29/constants.ts).\n`,
      dead: 0,
    },
    {
      // A literal `%` is not a valid escape. The gate must REPORT the citation, never throw a
      // URIError out of the whole run — that would also discard every other check's findings.
      why: 'a path with a malformed percent-escape, reported instead of crashing the gate',
      content: `See [x](https://github.com/foomakers/pair/blob/main/scripts/100%coverage.sh).\n`,
      dead: 1,
    },
  ]
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

  const ROWS: Array<[string, string, number]> = [
    ['live heading anchor', `[x](${B}docs/guide.md#execution-log)`, 0],
    ['dead heading anchor', `[x](${B}docs/guide.md#deployment-log)`, 1],
    [
      'punctuation, backticks and an em-dash slug exactly as github.com does (the real quality-model citation shape)',
      `[x](${B}README.md#6-techrisk-matrixmd--adoption-delta)`,
      0,
    ],
    ['second duplicate heading gets -1', `[x](${B}README.md#steps-1)`, 0],
    ['no third duplicate, so -2 is dead', `[x](${B}README.md#steps-2)`, 1],
    ['a heading inside a fence is not a heading', `[x](${B}README.md#not-a-heading)`, 1],
    [
      'a frontmatter key is not a heading (github renders frontmatter as a table)',
      `[x](${B}README.md#frontmatter-heading)`,
      1,
    ],
    ['setext heading', `[x](${B}README.md#setext-title)`, 0],
    [
      'unicode letters survive the slug; percent-escaped fragment decodes first',
      `[x](${B}README.md#caf%C3%A9)`,
      0,
    ],
    ['an explicit html <a name> anchor', `[x](${B}README.md#legacy)`, 0],
    [
      'a single-quoted html id is an anchor too (GitHub parses HTML, not quotes)',
      `[x](${B}README.md#single-quoted)`,
      0,
    ],
    ['a heading carrying an inline html anchor serves both ids', `[x](${B}README.md#inline)`, 0],
    [
      '…and its own slug — over the text content, untrimmed, exactly as github.com (measured: gitui FAQ.md serves `-table-of-contents`)',
      `[x](${B}README.md#-inline-anchored)`,
      0,
    ],
    ['the trimmed spelling of that slug is NOT served', `[x](${B}README.md#inline-anchored)`, 1],
    [
      'fragment case matters (ids are lowercase, browser matching is exact)',
      `[x](${B}docs/guide.md#Execution-Log)`,
      1,
    ],
    [
      'a .mdx blob is rendered as Markdown on github.com (measured: pm-tools/index.mdx serves 6 ids)',
      `[x](${B}docs/page.mdx#rendered-by-fumadocs)`,
      0,
    ],
    ['a dead heading on a .mdx blob', `[x](${B}docs/page.mdx#nope)`, 1],
    ['line anchor inside the file', `[x](${B}packages/x/src/index.ts#L12)`, 0],
    ['line anchor past the end', `[x](${B}packages/x/src/index.ts#L40)`, 1],
    ['line range whose end is past the end', `[x](${B}packages/x/src/index.ts#L5-L30)`, 1],
    ['line range with columns', `[x](${B}packages/x/src/index.ts#L5C1-L9C4)`, 0],
    ['the last line is inside the file', `[x](${B}packages/x/src/index.ts#L20)`, 0],
    ['one past the last line is not', `[x](${B}packages/x/src/index.ts#L21)`, 1],
    [
      'line anchor on a RENDERED markdown file is dead — github.com serves line anchors only under ?plain=1',
      `[x](${B}docs/guide.md#L1)`,
      1,
    ],
    ['heading anchor on a non-markdown file', `[x](${B}packages/x/src/index.ts#execution-log)`, 1],
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
      'tree/ dead README heading',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli#nope)`,
      1,
    ],
    [
      'tree/ of a directory with no README has no anchors',
      `[x](https://github.com/foomakers/pair/tree/main/docs#execution-log)`,
      1,
    ],
    [
      'tree/ has no source panel, so no line anchors',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli#L2)`,
      1,
    ],
    [
      'tree/<file> is 301-redirected by github.com to blob/<file> — its heading anchors are live',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli/README.md#development)`,
      0,
    ],
    [
      '…and a dead heading through tree/<file> is still dead',
      `[x](https://github.com/foomakers/pair/tree/main/apps/cli/README.md#nope)`,
      1,
    ],
    [
      'blob/<dir> is 301-redirected to tree/<dir> — the README heading anchors are live',
      `[x](${B}apps/cli#development)`,
      0,
    ],
    ['…and a dead heading through blob/<dir> is still dead', `[x](${B}apps/cli#nope)`, 1],
    [
      'raw/<dir> is 301-redirected to tree/<dir> too',
      `[x](https://github.com/foomakers/pair/raw/main/apps/cli#development)`,
      0,
    ],
    [
      'raw/ has no anchors',
      `[x](https://github.com/foomakers/pair/raw/main/docs/guide.md#execution-log)`,
      1,
    ],
    ['empty fragment is not a citation of an anchor', `[x](${B}docs/guide.md#)`, 0],
    ['no fragment: unchanged behaviour', `[x](${B}docs/guide.md)`, 0],
    [
      'dead path with a fragment reports the path once, not the anchor too',
      `[x](${B}docs/nope.md#execution-log)`,
      1,
    ],
    ['a dead anchor in a code span is invisible', `\`${B}docs/guide.md#deployment-log\``, 0],
  ]

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

  it('tells the author to cite ?plain=1 for a line anchor on a rendered Markdown file', () => {
    const [err] = findDeadRepoCitations(`See [x](${B}docs/guide.md#L1).\n`, 'a.mdx', tracked, src)
    expect(err).toMatch(/\?plain=1/)
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
  it('slugs headings in document order with github-slugger duplicate suffixes', () => {
    expect([...githubHeadingSlugs('# A\n## A\n## B & C\n')]).toEqual(['a', 'a-1', 'b--c'])
  })
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
  it('inline html contributes no tag text to the slug; link text inside it does', () => {
    const md = '## 1. <a name="c"></a> "Bad" Error <small><sup>[Top ▲](#toc)</sup></small>\n'
    expect([...githubHeadingSlugs(md)]).toEqual(['1--bad-error-top-', 'c'])
  })
})

describe('checkCatalogSync', () => {
  it('flags a skill dir missing from the catalog', () => {
    expect(checkCatalogSync(['implement'], 'no rows here')).toHaveLength(1)
  })

  it('flags a catalog row with no matching dir', () => {
    expect(checkCatalogSync([], '| **ghost** | row |')).toHaveLength(1)
  })

  it('passes when both directions agree', () => {
    expect(checkCatalogSync(['implement'], '| **implement** | row |')).toHaveLength(0)
  })
})

describe('checkCommandAnchors', () => {
  it('flags a command dir with no anchor', () => {
    expect(checkCommandAnchors(['install'], 'no anchors')).toHaveLength(1)
  })

  it('passes when the anchor exists', () => {
    expect(checkCommandAnchors(['install'], '## install (#install)')).toHaveLength(0)
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

  it('flags a hyphen-less subcommand (`kb validate`)', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli kb validate\n```'), commands)).toHaveLength(1)
  })

  it('passes a real command in a span and in a fence', () => {
    expect(checkDocsCommands(doc('Run `pair-cli install`.'), commands)).toHaveLength(0)
    expect(checkDocsCommands(doc('```bash\nnpx --no pair-cli update\n```'), commands)).toHaveLength(
      0,
    )
  })

  // The reason the rule is positional rather than a prose-word allow-list: these are
  // English, and an earlier list-based version had to grow a word for each of them.
  it('ignores "pair-cli" used as a noun in prose', () => {
    const prose = 'Common pair-cli workflows, and the pair-cli version it invokes.'
    expect(checkDocsCommands(doc(prose), commands)).toHaveLength(0)
  })

  it('ignores a version string printed as OUTPUT in a fence', () => {
    expect(checkDocsCommands(doc('```text\npair-cli vX.Y.Z\n```'), commands)).toHaveLength(0)
  })

  it('ignores a flag, which is never a command name', () => {
    expect(checkDocsCommands(doc('```bash\npair-cli --version\n```'), commands)).toHaveLength(0)
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

describe('runAllChecks (in-process, real docs tree)', () => {
  // Check 5b compiles every docs page through the real MDX compiler, so this is no longer a
  // 5000ms test: MEASURED 1.0s locally and 17.1s on the ubuntu CI runner, actions run 34229200841 (five test
  // files sharing two cores), where vitest's default budget failed it. Same shape as
  // deploy-build-command.test.ts: an explicit budget with the measurement it came from.
  it('reports zero drift and 44 skills against the actual repo', () => {
    const { errors, skillCount } = runAllChecks(REPO_ROOT)
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(skillCount).toBe(44)
  }, 60_000)
})

// Check 2c — catalog ROW CONTENT single-sourced from the dataset SKILL.md frontmatter.
describe('deriveSkillCommand', () => {
  it('non-meta skill → /pair-<category>-<name>', () => {
    expect(deriveSkillCommand('process', 'review')).toBe('/pair-process-review')
    expect(deriveSkillCommand('capability', 'classify')).toBe('/pair-capability-classify')
  })
  it('meta skill (name === category) → /pair-<name>', () => {
    expect(deriveSkillCommand('next', 'next')).toBe('/pair-next')
  })
})

describe('readSkillDescription', () => {
  it('extracts the quoted description scalar from frontmatter', () => {
    expect(readSkillDescription('---\nname: x\ndescription: "Hello world."\n---\n# x\n')).toBe(
      'Hello world.',
    )
  })
  it('returns empty string when absent', () => {
    expect(readSkillDescription('---\nname: x\n---\n')).toBe('')
  })
})

describe('extractFirstSentence', () => {
  it('cuts at the first sentence-terminating period', () => {
    expect(extractFirstSentence('First sentence. Second one.')).toBe('First sentence.')
  })
  it('does not cut on known abbreviations (e.g.)', () => {
    expect(extractFirstSentence('Uses e.g. this and that. Next.')).toBe('Uses e.g. this and that.')
  })
  it('cuts before a $scope/$mode enumeration and ensures a closing period', () => {
    expect(extractFirstSentence('Does a thing: `$scope: full` here.')).toBe('Does a thing.')
  })
})

describe('transformCommandTokens', () => {
  const cmds = new Map([['classify', '/pair-capability-classify']])
  it('backticks + qualifies a bare /command at a word boundary', () => {
    expect(transformCommandTokens('Composes /classify here.', cmds)).toBe(
      'Composes `/pair-capability-classify` here.',
    )
  })
  it('leaves slash-joined prose (map-a/map-b) intact', () => {
    expect(transformCommandTokens('see map-a/map-b flow', cmds)).toBe('see map-a/map-b flow')
  })
})

describe('parseCatalogRow', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('parses the command + description cells of a row', () => {
    expect(parseCatalogRow(catalog, 'classify')).toEqual({
      command: '/pair-capability-classify',
      description: 'Applies the model.',
    })
  })
  it('returns null when the skill has no row', () => {
    expect(parseCatalogRow(catalog, 'ghost')).toBeNull()
  })
})

describe('checkCatalogContent (Check 2c)', () => {
  const catalog = '| **classify** | `/pair-capability-classify` | Applies the model. | — |'
  it('passes when the row matches the generated truth', () => {
    const expected = new Map([
      ['classify', { command: '/pair-capability-classify', description: 'Applies the model.' }],
    ])
    expect(checkCatalogContent(expected, catalog)).toEqual([])
  })
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
  const CATALOG = join(REPO_ROOT, 'apps/website/content/docs/reference/skills-catalog.mdx')
  it('derives a command + non-empty description for every dataset skill', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    expect(rows.size).toBe(44)
    expect(rows.get('next')?.command).toBe('/pair-next')
    for (const [, row] of rows) expect(row.description.length).toBeGreaterThan(0)
  })
  it('the committed skills-catalog rows match the dataset-derived truth (no drift)', () => {
    const rows = generateCatalogRows(SKILLS_DIR)
    const errors = checkCatalogContent(rows, readFileSync(CATALOG, 'utf-8'))
    expect(errors, errors.join('\n')).toHaveLength(0)
  })
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

  it('passes when the page names every install target', () => {
    expect(checkBatchEnginePaths(registries, doc)).toEqual([])
  })

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

  it('passes when every agent is named with its exact declared tools', () => {
    expect(checkBatchEngineAgents(agents, doc)).toEqual([])
  })

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

  it('passes when the page names every shipped workflow', () => {
    expect(checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], doc)).toEqual(
      [],
    )
  })

  it('fails when a shipped workflow is missing from the table', () => {
    expect(
      checkBatchEngineWorkflows(
        ['pair-implement-batch', 'pair-refine-batch', 'pair-triage-batch'],
        doc,
      ),
    ).toEqual(['batch-engine.mdx does not name the shipped workflow "pair-triage-batch"'])
  })

  it('fails when the page names a workflow that no longer ships', () => {
    // The reverse direction matters as much: a page promising a workflow the adopter never
    // receives is the same defect pointed the other way.
    expect(checkBatchEngineWorkflows(['pair-implement-batch'], doc)).toEqual([
      'batch-engine.mdx names "pair-refine-batch", which the workflows registry does not ship',
    ])
  })

  // The reverse direction matched `` `pair-*-batch` `` only, so it could catch a stale name
  // exactly when that name kept the `-batch` suffix. A workflow renamed or retired WITHOUT it
  // — `pair-triage`, the shape a future non-batch workflow takes — stayed on the page promising
  // an install nobody gets, which is the very failure the reverse check exists for. Reading the
  // table's own rows answers it for any name, and keeps the agent table's `pair-*` names (which
  // this check does not own) out of the scan.
  it('fails when the page names a retired workflow whose name has no `-batch` suffix', () => {
    const withTriage = `${doc}\n`.replace(
      '| `pair-refine-batch` | … |',
      '| `pair-refine-batch` | … |\n| `pair-triage` | … |',
    )
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withTriage),
    ).toEqual(['batch-engine.mdx names "pair-triage", which the workflows registry does not ship'])
  })

  it('does not read the AGENT table or prose as workflow names', () => {
    const withAgents = `${doc}\n\n| Agent | Tools |\n| --- | --- |\n| \`pair-implementer\` | … |\n| \`pair-reviewer\` | … |`
    expect(
      checkBatchEngineWorkflows(['pair-implement-batch', 'pair-refine-batch'], withAgents),
    ).toEqual([])
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

  it('passes a sample that reproduces the renderer output', () => {
    expect(checkListTargetsSamples(registries, [{ rel: 'a.mdx', content: real }])).toEqual([])
  })

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

  it('flags a RE-TARGETED registry the sample still shows at the old path', () => {
    const moved = {
      ...registries,
      knowledge: { behavior: 'mirror', targets: [{ path: '.pair/kb' }] },
    }
    const errors = checkListTargetsSamples(moved, [{ rel: 'a.mdx', content: real }])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('    target:   .pair/kb')
  })

  it('flags a behavior change the sample does not follow', () => {
    const rebehaved = { ...registries, github: { behavior: 'add', targets: [{ path: '.github' }] } }
    expect(checkListTargetsSamples(rebehaved, [{ rel: 'a.mdx', content: real }])).toHaveLength(1)
  })
})
