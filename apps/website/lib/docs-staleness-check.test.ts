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
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

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
