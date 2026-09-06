import { describe, it, expect } from 'vitest'
import { resolve, relative } from 'node:path'
import {
  findDeadRepoLinks,
  collectHeadingSlugs,
  slugifyHeading,
  walkMdx,
  findSkillCountMismatches,
  findPluginSkillCountMismatches,
  countDeclaredPluginSkills,
  findGuideCountMismatches,
  findDeadLinks,
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
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { COMMONMARK_BLOCK_ROWS } from '@pair/content-ops/test-utils/commonmark-rows'
import { isBlockStructureSensitive } from './anchor-oracle-selection'
import { stripFrontmatter } from '@pair/content-ops/markdown/commonmark-blocks'

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

describe('findDeadRepoLinks', () => {
  // A docs page citing a decision record does it with a GitHub blob URL (the
  // convention on adding-a-harness.mdx / web-cloud-environments.mdx), and NOTHING
  // checked those: findDeadLinks only sees `/docs/...`, and the kb-validate
  // link-checker's roots are `packages/knowledge-hub/dataset` + `.pair/knowledge`,
  // neither of which contains `apps/website/content/docs`. A mistyped ADR filename
  // therefore shipped as a 404 nobody could see. Resolved against the real repo tree.
  const ADR = '.pair/adoption/tech/adr/adr-018-code-host-optional-wow-override.md'

  it('flags a blob URL whose repo path does not exist', () => {
    const content = `see [ADR-018](https://github.com/foomakers/pair/blob/main/.pair/adoption/tech/adr/adr-018-typo.md)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('adr-018-typo.md')
  })

  it('passes a blob URL that resolves to a real repo file', () => {
    const content = `see [ADR-018](https://github.com/foomakers/pair/blob/main/${ADR})`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(0)
  })

  // github.com resolves paths case-SENSITIVELY; APFS on a developer's Mac does not.
  // `existsSync` inherits the filesystem's rule, so a citation spelled `…/tech/ADR/…`
  // used to print PASS locally and 404 for every reader — a local gate disagreeing
  // with Linux CI on precisely the class of 404 this check exists to catch.
  it('flags a citation whose path differs from the repo only in case', () => {
    const miscased = ADR.replace('/adr/', '/ADR/')
    const content = `see [ADR-018](https://github.com/foomakers/pair/blob/main/${miscased})`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('/ADR/')
  })

  it('flags a citation whose FILE name differs from the repo only in case', () => {
    const miscased = ADR.replace('adr-018-code', 'ADR-018-code')
    const content = `see https://github.com/foomakers/pair/blob/main/${miscased}`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(1)
  })

  it('resolves a blob URL carrying an anchor', () => {
    const content = `[Callers Matrix](https://github.com/foomakers/pair/blob/main/.pair/knowledge/skills-guide.md#callers-matrix-scoped-capabilities)`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(0)
  })

  // A bare-prose citation ends in the sentence's full stop, which is NOT part of the
  // path. Without the trailing-punctuation strip the gate resolves `README.md.` and
  // reports a dead citation that is in fact live — a false-positive build failure.
  it('resolves a bare citation ending in sentence punctuation', () => {
    const content = `see https://github.com/foomakers/pair/blob/main/README.md.`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(0)
  })

  // GitHub's source view for a rendered-markdown file is spelled `?plain=1`, and
  // REPO_BLOB_RE's character class captures the `?` and everything after it. Without
  // a query strip the gate resolves the literal `…adr-018-….md?plain=1`, existsSync
  // says false, and `docs:staleness` fails the build on a URL that is perfectly live —
  // the same class of false positive the trailing-punctuation strip exists to prevent.
  it('resolves a blob URL carrying a query string', () => {
    const content = `see [ADR-018](https://github.com/foomakers/pair/blob/main/${ADR}?plain=1)`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(0)
  })

  it('still flags a dead path when a query string is present', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/.pair/adoption/tech/adr/adr-018-typo.md?plain=1)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('adr-018-typo.md')
    expect(errs[0]).not.toContain('plain=1')
  })

  // `blob/main/` is one of three spellings GitHub serves a repo path under; a
  // `tree/main/<dir>` citation already ships on reference/cli/commands.mdx. Matching
  // only `blob` left every other spelling unchecked — the exact 404 this gate exists
  // to catch, one URL form away.
  it('flags a dead tree/ URL and passes a live one', () => {
    const dead = `[cli](https://github.com/foomakers/pair/tree/main/apps/pair-cli-typo)`
    expect(findDeadRepoLinks(dead, 'a.mdx', REPO_ROOT)).toHaveLength(1)
    const live = `[cli](https://github.com/foomakers/pair/tree/main/apps/pair-cli)`
    expect(findDeadRepoLinks(live, 'a.mdx', REPO_ROOT)).toHaveLength(0)
  })

  it('flags a dead raw/ URL', () => {
    const content = `https://github.com/foomakers/pair/raw/main/does-not-exist.png`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toHaveLength(1)
  })

  // --- URL SPELLINGS the character class used to swallow -------------------
  //
  // A CommonMark autolink (`<https://...>`) is a valid, rendered link on an MDX page,
  // and `>` was not excluded from REPO_BLOB_RE's character class: the capture came out
  // as `README.md>`, `existsCaseSensitive` said false, and `docs:staleness` failed the
  // build on a link that works — the same false-positive class the `?plain=1` and
  // trailing-punctuation strips were added to prevent.
  it('resolves a CommonMark autolink citation', () => {
    const content = `see <https://github.com/foomakers/pair/blob/main/README.md>`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toEqual([])
  })

  it('still flags a dead path inside an autolink, without the delimiter in the message', () => {
    const content = `see <https://github.com/foomakers/pair/blob/main/READMEE.md>`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('READMEE.md')
    expect(errs[0]).not.toContain('>')
  })

  // GitHub percent-encodes a space in a path; the raw capture is what the READER's
  // browser decodes, so the gate must decode it before resolving against the tree.
  it('percent-decodes the path before resolving it', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/apps/website/lib/docs-staleness-check%2Ets)`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toEqual([])
  })

  it('reports a dead percent-encoded path in its DECODED form', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/docs/my%20file.md)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('docs/my file.md')
  })

  it('does not throw on a malformed percent-escape — it resolves the literal', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/100%-coverage.md)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('100%-coverage.md')
  })

  // --- REF SEGMENT ---------------------------------------------------------
  //
  // Pinning the ref to `main` meant a citation under any OTHER ref matched NOTHING and
  // shipped unchecked: `blob/mian/README.md` (a plain typo) and `blob/master/...` (the
  // other default-branch name, which this repo does not have) both 404 for the reader
  // while the gate printed PASS.
  it('flags a citation under a typo’d ref', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/mian/README.md)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('mian')
  })

  it('flags a citation under master/ even when the path itself is live', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/master/README.md)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('master')
  })

  // A permalink is DELIBERATELY pinned to an immutable ref and may well point at a
  // file `main` no longer has; the working tree cannot answer for it, so it is skipped
  // rather than failed. Skipping it is what keeps the ref widening above from breaking
  // the one legitimate non-`main` citation form.
  it('skips a sha/tag permalink instead of resolving it against the working tree', () => {
    for (const ref of ['cc1fba1', 'cc1fba122f0c912ba01288fe90ab2632e7e41057', 'v1.4.0', '0.9']) {
      const content = `[x](https://github.com/foomakers/pair/blob/${ref}/file-deleted-long-ago.md)`
      expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT), ref).toEqual([])
    }
  })

  // --- FRAGMENT (Check 5b proved the FILE, never the anchor) ---------------
  //
  // Three shipped citations carry a fragment. The file resolving says nothing about
  // where the reader lands: rename the `## Callers Matrix (Scoped Capabilities)`
  // heading and every reader is dropped at the top of a 200-line file while
  // `docs:staleness` still prints PASS.
  const SKILLS_GUIDE = '.pair/knowledge/skills-guide.md'

  it('passes a fragment that matches a real heading slug', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}#callers-matrix-scoped-capabilities)`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toEqual([])
  })

  it('flags a fragment that matches no heading in the cited file', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}#callers-matrix-renamed)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('callers-matrix-renamed')
  })

  it('validates the fragment when a query string sits before it', () => {
    const live = `[x](https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}?plain=1#callers-matrix-scoped-capabilities)`
    expect(findDeadRepoLinks(live, 'a.mdx', REPO_ROOT)).toEqual([])
    const dead = `[x](https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}?plain=1#nope)`
    expect(findDeadRepoLinks(dead, 'a.mdx', REPO_ROOT)).toHaveLength(1)
  })

  it('does not mistake a sentence full stop for part of the fragment', () => {
    const content = `see https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}#callers-matrix-scoped-capabilities.`
    expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)).toEqual([])
  })

  // GitHub's own line anchor. It is not a heading and never will be; failing it would
  // break the build on a live URL.
  it('skips a GitHub line anchor', () => {
    for (const frag of ['L203', 'L203-L210', 'L203C5-L210C9']) {
      const content = `[x](https://github.com/foomakers/pair/blob/main/${SKILLS_GUIDE}?plain=1#${frag})`
      expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT), frag).toEqual([])
    }
  })

  it('skips the fragment on tree/, raw/ and non-markdown blob targets', () => {
    for (const url of [
      'tree/main/apps/pair-cli#anything',
      'raw/main/.pair/knowledge/skills-guide.md#anything',
      'blob/main/apps/website/lib/docs-staleness-check.ts#anything',
    ]) {
      const content = `[x](https://github.com/foomakers/pair/${url})`
      expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT), url).toEqual([])
    }
  })

  // --- FRAGMENT: the spelling the READER'S ADDRESS BAR holds -----------------
  //
  // github.com percent-encodes every non-ASCII byte of an anchor in the URL it puts in
  // the address bar, which is what a reader copy-pastes into a docs page. The path was
  // decoded and the fragment was not, so a citation in its own canonical spelling
  // failed the gate: `docs:staleness` exited 1 on a link that works.
  //
  // Both files below are REAL repo files whose live anchors were read off github.com
  // (`gh api repos/foomakers/pair/contents/<path> -H 'Accept: application/vnd.github.html'`).
  const IA_ASSESSMENT =
    '.pair/adoption/decision-log/2026-07-12-docs-website-ia-restructuring-assessment.md'

  it('percent-decodes the FRAGMENT, not only the path', () => {
    // `## Option C — full Diátaxis re-org (heavier)`; github.com's anchor is
    // `#option-c--full-diátaxis-re-org-heavier`, address bar `…di%C3%A1taxis…`.
    const encoded = `[x](https://github.com/foomakers/pair/blob/main/${IA_ASSESSMENT}#option-c--full-di%C3%A1taxis-re-org-heavier)`
    expect(findDeadRepoLinks(encoded, 'a.mdx', REPO_ROOT)).toEqual([])
    const literal = `[x](https://github.com/foomakers/pair/blob/main/${IA_ASSESSMENT}#option-c--full-diátaxis-re-org-heavier)`
    expect(findDeadRepoLinks(literal, 'a.mdx', REPO_ROOT)).toEqual([])
  })

  it('still flags a dead percent-encoded fragment, reported DECODED', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/${IA_ASSESSMENT}#option-z--full-di%C3%A1taxis-re-org-heavier)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    // Decoded, not `%C3%A1` — and then escaped, because `á` is not printable ASCII.
    expect(errs[0]).toContain('option-z--full-di\\u{E1}taxis-re-org-heavier')
    expect(errs[0]).not.toContain('%C3%A1')
  })

  /**
   * LOSSLESS DIAGNOSTIC. The anchors this gate exists to get right differ from the
   * dead spelling by an INVISIBLE code point, so a message that echoes the fragment
   * raw and offers nothing else tells the developer whose build just went red that
   * the anchor is dead and gives them no way to see why — the likely outcome is that
   * they delete a fragment that works. Every code point outside printable ASCII is
   * therefore rendered `\u{…}` (and a literal backslash doubled, so the escape itself
   * cannot be spoofed), and the nearest real headings are offered.
   */
  const fixtureRoot = <T>(files: Readonly<Record<string, string>>, fn: (root: string) => T): T => {
    const root = mkdtempSync(join(tmpdir(), 'staleness-anchor-'))
    try {
      for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body)
      return fn(root)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }

  it('names the U+FE0F heading a stripped anchor was reaching for', () => {
    const dead = `[cmds](https://github.com/foomakers/pair/blob/main/CLAUDE.md#-essential-commands)`
    const errs = findDeadRepoLinks(dead, 'page.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain(
      'did you mean #\\u{FE0F}-essential-commands (copy: #\u{FE0F}-essential-commands)?',
    )
  })

  it('names the ZWJ heading a stripped anchor was reaching for', () => {
    const f = '.pair/knowledge/guidelines/quality-assurance/security/secure-development.md'
    const dead = `[x](https://github.com/foomakers/pair/blob/main/${f}#-secure-coding-standards)`
    const errs = findDeadRepoLinks(dead, 'page.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain(
      'did you mean #\\u{200D}-secure-coding-standards (copy: #\u{200D}-secure-coding-standards)?',
    )
  })

  const LOSSLESS_ROWS: ReadonlyArray<{
    heading: string
    cited: string
    actual: string
    candidate: string
    copy: string
    why: string
  }> = [
    {
      heading: '\u{FE0F} Foo',
      cited: '-foo',
      actual: '-foo',
      candidate: '\\u{FE0F}-foo',
      copy: '\u{FE0F}-foo',
      why: 'U+FE0F is zero-width: raw, the two spellings render identically',
    },
    {
      heading: '\u{200D} Foo',
      cited: '-foo',
      actual: '-foo',
      candidate: '\\u{200D}-foo',
      copy: '\u{200D}-foo',
      why: 'ZWJ, same shape as the motivating bug',
    },
    {
      heading: 'Que\u{301} Tal',
      cited: 'qu\u{E9}-tal',
      actual: 'qu\\u{E9}-tal',
      candidate: 'que\\u{301}-tal',
      copy: 'que\u{301}-tal',
      why: 'precomposed vs decomposed é — confusable, not invisible',
    },
  ]

  it('does not let a literal backslash-u spelling collide with a real escaped code point', () => {
    const errs = fixtureRoot({ 'f.md': '## \u{FE0F} Foo\n' }, root =>
      findDeadRepoLinks(
        '[x](https://github.com/foomakers/pair/blob/main/f.md#\\u{FE0F}-foo)',
        'page.mdx',
        root,
      ),
    )
    expect(errs).toHaveLength(1)
    // The literal ASCII `\u{FE0F}` doubles its backslash; the real U+FE0F heading would
    // print with ONE. 8 code points apart (`editDistance`, far past the budget of 3), so
    // no candidate is offered — but the two
    // renderings still cannot be read as the same string.
    expect(errs[0]).toContain('f.md#\\\\u{FE0F}-foo —')
    expect(errs[0]).not.toContain('f.md#\\u{FE0F}-foo —')
  })

  for (const row of LOSSLESS_ROWS) {
    it(`distinguishes actual from candidate — ${row.why}`, () => {
      const errs = fixtureRoot({ 'f.md': `## ${row.heading}\n` }, root =>
        findDeadRepoLinks(
          `[x](https://github.com/foomakers/pair/blob/main/f.md#${row.cited})`,
          'page.mdx',
          root,
        ),
      )
      expect(errs).toHaveLength(1)
      const msg = errs[0] ?? ''
      expect(msg).toContain(`f.md#${row.actual} —`)
      // BOTH forms: the escape is what makes the two spellings distinguishable on a
      // terminal, the `copy:` form is the bytes the developer actually has to paste.
      expect(msg).toContain(`did you mean #${row.candidate} (copy: #${row.copy})?`)
      expect(row.actual).not.toBe(row.candidate)
    })
  }

  /**
   * THE REPAIR ADVICE MUST WORK, applied literally. The candidate is offered to a
   * developer whose build is red; the only proof that the hint is a fix rather than a
   * dead end is to take the string the message tells them to copy, put it back in the
   * citation, and re-run the real gate. Before the `copy:` form existed the escape was
   * the ONLY spelling on offer, and typing it (`#\u{FE0F}-essential-commands`, ASCII)
   * left the developer redder than before: still dead, and now 8 code points from the
   * real slug (`editDistance`, against a budget of 3), so not even a candidate came back.
   */
  const copySuggestion = (msg: string): string => {
    const m = /\(copy: #(.*?)\)\?/.exec(msg)
    if (m?.[1] === undefined) throw new Error(`no copy suggestion in: ${msg}`)
    return m[1]
  }

  for (const row of LOSSLESS_ROWS) {
    it(`the copied candidate RESOLVES — ${row.why}`, () => {
      const errs = fixtureRoot({ 'f.md': `## ${row.heading}\n` }, root => {
        const first = findDeadRepoLinks(
          `[x](https://github.com/foomakers/pair/blob/main/f.md#${row.cited})`,
          'page.mdx',
          root,
        )
        const copied = copySuggestion(first[0] ?? '')
        return {
          copied,
          after: findDeadRepoLinks(
            `[x](https://github.com/foomakers/pair/blob/main/f.md#${copied})`,
            'page.mdx',
            root,
          ),
        }
      })
      expect(errs.copied).toBe(row.copy)
      expect(errs.after).toEqual([])
    })
  }

  it('the copied candidate RESOLVES for the real VS16 heading in CLAUDE.md', () => {
    const dead = findDeadRepoLinks(
      '[x](https://github.com/foomakers/pair/blob/main/CLAUDE.md#-essential-commands)',
      'page.mdx',
      REPO_ROOT,
    )
    expect(dead).toHaveLength(1)
    const copied = copySuggestion(dead[0] ?? '')
    expect(
      findDeadRepoLinks(
        `[x](https://github.com/foomakers/pair/blob/main/CLAUDE.md#${copied})`,
        'page.mdx',
        REPO_ROOT,
      ),
    ).toEqual([])
  })

  it('adds no copy form when the candidate is already printable ASCII', () => {
    const errs = fixtureRoot({ 'f.md': '## Alpha\n' }, root =>
      findDeadRepoLinks(
        '[x](https://github.com/foomakers/pair/blob/main/f.md#alpha-x)',
        'page.mdx',
        root,
      ),
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('did you mean #alpha?')
    expect(errs[0]).not.toContain('copy:')
  })

  /**
   * The dedup rule reaching the GATE, not just the slug set. github.com anchors the
   * 4th heading of `## Foo` / `## Foo 1` / `## Foo` / `## Foo` as `foo-3`; a per-base
   * counter never emits `foo-3` at all, so `docs:staleness` exited 1 on a live URL —
   * and, mirrored, called `#foo-1` (which github gives to `Foo 1`) a fine citation
   * for the 3rd heading, dropping the reader on the wrong section while printing PASS.
   */
  const DEDUP_FIXTURE = ['## Foo', '## Foo 1', '## Foo', '## Foo'].map(h => `${h}\n`).join('\n')

  it('accepts the live #foo-3 a skip-until-free run produces', () => {
    const errs = fixtureRoot({ 'f.md': DEDUP_FIXTURE }, root =>
      findDeadRepoLinks(
        '[x](https://github.com/foomakers/pair/blob/main/f.md#foo-3)',
        'page.mdx',
        root,
      ),
    )
    expect(errs).toEqual([])
  })

  it('accepts every anchor github.com serves for that file, and nothing more', () => {
    const errs = fixtureRoot({ 'f.md': DEDUP_FIXTURE }, root => ({
      live: ['foo', 'foo-1', 'foo-2', 'foo-3'].flatMap(f =>
        findDeadRepoLinks(
          `[x](https://github.com/foomakers/pair/blob/main/f.md#${f})`,
          'page.mdx',
          root,
        ),
      ),
      dead: findDeadRepoLinks(
        '[x](https://github.com/foomakers/pair/blob/main/f.md#foo-4)',
        'page.mdx',
        root,
      ),
    }))
    expect(errs.live).toEqual([])
    expect(errs.dead).toHaveLength(1)
  })

  /**
   * PROXIMITY IS RELATIVE TO LENGTH, not an absolute 3 edits. An absolute bound makes
   * every 3-character slug in a file "near" any 3-character fragment — 100% of the
   * code points differ and it is still offered. That turns the hint into the very bug
   * the fragment half of Check 5b exists to catch: told `#cli` → "did you mean #api?",
   * a developer writes a citation that RESOLVES, the gate prints PASS, and the reader
   * lands on an unrelated section. A candidate must be within `MAX_ANCHOR_DISTANCE`
   * AND within half the longer string.
   *
   * The old guard row (`## Completely Unrelated Heading` vs `#zzz`) could not pin this:
   * it passed on LENGTH alone (29 vs 3), not because the rule rejects an unrelated
   * candidate. Every row below is length-controlled.
   */
  const PROXIMITY_ROWS: ReadonlyArray<{
    headings: readonly string[]
    fragment: string
    hint: string | null
    why: string
  }> = [
    {
      headings: ['## Zzy'],
      fragment: 'abc',
      hint: null,
      why: 'EQUAL length, every code point differs — 3 edits over 3 chars is not "near"',
    },
    {
      headings: ['## Cat', '## Dog', '## Elk'],
      fragment: 'zzz',
      hint: null,
      why: 'the reviewer-probed case: three unrelated 3-char headings, none offered',
    },
    { headings: ['## Bar'], fragment: 'foo', hint: null, why: 'the 1-heading form of it' },
    {
      headings: ['## Api'],
      fragment: 'apo',
      hint: '#api',
      why: 'a REAL short typo is still offered — 1 edit is within half of 3',
    },
    {
      headings: ['## Getting Started'],
      fragment: 'getting-startd',
      hint: '#getting-started',
      why: 'a long slug tolerates the full absolute budget',
    },
    {
      headings: ['## Getting Started'],
      fragment: 'getting-startedxyz',
      hint: '#getting-started',
      why: '3 edits over 18 code points: at MAX_ANCHOR_DISTANCE, well inside half',
    },
    {
      headings: ['## Getting Started'],
      fragment: 'getting-startedwxyz',
      hint: null,
      why: '4 edits — the absolute bound still caps a long string',
    },
    {
      headings: ['## Completely Unrelated Heading'],
      fragment: 'zzz',
      hint: null,
      why: 'the original guard row, kept: length alone already excludes it',
    },
  ]

  for (const row of PROXIMITY_ROWS) {
    it(`anchor proximity — ${row.why}`, () => {
      const errs = fixtureRoot({ 'f.md': row.headings.map(h => `${h}\n`).join('\n') }, root =>
        findDeadRepoLinks(
          `[x](https://github.com/foomakers/pair/blob/main/f.md#${row.fragment})`,
          'page.mdx',
          root,
        ),
      )
      expect(errs).toHaveLength(1)
      const msg = errs[0] ?? ''
      if (row.hint === null) {
        expect(msg).toBe(
          `Dead anchor in repo citation in page.mdx: f.md#${row.fragment} — no heading in that file slugs to it`,
        )
      } else {
        expect(msg).toContain(`did you mean ${row.hint}?`)
      }
    })
  }

  it('offers at most three candidates, nearest first', () => {
    const errs = fixtureRoot(
      {
        'f.md': ['## Alpha', '## Alphb', '## Alphc', '## Alphd', '## Zulu']
          .map(h => `${h}\n`)
          .join('\n'),
      },
      root =>
        findDeadRepoLinks(
          '[x](https://github.com/foomakers/pair/blob/main/f.md#alph)',
          'page.mdx',
          root,
        ),
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('did you mean #alpha or #alphb or #alphc?')
  })

  /**
   * The one remaining unguarded filesystem read on the citation path. A `.md` path that
   * resolves to a DIRECTORY passes `existsCaseSensitive` and the extension test, and the
   * read then threw EISDIR with a raw stack trace out of the gate. github.com serves
   * such a `blob/main/<dir>` URL as a tree listing, so an error rather than a crash is
   * also the honest verdict — and it is the standard the file already applies one
   * function up (`decodeOrLiteral`: never an exception out of a docs gate).
   */
  it('reports, never throws, when a cited .md path is a directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-eisdir-'))
    try {
      mkdirSync(join(root, 'docs', 'weird.md'), { recursive: true })
      const cite = `[a](https://github.com/foomakers/pair/blob/main/docs/weird.md#x)`
      expect(() => findDeadRepoLinks(cite, 'p.mdx', root)).not.toThrow()
      expect(findDeadRepoLinks(cite, 'p.mdx', root)).toEqual([
        'Dead anchor in repo citation in p.mdx: docs/weird.md#x — not a readable markdown file',
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  /**
   * END TO END on the live URL the gate used to break the build on: an ATX heading
   * nested in a list item (`apps/pair-cli/CHANGELOG.md:100`). github.com serves 36
   * anchors for that file and this citation resolves in a browser; the gate computed 35
   * and returned "no heading in that file slugs to it" — exit 1, with no `did you mean`
   * hint to walk it back. Four more CHANGELOGs ship the same shape.
   */
  it.each([
    'apps/pair-cli/CHANGELOG.md',
    'packages/content-ops/CHANGELOG.md',
    'packages/knowledge-hub/CHANGELOG.md',
    'tools/eslint-config/CHANGELOG.md',
    'tools/prettier-config/CHANGELOG.md',
  ])('resolves the list-item release heading cited from %s', file => {
    const url = `https://github.com/foomakers/pair/blob/main/${file}#release-v020---enhanced-cli-distribution--documentation`
    expect(findDeadRepoLinks(`[chg](${url})`, 'pm-tools/index.mdx', REPO_ROOT)).toEqual([])
  })

  /**
   * ...and the mirror direction, on the shape that used to PASS: a heading inside a raw
   * `<div>` is not a heading on github.com, so a citation to it 404s for every reader —
   * the silent wrong-destination anchor Check 5b exists to catch.
   */
  it('flags a citation to a heading that only exists inside an HTML block', () => {
    const root = mkdtempSync(join(tmpdir(), 'docs-htmlblock-'))
    try {
      mkdirSync(join(root, 'docs'), { recursive: true })
      writeFileSync(join(root, 'docs', 'x.md'), '# Doc\n\n<div>\n## InDiv\n</div>\n\n## Real\n')
      const cite = `[a](https://github.com/foomakers/pair/blob/main/docs/x.md#indiv)`
      expect(findDeadRepoLinks(cite, 'p.mdx', root)).toEqual([
        'Dead anchor in repo citation in p.mdx: docs/x.md#indiv — no heading in that file slugs to it',
      ])
      const live = `[a](https://github.com/foomakers/pair/blob/main/docs/x.md#real)`
      expect(findDeadRepoLinks(live, 'p.mdx', root)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not throw on a malformed percent-escape in the fragment', () => {
    const content = `[x](https://github.com/foomakers/pair/blob/main/${IA_ASSESSMENT}#100%-coverage)`
    const errs = findDeadRepoLinks(content, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('100%-coverage')
  })

  // The two halves compose: CLAUDE.md:59 `## 🛠️ Essential Commands` is anchored
  // `#%EF%B8%8F-essential-commands` — decoding the fragment gets U+FE0F back, and the
  // slug must have KEPT U+FE0F for it to land. 276 repo headings carry one of these.
  it('resolves a variation-selector anchor in the spelling github.com serves', () => {
    const live = `[cmds](https://github.com/foomakers/pair/blob/main/CLAUDE.md#%EF%B8%8F-essential-commands)`
    expect(findDeadRepoLinks(live, 'page.mdx', REPO_ROOT)).toEqual([])
  })

  it('flags the variation-selector-STRIPPED anchor, which is a real 404', () => {
    const dead = `[cmds](https://github.com/foomakers/pair/blob/main/CLAUDE.md#-essential-commands)`
    expect(findDeadRepoLinks(dead, 'page.mdx', REPO_ROOT)).toHaveLength(1)
  })

  it('resolves a ZWJ anchor github.com keeps but github-slugger drops', () => {
    const f = '.pair/knowledge/guidelines/quality-assurance/security/secure-development.md'
    const live = `[x](https://github.com/foomakers/pair/blob/main/${f}#%E2%80%8D-secure-coding-standards)`
    expect(findDeadRepoLinks(live, 'page.mdx', REPO_ROOT)).toEqual([])
  })

  // --- THE RENDERED SURFACE -------------------------------------------------
  //
  // A repo URL github.com renders as LITERAL TEXT is not a citation, and gating it
  // broke the build on strings no reader can click. Through the REAL gate on the real
  // tree, before this: a ```bash fence holding `gh api …/blob/main/does/not/exist.md`
  // plus a prose code span holding …/also/missing.md gave `FAIL — 2 issues`, and the
  // page teaching this gate's OWN ref rule (``Never write `…/blob/master/README.md` —
  // use main``) gave `FAIL — 1 issue · Bad ref in repo citation`.
  //
  // Every row's expectation is the REAL CONSUMER's `<a href>` count for the same bytes:
  // a probe page built with `pnpm --filter @pair/website build`, counted in the
  // prerendered `.next/server/app/docs/__link-surface-probe.html`. The docs site is
  // `.mdx` rendered by fumadocs, and it DISAGREES with github.com on two rows — a
  // 4-space-indented line (MDX has no indented code: the URL is live) and `<pre>`
  // content (JSX children, markdown-processed) — so assuming CommonMark would have been
  // wrong in the silent direction, skipping a live 404.
  const DEAD = 'https://github.com/foomakers/pair/blob/main/does/not/exist.md'

  const SURFACE_ROWS: ReadonlyArray<{ why: string; content: string; hrefs: number }> = [
    { why: 'prose, bare (GFM autolink)', content: `see ${DEAD} there`, hrefs: 1 },
    { why: 'a markdown link destination', content: `[x](${DEAD})`, hrefs: 1 },
    { why: 'an inline code span', content: `never write \`${DEAD}\` here`, hrefs: 0 },
    { why: 'a fenced code block', content: `\`\`\`bash\ngh api ${DEAD}\n\`\`\`\n`, hrefs: 0 },
    { why: 'a fenced block with no info string', content: `\`\`\`\n${DEAD}\n\`\`\`\n`, hrefs: 0 },
    {
      why: 'a 4-space-indented line — MDX has NO indented code',
      content: `text\n\n    ${DEAD}\n`,
      hrefs: 1,
    },
    { why: 'a {/* JSX comment */}', content: `{/* ${DEAD} */}\n`, hrefs: 0 },
    // `<!-- … -->` is ordinary text under the `mdx` flavour and IS scanned. A page
    // carrying one cannot build at all — `pnpm --filter @pair/website build` fails with
    // "Unexpected character `!` … use `{/* text */}`" — so either answer is moot, and
    // reporting is the non-silent one.
    { why: 'an HTML comment (unbuildable in MDX)', content: `<!--\n${DEAD}\n-->\n`, hrefs: 1 },
    { why: 'a <div> block, blank-separated', content: `<div>\n\n${DEAD}\n\n</div>\n`, hrefs: 1 },
    { why: 'a <div> block, tight', content: `<div>\n${DEAD}\n</div>\n`, hrefs: 1 },
    {
      why: 'a <div> block, as an href attribute',
      content: `<div>\n<a href="${DEAD}">x</a>\n</div>\n`,
      hrefs: 1,
    },
    {
      why: 'bare inside a <pre> block — JSX children, not preformatted',
      content: `<pre>\n${DEAD}\n</pre>\n`,
      hrefs: 1,
    },
    { why: 'bare inside a <span> (§ 4.6 kind 7)', content: `<span>${DEAD}</span>\n`, hrefs: 1 },
    { why: 'bare inside a JSX component', content: `<Callout>${DEAD}</Callout>\n`, hrefs: 1 },
    {
      why: 'a FENCE inside a <div> — MDX parses JSX children as markdown',
      content: `<div>\n\`\`\`bash\n${DEAD}\n\`\`\`\n</div>\n`,
      hrefs: 0,
    },
    {
      why: 'a CODE SPAN inside a <div> — still a code span',
      content: `<div>\n\`${DEAD}\`\n</div>\n`,
      hrefs: 0,
    },
    { why: 'a link inside a list item', content: `- item [x](${DEAD})\n`, hrefs: 1 },
    { why: 'a link inside a blockquote', content: `> quoted [x](${DEAD})\n`, hrefs: 1 },
    {
      why: 'a fence inside a LIST ITEM',
      content: `- item\n\n  \`\`\`bash\n  ${DEAD}\n  \`\`\`\n`,
      hrefs: 0,
    },
    {
      why: 'a fence inside a BLOCKQUOTE',
      content: `> \`\`\`bash\n> ${DEAD}\n> \`\`\`\n`,
      hrefs: 0,
    },
    // BOTH masked constructs are MULTI-LINE on the real renderer, and the surface used
    // to be masked one leaf line at a time — so a span or a comment that WRAPPED was
    // never masked and its URL was gated as a live link. The multi-line `{/* … */}` is
    // THE canonical MDX way to comment something out, which is exactly when a URL sits
    // in one. Site oracle, same probe page, same count: the multi-line span renders
    // `<code>` (0 `<a href>`) and the multi-line comment is stripped from the payload
    // entirely (0 occurrences of its path anywhere in the prerendered HTML).
    {
      why: 'a code span WRAPPING a newline',
      content: `Text \`${DEAD}\nand more\` end.\n`,
      hrefs: 0,
    },
    {
      why: 'a {/* JSX comment */} WRAPPING newlines',
      content: `{/* see\n${DEAD}\n*/}\n`,
      hrefs: 0,
    },
    // Paired direction: masking a multi-line construct must stop at its CLOSE, not
    // swallow the live link that follows it. Site: 0 `<a href>` for the span's URL, 1
    // for the link's.
    {
      why: 'a live link AFTER a closed multi-line code span',
      content: `Text \`${DEAD.replace('does', 'closed')}\nand more\` end.\n\n[x](${DEAD})\n`,
      hrefs: 1,
    },
  ]

  // INTERACTION — a code span and a JSX comment are two masking rules whose OPENER is
  // valid text inside the other, so neither can be applied to the whole surface before
  // the other. Both directions measured on the same probe page, `<a href>` counted in
  // the prerendered HTML: whichever construct OPENS FIRST wins, and an opener that
  // never closes is literal text, not a mask.
  const INTERACTION_ROWS: ReadonlyArray<{ why: string; content: string; hrefs: number }> = [
    {
      // A backtick inside a comment must NOT pair with a stray backtick after it —
      // that would blank the live URL between them (a silent miss). Site: 1.
      why: 'a backtick inside a JSX comment does not open a span over what follows',
      content: `{/* a comment with a \` backtick */}\n\nBare: ${DEAD}\n\nAnd a stray \` here.\n`,
      hrefs: 1,
    },
    {
      // Mirror: `{/*` inside a code span must NOT open a comment that runs to a later
      // `*/}` in another span. Site: 1.
      why: 'a {/* inside a code span does not open a comment over what follows',
      content: `Text \`{/*\` end.\n\nBare: ${DEAD}\n\nText \`*/}\` end.\n`,
      hrefs: 1,
    },
    {
      // Nesting the other way: the span opens first, so the comment inside it is text.
      why: 'a JSX comment nested INSIDE a code span',
      content: `Text \`${DEAD} {/* x */}\` end.\n`,
      hrefs: 0,
    },
    // BLOCK-LOCAL MASKING. A code span cannot cross a blank line on the real
    // renderer, so an opener in one block must not pair with a closer in another and
    // blank every live URL in between — a SILENT false-green, the direction the ADL
    // calls the worse one. Proven on the site oracle: a probe page with two stray
    // backticks in separate blocks and three URLs between them prerenders all three
    // as <a href>. The masking is therefore grouped by real block (readMarkdown's
    // blockStart), never over the joined document and never by the paragraph
    // accumulator — which is reset one line late and is not the boundary.
    {
      why: 'two stray backticks in SEPARATE blocks do not span the live URL between them',
      content: `A stray \` backtick.\n\nBare: ${DEAD}\n\nAnother stray \` backtick.\n`,
      hrefs: 1,
    },
    {
      why: 'a link destination between two block-separated stray backticks is still checked',
      content: `Cost is 5\` wide.\n\n[x](${DEAD})\n\nUse \`pnpm\` here.\n`,
      hrefs: 1,
    },
    {
      // Mirror direction: the same for `{/*` — an unterminated opener in one block
      // must not comment out a later block.
      why: 'an unterminated {/* in one block does not comment out a later block',
      content: `Text {/* opener.\n\nBare: ${DEAD}\n\nText */} closer.\n`,
      hrefs: 1,
    },
    {
      // The multi-line cases that motivated joining the surface in the first place
      // must keep working: both constructs may still wrap a newline WITHIN one block.
      why: 'a code span still wraps a newline inside ONE block',
      content: `Text \`${DEAD}\nand more\` end.\n`,
      hrefs: 0,
    },
    {
      why: 'a {/* … */} still wraps newlines inside ONE block',
      content: `{/* TODO re-enable:\n${DEAD}\n*/}\n`,
      hrefs: 0,
    },
    // A block boundary is NOT always a blank line. An ATX heading interrupts a
    // paragraph with no blank line between them, and it is the only interrupting line
    // that can itself carry a URL — so a stray backtick in the paragraph must not
    // reach into the heading and blank the citation there.
    {
      why: 'a stray backtick in a paragraph does not reach into a TIGHT ATX heading',
      content: `Cost is 5\` wide.\n## See ${DEAD} \` end\n`,
      hrefs: 1,
    },
    {
      why: 'the reverse direction: a tight ATX heading does not reach into the paragraph after it',
      content: `## Heading with a stray \` backtick\nBare: ${DEAD} and a \` here.\n`,
      hrefs: 1,
    },
    {
      // A setext underline is the LAST line of the heading it underlines, not a new
      // block: a code span opened on the heading text still closes on that same line.
      why: 'a code span across a setext heading text and its underline stays ONE block',
      content: `Text \`${DEAD}\nand more\`\n===\n`,
      hrefs: 0,
    },
    // WHICH LINES REALLY START A BLOCK. The boundary the masking groups by is the
    // reader's `blockStart`, and the rows below enumerate the line shapes that can carry
    // a URL against an OPEN paragraph — the ATX heading above is not the only one, and
    // the split is wrong in BOTH directions. Every count is the site's, one probe row
    // per line shape in one page (`pnpm --filter @pair/website build`, `<a href>` counted
    // in the prerendered `.next/server/app/docs/__blockstart-probe.html`): 1 means the
    // two stray backticks did NOT pair, so the line really began a block; 0 means they
    // did, so it did not.
    {
      // A 4-space-indented line cannot interrupt a paragraph on EITHER renderer (MDX has
      // no indented code at all, and § 4.4 code needs an empty paragraph), so the code
      // span runs across it. Splitting there gates text no reader can click.
      why: 'a paragraph continued on a 4-space-indented line',
      content: `Cost is 5\` wide.\n    See ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      // `openContainers` REFUSES to open a list whose marker cannot interrupt, so this
      // line is paragraph text — on the site as in the reader's own state.
      why: 'a paragraph continued on a non-interrupting `2.` marker',
      content: `Cost is 5\` wide.\n2. See ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      why: 'a paragraph continued on a non-interrupting `2)` marker',
      content: `Cost is 5\` wide.\n2) See ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      why: 'two consecutive 4-space-indented lines — ONE paragraph under MDX',
      content: `    Cost is 5\` wide.\n    See ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      why: 'a paragraph whose MIDDLE line is 4-space-indented',
      content: `Cost is 5\` wide.\n    mid line\nSee ${DEAD} \` end\n`,
      hrefs: 0,
    },
    // ...and the interrupt partners, which DO start a block: the same bytes with a
    // marker that opens its container, a break, or a JSX element.
    {
      why: 'an interrupting `1.` marker, which does start a list',
      content: `Cost is 5\` wide.\n1. See ${DEAD} \` end\n`,
      hrefs: 1,
    },
    {
      why: 'a bullet marker, which always interrupts',
      content: `Cost is 5\` wide.\n- See ${DEAD} \` end\n`,
      hrefs: 1,
    },
    {
      why: 'a block quote marker, which opens its container',
      content: `Cost is 5\` wide.\n> See ${DEAD} \` end\n`,
      hrefs: 1,
    },
    {
      why: 'a tight thematic break',
      content: `Cost is 5\` wide.\n***\nSee ${DEAD} \` end\n`,
      hrefs: 1,
    },
    {
      why: 'a plain paragraph continuation, which does NOT start a block',
      content: `Cost is 5\` wide.\nSee ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      why: 'a lazy continuation of a block quote paragraph',
      content: `> Cost is 5\` wide.\nSee ${DEAD} \` end\n`,
      hrefs: 0,
    },
    {
      why: 'a blank line before a 4-space-indented line, which does start a block',
      content: `Cost is 5\` wide.\n\n    See ${DEAD} \` end\n`,
      hrefs: 1,
    },
    // A JSX ELEMENT ends the paragraph on this renderer — all three of them, not just
    // the § 4.6 type-6 tags. `<span>` and a component are type 7 on github.com, where
    // they cannot interrupt a paragraph; MDX has no such rule and the site proves it.
    // Reading them as continuations lets the paragraph's stray backtick reach into the
    // element and blank a citation the site serves — the SILENT direction.
    {
      why: 'a <div> element tight against a paragraph',
      content: `Cost is 5\` wide.\n<div>\nSee ${DEAD} \` end\n</div>\n`,
      hrefs: 1,
    },
    {
      why: 'a <span> element tight against a paragraph',
      content: `Cost is 5\` wide.\n<span>\nSee ${DEAD} \` end\n</span>\n`,
      hrefs: 1,
    },
    {
      why: 'a JSX component tight against a paragraph',
      content: `Cost is 5\` wide.\n<Callout>\nSee ${DEAD} \` end\n</Callout>\n`,
      hrefs: 1,
    },
    // A GFM TABLE is ONE reader block but N INLINE SCOPES on the site: every cell is
    // parsed on its own, so a backtick in one cell never pairs with a backtick in
    // another. Masking the whole table as one scope blanks the citation between them and
    // the gate reports PASS on a live dead link — a false GREEN, and pre-existing.
    {
      why: 'a table cell between two backticks in OTHER cells of the same row',
      content: `| A | B |\n| --- | --- |\n| x \` ${DEAD} | \` y |\n`,
      hrefs: 1,
    },
    {
      why: 'a table cell between two backticks in cells of DIFFERENT rows',
      content: `| A \` | B |\n| --- | --- |\n| ${DEAD} | \` y |\n`,
      hrefs: 1,
    },
    {
      why: 'a table row that INTERRUPTS the paragraph above it',
      content: `Cost is 5\` wide.\n| A | B |\n| --- | --- |\n| See ${DEAD} \` | b |\n`,
      hrefs: 1,
    },
    {
      why: 'a plain table cell holding a citation, no backticks anywhere',
      content: `| A | B |\n| --- | --- |\n| ${DEAD} | b |\n`,
      hrefs: 1,
    },
  ]

  // --- BACKTICK RUN LENGTH (CommonMark § 6.1) --------------------------------
  //
  // A code span's closer must be a backtick run of EXACTLY the opener's length; a run
  // of 2 cannot close a run of 1. The shipped mask closes on a BACKREFERENCE, so an
  // opener of N pairs with the FIRST N backticks of any LONGER run — it blanks the URL
  // between them and the gate prints PASS on a live 404. The direction is always the
  // silent one: every disagreement below is the gate reporting FEWER errors than the
  // page has clickable dead links, never a false build break.
  //
  // Run lengths are written out (`x1`, `x2`, `x3` of U+0060) because one, two and three
  // backticks in a fixture string are visually confusable and the whole table turns on
  // telling them apart.
  //
  // Every count is the REAL CONSUMER's, measured twice on the same bytes and agreeing
  // on every row:
  //   MDX — the site's own installed pipeline, `@mdx-js/mdx@3.1.1` compiled with
  //         `remark-gfm@4.0.1`, counting `href:` in the emitted JSX (ADL 2026-09-04:
  //         the site build is this surface's oracle);
  //   GH  — `jq -Rs '{text:.}' row.mdx | gh api -X POST /markdown --input -`,
  //         counting `href="<url>"`.
  const CODE_SPAN_RUN_ROWS: ReadonlyArray<{ why: string; content: string; hrefs: number }> = [
    {
      // THE DEFECT. Opener x1, and the only later runs are x2 — nothing can close it,
      // so the backtick is literal text and the citation is live.
      why: 'an opener run of x1 whose only later run is x2 — it never closes',
      content: `Use a \` here, see [dead](${DEAD}) and \`\`double\`\` too.`,
      hrefs: 1,
    },
    {
      // Same shape through GFM's bare literal autolink, the other way a citation reaches
      // a reader.
      why: 'the same x1-then-x2 shape around a BARE (GFM autolink) citation',
      content: `Use a \` here, see ${DEAD} and \`\`double\`\` too.`,
      hrefs: 1,
    },
    {
      // Nearest continuing partner: the same opener with a real x1 closer after the URL.
      why: 'an opener run of x1 closed by a later run of x1',
      content: `Use a \` here, see [dead](${DEAD}) and \` too.`,
      hrefs: 0,
    },
    {
      why: 'an opener run of x2 whose only later run is x1 — it never closes',
      content: `Use a \`\`double here, see [dead](${DEAD}) and \` single too.`,
      hrefs: 1,
    },
    {
      why: 'an opener run of x2 closed by a later run of x2',
      content: `Use a \`\`double here, see [dead](${DEAD}) and \`\`close\`\` too.`,
      hrefs: 0,
    },
    {
      why: 'an opener run of x3 whose only later run is x2 — it never closes',
      content: `Use a \`\`\`triple here, see [dead](${DEAD}) and \`\`two\`\` too.`,
      hrefs: 1,
    },
    {
      // The x2 run is SKIPPED, not treated as a closer, and the x3 after it closes.
      why: 'an opener run of x3 that skips an x2 run and closes on a later x3',
      content: `Use a \`\`\`triple here, see [dead](${DEAD}) and \`\`two\`\` and \`\`\`close\`\`\` too.`,
      hrefs: 0,
    },
    {
      // The paired direction of row 1, one byte apart: the x1 inside ``a`b`` IS a valid
      // length-1 closer, so the SAME opener that was literal above opens a real span
      // here and the citation is code, not a link.
      why: 'an opener run of x1 closed by the x1 INSIDE a later x2-delimited span',
      content: `Use a \` here, see [dead](${DEAD}) and \`\`a\`b\`\` too.`,
      hrefs: 0,
    },
    {
      why: 'an opener run of x1 that skips two x2 runs and closes on a far x1',
      content: `Use a \` here and \`\`two\`\` then [dead](${DEAD}) then \` end.`,
      hrefs: 0,
    },
    {
      why: 'an opener run of x2 that skips an x1 run and closes on a later x2',
      content: `Use a \`\` here and \` then [dead](${DEAD}) then \`\` end.`,
      hrefs: 0,
    },
    {
      // Boundary: no following run at all. This is the one case the shipped rule
      // already gets right, and the module comment states as if it were the whole rule.
      why: 'an opener run of x1 with no further backtick anywhere',
      content: `Use a \` here, see [dead](${DEAD}) and no more ticks.`,
      hrefs: 1,
    },
    {
      why: 'no backtick anywhere (control)',
      content: `Plain, see [dead](${DEAD}) and nothing else.`,
      hrefs: 1,
    },
    // INTERACTION — run length is an input to the two rules that already share this
    // surface, so the cross-product rows are the ones that decide a live citation.
    {
      // The masks interleave positionally, so WHICH construct opens first depends on
      // whether the x1 opener is a span at all. It is not (its only later runs are x2),
      // so the comment opens first, is blanked, and the scan resumes on a live URL.
      why: 'a literal x1 backtick BEFORE a {/* comment */}, with an x2 span after the citation',
      content: `A stray \` then {/* c */} then [dead](${DEAD}) and \`\`d\`\` end.`,
      hrefs: 1,
    },
    {
      // A table row is N inline scopes, so per-cell masking already stops a backtick in
      // one cell reaching another — it does NOT help when the whole shape is in ONE cell.
      why: 'the x1-then-x2 shape entirely INSIDE one table cell',
      content: `| A | B |\n| --- | --- |\n| x \` [dead](${DEAD}) \`\`d\`\` | b |\n`,
      hrefs: 1,
    },
    {
      // Block-local masking already covers the across-blocks spelling; it is the
      // WITHIN-one-block spelling above that is open, and these two are one blank line
      // apart. Kept as the continuing partner so the two nets stay distinguishable.
      why: 'the same x1 and x2 runs split across blocks, which block-locality already covers',
      content: `A stray \` backtick.\n\nBare: ${DEAD}\n\nUse \`\`dbl\`\` there.\n`,
      hrefs: 1,
    },
  ]

  for (const { why, content, hrefs } of [
    ...SURFACE_ROWS,
    ...INTERACTION_ROWS,
    ...CODE_SPAN_RUN_ROWS,
  ]) {
    it(`${hrefs === 0 ? 'ignores' : 'checks'} a dead repo URL in ${why}`, () => {
      expect(findDeadRepoLinks(content, 'a.mdx', REPO_ROOT), why).toHaveLength(hrefs)
    })
  }

  // The self-defeating mirror: the reference page that teaches the ref rule must be
  // able to spell the counter-example the rule is about.
  it('lets a page quote the bad-ref counter-example it is teaching', () => {
    const teaching =
      'Never write `https://github.com/foomakers/pair/blob/master/README.md` — use main.'
    expect(findDeadRepoLinks(teaching, 'a.mdx', REPO_ROOT)).toEqual([])
    const live = '[x](https://github.com/foomakers/pair/blob/master/README.md)'
    const errs = findDeadRepoLinks(live, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('Bad ref in repo citation')
  })

  // INTERACTION: a code span may sit INSIDE a link, where the SAME URL is both literal
  // text and a live destination. github.com serves exactly one `<a href>` for it, so
  // masking the span must not erase the destination and must not double-count it.
  it('reports a code span inside a link exactly once — the destination', () => {
    const url = 'https://github.com/foomakers/pair/blob/main/nope.md'
    const errs = findDeadRepoLinks(`[\`${url}\`](${url})`, 'a.mdx', REPO_ROOT)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('nope.md')
  })

  // --- THE PATH HALF, REPORTED LOSSLESSLY -----------------------------------
  //
  // The motivating bug of this whole check is a PATH bug, and the path half used to
  // print the whole path as wrong with no candidate — while the walk knew the failing
  // segment and its parent's real listing.
  it('names the failing SEGMENT and the spelling that resolves', () => {
    const miscased = ADR.replace('/adr/', '/ADR/')
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/${miscased})`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toEqual([
      `Dead repo-file citation in a.mdx: ${miscased} does not exist in the repo (segment "ADR"); did you mean ${ADR}?`,
    ])
  })

  // Paired direction, and the trap `suggestionBudget` exists to close: advice offered
  // from far away makes the gate pass while the citation still points elsewhere.
  it('offers NO candidate when no sibling is near', () => {
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/.pair/zzzz/x.md)`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toEqual([
      'Dead repo-file citation in a.mdx: .pair/zzzz/x.md does not exist in the repo (segment "zzzz")',
    ])
  })

  // LOSSLESS on the path half too: a segment differing only by a confusable code point
  // printed IDENTICALLY to the real one, so the message read as a false positive.
  it('escapes a path segment that differs by an invisible code point', () => {
    const cited = '.pair/knowledge/skills‐guide.md' // U+2010 HYPHEN, not ASCII `-`
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/${cited})`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('skills\\u{2010}guide.md does not exist in the repo')
    expect(errs[0]).toContain('did you mean .pair/knowledge/skills-guide.md?')
  })

  // INTERACTION with the fragment half: a citation wrong in BOTH halves reports the
  // PATH once, not one error per half — the anchor cannot be checked in a file that
  // does not exist.
  it('reports only the path error when both halves are wrong', () => {
    const miscased = ADR.replace('/adr/', '/ADR/')
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/${miscased}#no-such-heading)`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('does not exist in the repo')
    expect(errs[0]).not.toContain('Dead anchor')
  })

  // The suggestion is spliced at the depth the walk STOPPED at, not at the first
  // occurrence of the failing segment's NAME. `apps/website/apps/x.md` fails on its
  // THIRD segment; re-finding `apps` by name rewrote the FIRST one and offered
  // `app/website/apps/x.md` — a path that resolves no better than the one cited, and
  // one the developer never wrote. The contract this check states is that the offered
  // spelling is the one that resolves.
  it('splices the suggestion at the segment that FAILED, not a namesake before it', () => {
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/apps/website/apps/x.md)`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toEqual([
      'Dead repo-file citation in a.mdx: apps/website/apps/x.md does not exist in the repo (segment "apps"); did you mean apps/website/app/x.md?',
    ])
  })

  // …and applying the offered bytes has to actually resolve. Same repeated name, a
  // sibling that IS the answer: `apps/website/Lib/…` -> `apps/website/lib/…`, and the
  // rewritten citation passes the check that just rejected it.
  it('offers a repeated-segment spelling that turns the check green', () => {
    const cited = 'apps/website/Lib/docs-staleness-check.ts'
    const errs = findDeadRepoLinks(
      `[x](https://github.com/foomakers/pair/blob/main/${cited})`,
      'a.mdx',
      REPO_ROOT,
    )
    expect(errs).toHaveLength(1)
    const suggested = errs[0]?.match(/did you mean (.+)\?$/)?.[1] ?? ''
    expect(suggested).toBe('apps/website/lib/docs-staleness-check.ts')
    expect(
      findDeadRepoLinks(
        `[x](https://github.com/foomakers/pair/blob/main/${suggested})`,
        'a.mdx',
        REPO_ROOT,
      ),
    ).toEqual([])
  })

  // A `..` is RFC 3986 dot-segment removal — what the reader's client does before the
  // request is sent — so one that collapses back resolves and one that ESCAPES the
  // repo is dead. `curl -v .../blob/main/../../etc/passwd` puts
  // `GET /foomakers/pair/etc/passwd` on the wire: HTTP 404.
  it('resolves a collapsing `..` and reports an escaping one', () => {
    const collapsing = `[x](https://github.com/foomakers/pair/blob/main/.pair/knowledge/../knowledge/skills-guide.md)`
    expect(findDeadRepoLinks(collapsing, 'a.mdx', REPO_ROOT)).toEqual([])
    const escaping = `[x](https://github.com/foomakers/pair/blob/main/../../etc/passwd)`
    expect(findDeadRepoLinks(escaping, 'a.mdx', REPO_ROOT)).toHaveLength(1)
  })

  it('every blob citation on the real docs site resolves to a real file', () => {
    const docsDir = resolve(REPO_ROOT, 'apps/website/content/docs')
    const errors = walkMdx(docsDir).flatMap(f =>
      findDeadRepoLinks(readFileSync(f, 'utf-8'), relative(docsDir, f), REPO_ROOT),
    )
    expect(errors).toEqual([])
  })
})

/**
 * GitHub's heading-anchor generation, the authoritative consumer of every `#fragment`
 * Check 5b validates: inline markup is reduced to its rendered text, then lowercase,
 * drop every character outside github's KEEP set, spaces to `-`, and a repeated slug
 * gets `-1`, `-2`.
 *
 * EVERY expected value below is what github.com itself emits, not a reading of the
 * spec: `gh api -X POST /markdown -f text='## <heading>'` returns the rendered HTML
 * whose `id="user-content-<slug>"` is the anchor a reader's browser jumps to.
 *
 * The KEEP set is a FINITE table over Unicode general categories, and the table below
 * has a row for every cell of it — because the classes that diverge are invisible by
 * inspection. The rule is Ruby's `\p{Word}` plus `-` and space (github's markdown
 * pipeline is Ruby): Alphabetic (which is L **plus Nl** — `Ⅸ` survives) | Mark (Mn,
 * Mc, Me — U+FE0F and a combining acute survive) | Nd | Connector_Punctuation (`_`) |
 * Join_Control (ZWJ/ZWNJ). Everything else goes, including No (`①`, `½`), every other
 * Cf (soft hyphen, RLM), Sk emoji modifiers (skin tones) and non-ASCII spaces, which
 * are DROPPED rather than turned into `-`.
 *
 * `github-slugger` is NOT the oracle for these rows even though it is what this code
 * mirrors in shape: v2.0.0 DROPS U+200D, while github.com keeps it —
 * `.pair/knowledge/…/secure-development.md`'s `👨‍💻 **SECURE CODING STANDARDS**` is
 * anchored `#‍-secure-coding-standards` on github.com today. github.com wins.
 */
describe('slugifyHeading', () => {
  it.each([
    ['Callers Matrix (Scoped Capabilities)', 'callers-matrix-scoped-capabilities'],
    // github.com serves exactly this for `## 6. `tech/risk-matrix.md` — Adoption Delta`
    // (probed on the rendered blob page): backticks, `.`, `/` and the em-dash are
    // dropped, and the double hyphen the removed em-dash leaves behind is PRESERVED.
    ['6. `tech/risk-matrix.md` — Adoption Delta', '6-techrisk-matrixmd--adoption-delta'],
    ['Execution Log', 'execution-log'],
    // Emphasis markers are MARKUP (dropped with the word intact); an intraword `_` is
    // TEXT and survives. Both rows come from github's own /markdown render.
    ['**Bold** and _italic_', 'bold-and-italic'],
    ['snake_case and a `code` span', 'snake_case-and-a-code-span'],
    ['Step-by-step', 'step-by-step'],
    ['A [linked](https://example.com) word', 'a-linked-word'],
    ['Trailing spaces   ', 'trailing-spaces'],

    // --- KEEP: Mark (Mn / Mc / Me) -----------------------------------------
    // The row that mattered: `## 🛠️ Essential Commands` is CLAUDE.md:59 and 275 more
    // repo headings carry a variation selector (278 selectors across 276 headings — two
    // headings carry two). U+1F6E0 is dropped, U+FE0F is NOT, so the live anchor STARTS
    // with U+FE0F. Dropping it made every one of those 276 headings unciteable —
    // `docs:staleness` failed the build on a working link.
    ['🛠️ Essential Commands', '️-essential-commands'],
    ['⚙︎ Vs15 Text', '︎-vs15-text'], // VARIATION SELECTOR-15 too, not just -16
    ['#️⃣ Keycap Hash', '️⃣-keycap-hash'], // Me (enclosing keycap)
    ['Qué Tal Dec', 'qué-tal-dec'], // Mn: decomposed é is NOT normalized away
    ['कि Devanagari Mc', 'कि-devanagari-mc'], // Mc (spacing vowel sign)

    // --- KEEP: Join_Control, and ONLY Join_Control among Cf ------------------
    ['👨‍💻 Zwj Family', '‍-zwj-family'],
    ['a‌b Zwnj', 'a‌b-zwnj'],
    ['a­b Soft Hyphen', 'ab-soft-hyphen'], // Cf, not Join_Control -> DROPPED
    ['a‏b Rlm', 'ab-rlm'], // Cf, not Join_Control -> DROPPED

    // --- KEEP: Alphabetic includes Nl; Nd stays; No does NOT -----------------
    ['Ⅸ Roman Nine', 'ⅸ-roman-nine'], // Nl survives (and lowercases)
    ['１２ Fullwidth Digits', '１２-fullwidth-digits'], // Nd beyond ASCII
    ['① Circled One', '-circled-one'], // No is DROPPED — `\p{N}` would have kept it
    ['½ Half', '-half'],

    // --- DROP: symbols; `Sk` drops, but the look-alike `Lm` is a LETTER and keeps --
    ['👍🏽 Skin Tone', '-skin-tone'], // U+1F3FD is Sk and is dropped …
    // U+02C6 is Lm — a modifier LETTER, so Alphabetic keeps it — unlike U+1F3FD, which is Sk.
    ['ˆ Modifier Circumflex', 'ˆ-modifier-circumflex'],
    ['🚀 Emoji lead', '-emoji-lead'],
    ['$ Dollar', '-dollar'],
    ['a+b Plus', 'ab-plus'],
    ['ab Private', 'ab-private'], // Co

    // --- DROP: every space that is not U+0020, rather than mapping it to `-` --
    ['Foo Bar Nbsp', 'foobar-nbsp'],
    ['Foo　Bar Ideo', 'foobar-ideo'],
    ['Foo\tBar Tab', 'foobar-tab'],
    ['Foo  Bar Double', 'foo--bar-double'], // two U+0020 -> two hyphens, not collapsed
  ])('slugs %j as %j', (heading, slug) => {
    expect(slugifyHeading(heading)).toBe(slug)
  })
})

describe('collectHeadingSlugs', () => {
  it('collects ATX headings at every level', () => {
    const slugs = collectHeadingSlugs('# One\n\n## Two Words\n\n###### Six\n')
    expect([...slugs]).toEqual(['one', 'two-words', 'six'])
  })

  it('ignores a `#` inside a fenced code block', () => {
    const md = '# Real\n\n```sh\n# Not A Heading\n```\n\n~~~\n## Also Not\n~~~\n'
    expect([...collectHeadingSlugs(md)]).toEqual(['real'])
  })

  /**
   * FENCE STATE, the half of the fence grammar "ignores a `#` inside a fenced block"
   * cannot reach: which line actually CLOSES the block. Getting it wrong is not a
   * cosmetic slug-set difference — a phantom slug makes a dead citation PASS (the
   * reader lands nowhere), and a swallowed real heading reddens a live one.
   *
   * `slugs` in every row is the anchor set github.com's own renderer serves for the
   * SAME bytes: `jq -Rs '{text:.}' f.md | gh api -X POST /markdown --input -`, read as
   * `href="#…"` in document order.
   */
  const FENCE_STATE_ROWS: ReadonlyArray<{ md: string; slugs: readonly string[]; why: string }> = [
    {
      md: '# Doc\n\n```markdown\n## Inner\n```bash\n## Phantom\n```\n\n## Real\n',
      slugs: ['doc', 'real'],
      why: 'a closer bearing an INFO STRING does not close — `## Phantom` stays inside, `## Real` stays outside',
    },
    {
      md: '# Doc\n\n```markdown `x`\n## Inner\n```\n\n## Real\n',
      slugs: ['doc', 'inner'],
      why: 'a BACKTICK in a backtick fence\u2019s info string means no fence opened at all',
    },
    {
      md: '# Doc\n\n```text\n## Inner\n~~~\n\n## Real\n',
      slugs: ['doc'],
      why: 'a closer of the OTHER fence char does not close — the block runs to EOF',
    },
    {
      md: '# Doc\n\n```text\n## Inner\n`````\n\n## Real\n',
      slugs: ['doc', 'real'],
      why: 'a closer LONGER than the opener closes',
    },
    {
      md: '# Doc\n\n````text\n## Inner\n```\n\n## Real\n',
      slugs: ['doc'],
      why: 'a closer SHORTER than the opener does not close',
    },
    {
      md: '# Doc\n\n   ```text\n## Inner\n   ```\n\n## Real\n',
      slugs: ['doc', 'real'],
      why: 'opener and closer indented 3 spaces are still a fence',
    },
  ]

  for (const row of FENCE_STATE_ROWS) {
    it(`fence state — ${row.why}`, () => {
      expect([...collectHeadingSlugs(row.md)]).toEqual([...row.slugs])
    })
  }

  it('ignores YAML frontmatter', () => {
    expect([...collectHeadingSlugs('---\ntitle: X\n---\n\n# Real\n')]).toEqual(['real'])
  })

  it('collects setext headings', () => {
    expect([...collectHeadingSlugs('Title Here\n=====\n\nSub Head\n---\n')]).toEqual([
      'title-here',
      'sub-head',
    ])
  })

  it('does not read a table separator row as a setext heading', () => {
    expect([...collectHeadingSlugs('| a | b |\n| --- | --- |\n| 1 | 2 |\n')]).toEqual([])
  })

  /**
   * The duplicate-slug rule is github.com's, and it is a SKIP-UNTIL-FREE loop, not a
   * per-base occurrence counter: a candidate `${base}-${n}` that is already taken —
   * because some other heading's NATURAL slug spells it — is skipped and `n` keeps
   * climbing. A plain counter diverges the moment a natural slug collides with a
   * generated one, which is a live URL the gate then calls dead (and, mirrored, a
   * citation the gate calls fine that lands the reader on the wrong heading).
   *
   * Every expectation below is github.com's own output, probed with
   * `gh api -X POST /markdown --input <(jq -Rs '{text:.}' fixture.md)` and read off
   * the emitted `id="user-content-…"` attributes in document order.
   */
  const DEDUP_ROWS: ReadonlyArray<{ headings: string[]; slugs: string[]; why: string }> = [
    {
      headings: ['Notes', 'Notes', 'Notes'],
      slugs: ['notes', 'notes-1', 'notes-2'],
      why: 'plain repetition — counter and skip-loop agree',
    },
    {
      headings: ['Foo', 'Foo 1', 'Foo', 'Foo'],
      slugs: ['foo', 'foo-1', 'foo-2', 'foo-3'],
      why: 'a natural slug OCCUPIES the first generated candidate — the counter row',
    },
    {
      headings: ['Foo 1', 'Foo', 'Foo'],
      slugs: ['foo-1', 'foo', 'foo-2'],
      why: 'the occupier comes FIRST — the 2nd `Foo` skips past it',
    },
    {
      headings: ['Foo', 'Foo', 'Foo 1'],
      slugs: ['foo', 'foo-1', 'foo-1-1'],
      why: 'the collision is the other way: a natural slug lands on a GENERATED one',
    },
    {
      headings: ['Foo', 'Foo', 'Foo', 'Foo 1', 'Foo 1'],
      slugs: ['foo', 'foo-1', 'foo-2', 'foo-1-1', 'foo-1-2'],
      why: 'the suffixed slug then runs its own counter, independent of the base one',
    },
    {
      headings: ['Foo 2', 'Foo', 'Foo', 'Foo'],
      slugs: ['foo-2', 'foo', 'foo-1', 'foo-3'],
      why: 'the loop skips a taken candidate mid-run and keeps climbing',
    },
  ]

  for (const row of DEDUP_ROWS) {
    it(`disambiguates ${JSON.stringify(row.headings)} as ${JSON.stringify(row.slugs)} — ${row.why}`, () => {
      const md = row.headings.map(h => `## ${h}\n`).join('\n')
      expect([...collectHeadingSlugs(md)]).toEqual(row.slugs)
    })
  }

  // The collision the skip-loop must NOT see. github.com's slugger tracks only the
  // slugs IT generated; an explicit `<a name>` is separate HTML it never consults.
  // Probed: `<a name="foo-1"></a>` + `## Foo` + `## Foo` still anchors the headings
  // `user-content-foo` / `user-content-foo-1`. Reading the returned Set back into the
  // loop would have pushed the 2nd heading to `foo-2` — a wrong-destination anchor.
  it('an explicit HTML anchor does not consume a generated slug', () => {
    const md = '<a name="foo-1"></a>\n\n## Foo\n\n## Foo\n'
    // Set order: the explicit anchor is seen first, then `foo`; the 2nd heading's
    // `foo-1` is already present. Three headings' worth of slugs, two distinct.
    expect([...collectHeadingSlugs(md)]).toEqual(['foo-1', 'foo'])
  })

  it('collects an explicit HTML anchor', () => {
    expect(
      collectHeadingSlugs('<a name="manual-anchor"></a>\n\n# Real\n').has('manual-anchor'),
    ).toBe(true)
  })

  /**
   * BLOCK STRUCTURE — the shared decision table, run here against the anchor set and in
   * `@pair/knowledge-hub` against the fenced-block bodies, because both gates sit on
   * ONE reader (`@pair/content-ops`'s `readMarkdown`). Every value is github.com's own
   * output for the same bytes; see the table's own header for the exact command.
   *
   * Reading lines at DOCUMENT level only — no list-item content columns, no blockquote
   * markers, no HTML blocks, and a setext underline taking just the line above it —
   * disagreed with github.com in BOTH directions on shapes this repo already ships:
   * `- # Release v0.2.0 …` in five CHANGELOGs went missing (a live anchor called dead,
   * exit 1 on a URL that works) while `<div>` / `## InDiv` / `</div>` served a phantom
   * `#indiv` that PASSED the gate and 404s for every reader.
   *
   * `readerAnchors`, where a row sets it, is a divergence this gate knowingly keeps —
   * on record as a row instead of latent.
   */
  for (const row of COMMONMARK_BLOCK_ROWS) {
    it(`block structure [${row.name}] — ${row.why}`, () => {
      expect([...collectHeadingSlugs(row.content)], row.name).toEqual([
        ...(row.readerAnchors ?? row.anchors),
      ])
    })
  }

  /**
   * The corpus rows the table above was derived FROM — the live instances, asserted
   * against the real repo files rather than against a fixture, so a rewrite of either
   * file that moves the heading reddens here.
   *
   * `apps/pair-cli/CHANGELOG.md` serves 36 anchors on github.com (probed at branch head
   * `2925f9f9`; the module computed 35 before this change, missing exactly the one
   * below). The other four CHANGELOGs carry the same `- # Release …` shape.
   */
  const CHANGELOG_LIST_HEADINGS: ReadonlyArray<readonly [string, string]> = [
    ['apps/pair-cli/CHANGELOG.md', 'release-v020---enhanced-cli-distribution--documentation'],
    [
      'packages/content-ops/CHANGELOG.md',
      'release-v020---enhanced-cli-distribution--documentation',
    ],
    [
      'packages/knowledge-hub/CHANGELOG.md',
      'release-v020---enhanced-cli-distribution--documentation',
    ],
    ['tools/eslint-config/CHANGELOG.md', 'release-v020---enhanced-cli-distribution--documentation'],
    [
      'tools/prettier-config/CHANGELOG.md',
      'release-v020---enhanced-cli-distribution--documentation',
    ],
  ]

  it.each(CHANGELOG_LIST_HEADINGS)(
    'reads the ATX heading nested in a list item in %s',
    (file, slug) => {
      expect(collectHeadingSlugs(readFileSync(resolve(REPO_ROOT, file), 'utf-8')).has(slug)).toBe(
        true,
      )
    },
  )

  /**
   * The other live corpus row: `### \`--root <issue-id>\` — subtree scope`, where the
   * `<issue-id>` sits INSIDE a code span and is therefore literal text, not inline HTML.
   * Three files ship it, and the gate computed `#--root---subtree-scope` for all three
   * — a dead spelling for the one live anchor of `pair-next`'s scope argument.
   */
  it.each([
    '.claude/skills/pair-next/SKILL.md',
    'packages/knowledge-hub/dataset/.skills/next/SKILL.md',
    'apps/website/content/docs/reference/pair-next.mdx',
  ])('reads a code span as literal text in %s', file => {
    const slugs = collectHeadingSlugs(readFileSync(resolve(REPO_ROOT, file), 'utf-8'))
    expect([...slugs].filter(s => s.includes('root'))).toContain('--root-issue-id--subtree-scope')
  })

  /**
   * CORPUS SWEEP against github.com itself, for every git-tracked `*.md`/`*.mdx` that
   * CARRIES one of these shapes — a list-item or blockquote heading, an HTML block, a
   * setext underline. The oracle cannot run in CI (it is one `gh api -X POST /markdown`
   * call per file), so its answers are COMMITTED, keyed by the sha1 of the file body
   * with YAML frontmatter removed — the same body the API was given, because the
   * `/markdown` endpoint has no frontmatter mode while github.com's blob view strips it.
   *
   * Keying on the content hash is what keeps this honest in both directions: editing a
   * doc drops its row out of the fixture (the file is simply no longer asserted) instead
   * of failing on a stale expectation, while changing the READER reddens every row at
   * once. `pnpm docs:anchor-oracle` (repo root) regenerates it.
   *
   * Five files failed this sweep before the reader became container-aware, and one
   * before code spans stopped being read as inline HTML.
   *
   * WHICH files are recorded is `isBlockStructureSensitive`, and it is asserted here
   * against the same predicate the generator used — because the selection used to be
   * computed WITH the reader under test, so a file whose HTML shape the reader
   * mis-parsed was excluded from the very sweep that would expose it. Every recorded
   * key must still satisfy the predicate: narrowing it therefore REDDENS instead of
   * silently shrinking the sweep.
   */
  it('matches github.com\u2019s anchors on every recorded corpus file', () => {
    const oracle = JSON.parse(
      readFileSync(resolve(__dirname, 'github-anchor-oracle.json'), 'utf-8'),
    ) as { readonly files: Record<string, { readonly sha1: string; readonly anchors: string[] }> }
    const entries = Object.entries(oracle.files)
    // Raised in lockstep with the widened predicate, twice: 42 -> 398 when selection
    // stopped consulting the reader, and again when a FENCE signal was added — a file
    // whose anchor set depends on fence parity alone matched none of the first four
    // signals. A floor left below the previous population lets the sweep shrink back
    // unnoticed, which is how fastify.md stayed outside it. MEASURED at HEAD 965a60f2
    // over `git ls-files '*.md' '*.mdx'` (1303 files): the four shipped signals admit
    // 398, and adding `/^ {0,3}(?:`{3,}|~{3,})/m` admits 937.
    expect(entries.length).toBeGreaterThan(398)
    let checked = 0
    for (const [file, expected] of entries) {
      const src = readFileSync(resolve(REPO_ROOT, file), 'utf-8')
      if (createHash('sha1').update(stripFrontmatter(src)).digest('hex') !== expected.sha1) continue
      checked += 1
      expect([...collectHeadingSlugs(src)], file).toEqual(expected.anchors)
    }
    // A wholesale docs rewrite may retire rows; an EMPTY sweep is a silently dead test.
    expect(checked, 'recorded corpus rows still matching their file').toBeGreaterThan(
      entries.length / 2,
    )
  })

  /**
   * The corpus sweep's blind spot, named. `fastify.md` is the file ADR-024's Context is
   * written about — an info-string-bearing ```` ```typescript ```` line read as CLOSING
   * a fence made it serve `#request-lifecycle-management` and
   * `#validation-and-schema-design`, two anchors github.com does not have, in both KB
   * roots. Its anchor set depends on FENCE state and on nothing else, so it matches none
   * of the four shipped selection signals and is not a key here: revert the fence rule
   * and this sweep — the one net that answers to github.com — stays GREEN.
   *
   * MEASURED at HEAD 965a60f2, `gh api -X POST /markdown` on the frontmatter-stripped
   * body, read as `(id|name)="user-content-…"` in document order: 30 anchors, and
   * NEITHER phantom slug among them. `grep -cE '^#{1,6} '` on the same file: 38.
   */
  it('records the fence-sensitive file ADR-024 is written about', () => {
    const oracle = JSON.parse(
      readFileSync(resolve(__dirname, 'github-anchor-oracle.json'), 'utf-8'),
    ) as { readonly files: Record<string, { readonly sha1: string; readonly anchors: string[] }> }
    const file = '.pair/knowledge/guidelines/code-design/framework-patterns/fastify.md'
    const row = oracle.files[file]
    expect(row, `${file} recorded in github-anchor-oracle.json`).toBeDefined()
    // github.com's own answer, not ours: the two phantoms must be absent from what was
    // recorded, so a reverted fence rule reddens this row instead of agreeing with it.
    expect(row?.anchors, 'phantom anchors in the recorded oracle row').not.toContain(
      'request-lifecycle-management',
    )
    expect(row?.anchors, 'phantom anchors in the recorded oracle row').not.toContain(
      'validation-and-schema-design',
    )
    const src = readFileSync(resolve(REPO_ROOT, file), 'utf-8')
    expect(
      createHash('sha1').update(stripFrontmatter(src)).digest('hex'),
      'recorded row is for the file as it stands',
    ).toBe(row?.sha1)
    expect([...collectHeadingSlugs(src)], file).toEqual(row?.anchors)
  })

  it('records only files the SELECTION predicate still admits', () => {
    const oracle = JSON.parse(
      readFileSync(resolve(__dirname, 'github-anchor-oracle.json'), 'utf-8'),
    ) as { readonly files: Record<string, { readonly sha1: string; readonly anchors: string[] }> }
    const notAdmitted = Object.keys(oracle.files).filter(file => {
      const body = stripFrontmatter(readFileSync(resolve(REPO_ROOT, file), 'utf-8'))
      return !isBlockStructureSensitive(body)
    })
    expect(notAdmitted, 'recorded files the predicate would no longer select').toEqual([])
  })

  it('finds every fragment the real docs site cites today', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['.pair/knowledge/skills-guide.md', 'callers-matrix-scoped-capabilities'],
      [
        'packages/knowledge-hub/dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md',
        '6-techrisk-matrixmd--adoption-delta',
      ],
      ['qa/release-validation/CP10-web-cloud-environment.md', 'execution-log'],
    ]
    for (const [file, frag] of cases) {
      const slugs = collectHeadingSlugs(readFileSync(resolve(REPO_ROOT, file), 'utf-8'))
      expect(slugs.has(frag), `${file}#${frag}`).toBe(true)
    }
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

  // Check 5 reads the SAME rendered surface as Check 5b, so the multi-line span and the
  // multi-line JSX comment are literal text here too. Site oracle, same probe page:
  // `/docs/nope-multiline` inside a wrapping code span -> 0 `<a href>`; inside a
  // wrapping comment -> stripped from the payload entirely.
  it('ignores a /docs target inside a code span WRAPPING a newline', () => {
    expect(findDeadLinks('Text `[y](/docs/nope)\nand more` end.\n', 'a.mdx', routes)).toEqual([])
  })

  it('ignores a /docs target inside a {/* comment */} WRAPPING newlines', () => {
    expect(findDeadLinks('{/* see\n[y](/docs/nope)\n*/}\n', 'a.mdx', routes)).toEqual([])
  })

  it('still flags a live /docs link after a closed multi-line code span', () => {
    const content = 'Text `[y](/docs/also-nope)\nand more` end.\n\n[x](/docs/nope)\n'
    expect(findDeadLinks(content, 'a.mdx', routes)).toEqual([
      'Dead internal link in a.mdx: /docs/nope does not resolve to a docs page',
    ])
  })

  // The SAME run-length defect, on the OTHER consumer of `linkSurface`. Check 5 is
  // exposed identically for `/docs/...` targets, so the fix must be in the shared mask,
  // not in one caller. Site oracle, same pipeline as the Check 5b table
  // (`@mdx-js/mdx@3.1.1` + `remark-gfm@4.0.1`): both live rows compile to
  // `href: "/docs/nope"`, which is a route this suite's `routes` set does not have.
  it('flags a /docs target after an x1 backtick whose only later run is x2', () => {
    const content = 'Use a ` here, see [y](/docs/nope) and ``double`` too.'
    expect(findDeadLinks(content, 'a.mdx', routes)).toEqual([
      'Dead internal link in a.mdx: /docs/nope does not resolve to a docs page',
    ])
  })

  it('flags a /docs target after an x3 backtick run whose only later run is x2', () => {
    const content = 'Use a ```triple here, see [y](/docs/nope) and ``two`` too.'
    expect(findDeadLinks(content, 'a.mdx', routes)).toEqual([
      'Dead internal link in a.mdx: /docs/nope does not resolve to a docs page',
    ])
  })

  // Continuing partner: an x1 opener with a real x1 closer IS a span, and the target
  // inside it is literal text (site: 0 `href:`).
  it('ignores a /docs target inside an x1-opened span closed by a later x1 run', () => {
    expect(findDeadLinks('Use a `[y](/docs/nope)` here.', 'a.mdx', routes)).toEqual([])
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
  it('reports zero drift and 44 skills against the actual repo', () => {
    const { errors, skillCount } = runAllChecks(REPO_ROOT)
    expect(errors, errors.join('\n')).toHaveLength(0)
    expect(skillCount).toBe(44)
  })
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
