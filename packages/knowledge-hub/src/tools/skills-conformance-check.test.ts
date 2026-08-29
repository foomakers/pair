import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  parseFrontmatter,
  checkFrontmatterFields,
  checkSizeLimits,
  extractLinkTargets,
  isCheckableTarget,
  checkCatalogCounts,
  countByCategory,
  checkProseCounts,
  checkCategoryLabelCounts,
  checkEntrypointDepth,
  ENTRY_DEPTH,
  runChecks,
  APPROVAL_SIGNAL_FAMILIES,
  isApprovalSignalFamily,
  findApprovalRounds,
  findGuidedDrift,
  checkApprovalSignal,
  parseRoundMarker,
  ROUND_KINDS,
  AUTO_RESOLUTIONS,
  parseStepCatalogue,
  parseProcessProfiles,
  checkStepCatalogue,
  checkStepMarkers,
  checkStepMarkersInMirror,
  checkInstalledProfileCorpus,
  checkManualPathEntrypoint,
  extractProfileExamples,
  checkProcessProfiles,
  checkShippedProfileProse,
  resolveProcessProfile,
  parseWowProfileSection,
  profileProblems,
  WOW_TEMPLATE_FILE,
  REPO_WOW_FILE,
  PROFILE_PROSE_FILES,
  PROFILE_DECLARATION_FILES,
} from './skills-conformance-check'
import { SKILL_COPY_OPTS } from './skill-md-mirror'
import { join as pathJoin } from 'node:path'

describe('parseFrontmatter', () => {
  it('parses top-level keys and quoted values', () => {
    const fm = parseFrontmatter('---\nname: foo\ndescription: "Does things."\n---\nBody here')
    expect(fm).not.toBeNull()
    expect(fm?.keys).toEqual(['name', 'description'])
    expect(fm?.values['description']).toBe('Does things.')
    expect(fm?.body).toBe('Body here')
  })

  it('returns null when frontmatter is missing', () => {
    expect(parseFrontmatter('# Just markdown')).toBeNull()
  })

  it('returns null when frontmatter is unterminated', () => {
    expect(parseFrontmatter('---\nname: foo\n')).toBeNull()
  })

  it('ignores indented continuation lines as keys', () => {
    const fm = parseFrontmatter('---\nmetadata:\n  author: someone\n---\n')
    expect(fm?.keys).toEqual(['metadata'])
  })

  it('folds a `>` block scalar to its real length and resumes at the next key', () => {
    const fm = parseFrontmatter(
      '---\nname: foo\ndescription: >\n  line one\n  line two\nversion: 0.1.0\n---\n',
    )
    expect(fm?.keys).toEqual(['name', 'description', 'version'])
    expect(fm?.values['description']).toBe('line one line two')
    expect(fm?.values['version']).toBe('0.1.0')
  })

  it('folds a `|` block scalar (with chomping) into a measurable value', () => {
    const fm = parseFrontmatter('---\ndescription: |-\n  alpha\n  beta\n---\n')
    expect(fm?.values['description']).toBe('alpha beta')
  })
})

describe('checkFrontmatterFields', () => {
  it('accepts spec fields plus the tolerated Pair extension', () => {
    expect(
      checkFrontmatterFields([
        'name',
        'description',
        'license',
        'metadata',
        'allowed-tools',
        'version',
        'author',
      ]),
    ).toEqual([])
  })

  it('rejects assistant-specific fields', () => {
    const errors = checkFrontmatterFields(['name', 'description', 'disable-model-invocation'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('disable-model-invocation')
  })

  it('requires name and description', () => {
    const errors = checkFrontmatterFields(['version'])
    expect(errors.some(e => e.includes('"name"'))).toBe(true)
    expect(errors.some(e => e.includes('"description"'))).toBe(true)
  })
})

describe('checkSizeLimits', () => {
  it('passes within limits', () => {
    expect(checkSizeLimits('foo', 'a short description')).toEqual([])
  })

  it('fails name over 64 chars', () => {
    expect(checkSizeLimits('x'.repeat(65), 'ok')).toHaveLength(1)
  })

  it('fails description over 1024 chars and the combined bound', () => {
    const errors = checkSizeLimits('foo', 'x'.repeat(1025))
    expect(errors.some(e => e.includes('description is 1025'))).toBe(true)
    expect(errors.some(e => e.includes('combined'))).toBe(true)
  })

  it('fails the combined bound even when each field is individually legal', () => {
    const errors = checkSizeLimits('x'.repeat(60), 'y'.repeat(1000))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('combined')
  })
})

describe('isCheckableTarget', () => {
  it('skips URLs, anchors, absolute and placeholder paths', () => {
    expect(isCheckableTarget('https://agentskills.io')).toBe(false)
    expect(isCheckableTarget('mailto:x@y.z')).toBe(false)
    expect(isCheckableTarget('#some-section')).toBe(false)
    expect(isCheckableTarget('/rooted/path.md')).toBe(false)
    expect(isCheckableTarget('adoption/tech/adr/adr-NNN-topic.md')).toBe(false)
    expect(isCheckableTarget('decision-log/YYYY-MM-DD-topic.md')).toBe(false)
    expect(isCheckableTarget('subdomain/<slug>.md')).toBe(false)
    expect(isCheckableTarget('CP{N}-{slug}.md')).toBe(false)
    expect(isCheckableTarget('CP*.md')).toBe(false)
  })

  it('accepts plain relative paths', () => {
    expect(isCheckableTarget('../../../.pair/adoption/tech/way-of-working.md')).toBe(true)
    expect(isCheckableTarget('sibling-reference.md')).toBe(true)
  })
})

describe('extractLinkTargets', () => {
  it('extracts markdown link targets', () => {
    expect(extractLinkTargets('See [guide](../guide.md) and [spec](https://x.io).')).toEqual([
      '../guide.md',
      'https://x.io',
    ])
  })

  it('ignores links inside fenced code blocks', () => {
    const body = 'Real [a](./a.md)\n```md\n[example](./not-checked.md)\n```\n'
    expect(extractLinkTargets(body)).toEqual(['./a.md'])
  })
})

describe('checkCatalogCounts', () => {
  it('warns on every stated count that mismatches the corpus', () => {
    const content =
      'Covers the full 33-skill catalog.\n## Skill Catalog (33 skills)\nany of the 33 skills'
    const warnings = checkCatalogCounts(content, 35)
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('35')
  })

  it('stays silent when counts match', () => {
    expect(checkCatalogCounts('all 35 skills are routable', 35)).toEqual([])
  })
})

describe('countByCategory', () => {
  it('buckets by top-level dir (process/capability/navigator)', () => {
    const skillsDir = pathJoin('/corpus', '.skills')
    const files = [
      pathJoin(skillsDir, 'process', 'review', 'SKILL.md'),
      pathJoin(skillsDir, 'process', 'implement', 'SKILL.md'),
      pathJoin(skillsDir, 'capability', 'classify', 'SKILL.md'),
      pathJoin(skillsDir, 'next', 'SKILL.md'),
    ]
    expect(countByCategory(files, skillsDir)).toEqual({
      total: 4,
      process: 2,
      capability: 1,
      navigator: 1,
    })
  })
})

describe('checkProseCounts', () => {
  const counts = { total: 37, process: 9, capability: 27, navigator: 1 }

  it('is silent when total and breakdown match the corpus', () => {
    const content =
      'the full catalog of 37 skills.\n37 Agent Skills (9 process + 27 capability + 1 navigator)'
    expect(checkProseCounts('wow.md', content, counts)).toEqual([])
  })

  it('flags a stale "N skills" total', () => {
    const errors = checkProseCounts('wow.md', 'full catalog of 36 skills', counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('37 skills')
  })

  it('flags a stale "N Agent Skills" total', () => {
    const errors = checkProseCounts('gs.md', '36 Agent Skills for you', counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('37 skills')
  })

  it('flags a stale breakdown even when the total is right', () => {
    const errors = checkProseCounts(
      'gs.md',
      '37 Agent Skills (9 process + 26 capability + 1 navigator)',
      counts,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not match corpus')
  })

  it('flags a stale breakdown even when an earlier breakdown in the same file is correct', () => {
    const content =
      '37 skills (9 process + 27 capability + 1 navigator).\nrecap: (9 process + 26 capability + 1 navigator)'
    const errors = checkProseCounts('gs.md', content, counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not match corpus')
  })

  it('does not mistake breakdown component numbers for the total', () => {
    // "9 process" / "27 capability" are followed by a category word, not "skill".
    expect(checkProseCounts('gs.md', '(9 process + 27 capability + 1 navigator)', counts)).toEqual(
      [],
    )
  })
})

describe('checkCategoryLabelCounts', () => {
  const counts = { total: 37, process: 9, capability: 27, navigator: 1 }

  it('is silent when heading and table-cell category counts match', () => {
    const content =
      '| **Process** | 9 |\n| **Capability** | 27 |\n### Process Skills (9)\n### Capability Skills (27)'
    expect(checkCategoryLabelCounts('sg.md', content, counts)).toEqual([])
  })

  it('flags a stale "### Capability Skills (N)" catalog heading', () => {
    const errors = checkCategoryLabelCounts('sg.md', '### Capability Skills (26)', counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('heading')
    expect(errors[0]).toContain('27 capability skills')
  })

  it('flags a stale "**Category** | N" Skill-Types table cell', () => {
    const errors = checkCategoryLabelCounts('sg.md', '| **Process** | 8 |', counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('table cell')
    expect(errors[0]).toContain('9 process skills')
  })

  it('ignores subcategory groupings that carry no corpus counterpart', () => {
    // "Assessment"/"Domain Modeling" are not top-level categories — never matched.
    const content = '#### Assessment Skills (9)\n#### Domain Modeling Skills (2)'
    expect(checkCategoryLabelCounts('sg.md', content, counts)).toEqual([])
  })
})

describe('runChecks (fixture corpus)', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-conformance-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const skill = (dir: string, frontmatter: string, body = '') => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}`)
  }

  skill('capability/good', 'name: good\ndescription: "Fine."\nversion: 0.1.0\nauthor: Foomakers')
  skill(
    'capability/bad-field',
    'name: bad-field\ndescription: "Has a Claude-only field."\ndisable-model-invocation: true',
  )
  skill(
    'capability/broken-link',
    'name: broken-link\ndescription: "Points nowhere."',
    'See [x](./missing.md).',
  )
  skill('next', 'name: next\ndescription: "Router."', 'Covers the full 2-skill catalog.')

  it('reports violations per file plus a catalog-count mismatch as a hard error (drives CLI exit 1)', () => {
    const { errors, skillCount } = runChecks(root)
    expect(skillCount).toBe(4)
    expect(
      errors.some(e => e.includes('bad-field') && e.includes('disable-model-invocation')),
    ).toBe(true)
    expect(errors.some(e => e.includes('broken-link') && e.includes('./missing.md'))).toBe(true)
    expect(errors.some(e => e.includes('good/SKILL.md'))).toBe(false)
    const catalogErrors = errors.filter(e => e.includes('2-skill'))
    expect(catalogErrors).toHaveLength(1)
    expect(catalogErrors[0]).toContain('4 skills')
  })
})

describe('runChecks — block-scalar size-gate cannot be bypassed (finding 1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-conformance-block-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('an over-1024 `>` block-scalar description is a violation (drives CLI exit 1)', () => {
    const longLine = 'x'.repeat(1100)
    mkdirSync(join(root, 'capability/blocky'), { recursive: true })
    writeFileSync(
      join(root, 'capability/blocky', 'SKILL.md'),
      `---\nname: blocky\ndescription: >\n  ${longLine}\n---\nbody`,
    )
    const { errors } = runChecks(root)
    // Real folded length (~1100) is measured, so the ≤1024 cap catches it instead of
    // reading the bare `>` as length ~1. A non-empty errors list ⇒ the CLI process.exit(1).
    expect(
      errors.some(
        e => e.includes('blocky') && e.includes('description is') && e.includes('spec max'),
      ),
    ).toBe(true)
    expect(errors.length).toBeGreaterThan(0)
  })
})

/**
 * Authoring rule 1 of `skill-conventions/nested-sub-documents.md` ("only the entry
 * directory holds SKILL.md") was stated but unenforced — the same silent-hole class
 * as #407's too-deep entry, one layer up. A `SKILL.md` inside a real skill's
 * `references/` is correctly-shaped CONTENT for the copy pipeline's layout guards
 * (recognising it there would need the `SKILL.md` knowledge ADR-020 keeps out of a
 * shared transform), and the mirror-equality guard derives the installed path from
 * that same transform, so it agrees with itself. Static corpus knowledge is the
 * right layer, and this is it.
 */
describe('checkEntrypointDepth (#411 round 4)', () => {
  const at = (rel: string) => pathJoin('/corpus', rel)

  it('accepts a SKILL.md at the entry depth, and the bare meta skill above it', () => {
    expect(
      checkEntrypointDepth('/corpus', [
        at('process/review/SKILL.md'),
        at('capability/grill/SKILL.md'),
        at('next/SKILL.md'),
      ]),
    ).toEqual([])
  })

  it('ignores non-entrypoint markdown at any depth', () => {
    // Sub-documents are the whole point of the convention — only the entrypoint
    // NAME is depth-constrained.
    expect(
      checkEntrypointDepth('/corpus', [
        at('process/review/references/deep.md'),
        at('process/review/merge-and-cascade.md'),
      ]),
    ).toEqual([])
  })

  it('rejects a SKILL.md below the entry depth — it would install non-invocable', () => {
    const errors = checkEntrypointDepth('/corpus', [at('process/review/references/SKILL.md')])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('references')
    expect(errors[0]).toContain('non-invocable')
  })

  it('rejects a SKILL.md at the registry root, which has no skill directory at all', () => {
    const errors = checkEntrypointDepth('/corpus', [at('SKILL.md')])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('registry root')
  })

  it("ENTRY_DEPTH is the registry's declared flattenDepth, not an independent number", () => {
    // Same fact as `apps/pair-cli/config.json`'s `skills.flattenDepth`, itself
    // pinned to that file by skill-md-mirror's own test. Duplicated as a plain
    // constant so this gate script keeps running under ts-node with no build.
    expect(ENTRY_DEPTH).toBe(SKILL_COPY_OPTS.flattenDepth)
  })
})

describe('runChecks — a too-deep SKILL.md fails the gate (#411 round 4)', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-conformance-depth-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reads a SKILL.md the entry walk never reaches, and reports it (drives CLI exit 1)', () => {
    mkdirSync(join(root, 'process/review/references'), { recursive: true })
    writeFileSync(
      join(root, 'process/review', 'SKILL.md'),
      '---\nname: review\ndescription: "Reviews."\n---\nbody',
    )
    writeFileSync(
      join(root, 'process/review/references', 'SKILL.md'),
      '---\nname: bogus\ndescription: "Would install silently non-invocable."\n---\nbody',
    )

    const { errors, skillCount } = runChecks(root)
    // The entry walk still counts ONE skill — which is exactly why nothing saw the
    // second file before this check.
    expect(skillCount).toBe(1)
    expect(errors.some(e => e.includes('references') && e.includes('SKILL.md'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Approval-round signal ($approval) — ADR-021.
//
// Every assertion below is INJECTION-tested: a conformant input is asserted
// green, then the mutation a reader would call the defect (an unqualified round,
// a missing argument row, a missing convention pointer) is asserted RED. A guard
// proven only on conformant input cannot tell "conformant" from "blind".
// ---------------------------------------------------------------------------

describe('isApprovalSignalFamily — obliged families, by prefix and not by list', () => {
  it('recognises a member of each declared family', () => {
    expect(isApprovalSignalFamily('capability/assess-architecture/SKILL.md')).toBe(true)
    expect(isApprovalSignalFamily('capability/map-contexts/SKILL.md')).toBe(true)
  })

  it('recognises a family member that does not exist yet (the point of a prefix)', () => {
    expect(isApprovalSignalFamily('capability/assess-something-new/SKILL.md')).toBe(true)
    expect(isApprovalSignalFamily('capability/map-something-new/SKILL.md')).toBe(true)
  })

  it('leaves every other skill alone', () => {
    expect(isApprovalSignalFamily('process/bootstrap/SKILL.md')).toBe(false)
    expect(isApprovalSignalFamily('capability/analyze-debt/SKILL.md')).toBe(false)
    expect(isApprovalSignalFamily('next/SKILL.md')).toBe(false)
  })

  it('declares prefixes, so nothing here encodes how many skills a family has', () => {
    expect(APPROVAL_SIGNAL_FAMILIES.every(p => p.endsWith('-'))).toBe(true)
  })
})

describe('findApprovalRounds — what counts as a round, and what does not', () => {
  for (const round of [
    'Developer approves the delta.',
    'Developer confirms.',
    'Confirm it is still current with the developer.',
    'Warn developer, ask for confirmation.',
    'Confirmation prompt: "Override X. Confirm?"',
    'Existing catalog conflicts — requires human approval before writing.',
  ]) {
    it(`detects "${round}", and only ITS OWN marker qualifies it`, () => {
      expect(findApprovalRounds(`1. **Verify**: ${round}`)).toEqual([
        { line: 1, text: `1. **Verify**: ${round}`, qualified: false },
      ])
      // Round 7: the `$approval` token no longer qualifies anything — it is prose a
      // neighbouring step could supply. The marker on this line is the contract.
      expect(
        findApprovalRounds(`1. **Verify** (\`$approval: interactive\`): ${round}`)[0]?.qualified,
      ).toBe(false)
      const marked = `1. **Verify**: ${round} <!-- approval-round: kind=confirm; auto=accept -->`
      expect(findApprovalRounds(marked)[0]?.qualified).toBe(true)
    })
  }

  it('a prompt line is its own round and needs its own marker', () => {
    // Round 7 inverted this case deliberately. It used to assert that a prompt line
    // inherits its step's qualification — which IS the Major: inheritance is what
    // let an unmarked round ride in on a marked sibling. A blockquote prompt asks,
    // so it declares.
    const inherited = [
      '3. **Act**: Present the delta (`$approval: interactive`):',
      '',
      '   > Proposed placement: X',
      '   > Approve or adjust?',
      '',
    ].join('\n')
    expect(findApprovalRounds(inherited)[0]).toMatchObject({ line: 4, qualified: false })

    const declared = inherited.replace(
      '   > Approve or adjust?',
      '   > Approve or adjust? <!-- approval-round: kind=confirm; auto=accept -->',
    )
    expect(findApprovalRounds(declared)[0]).toMatchObject({ line: 4, qualified: true })
  })

  it('does not read a sibling step’s qualification as its own', () => {
    const doc = [
      '3. **Act**: Present the delta (`$approval: interactive`).',
      '4. **Verify**: Developer approves the delta.',
    ].join('\n')
    expect(findApprovalRounds(doc)).toEqual([
      { line: 2, text: '4. **Verify**: Developer approves the delta.', qualified: false },
    ])
  })

  // Review round 1, Major 1: three skills carried a CHOICE round the pattern set
  // did not recognise ("ask developer to choose", "present top 2 with trade-off
  // analysis"), so `skills:conformance` stayed green while an autonomous run would
  // block on a tie nobody could answer. A choice IS an approval round — the human
  // is being asked to pick — so the detector has to see these shapes too.
  for (const round of [
    'Multiple valid frameworks score equally: Present top 2 with trade-off analysis, ask developer to choose.',
    'If two methodologies score within 10%, present both with trade-off analysis.',
    'Multiple valid platforms score equally: Present top 2 with trade-off analysis.',
    'If two or more patterns score within 10% of each other, present top 2 with trade-off analysis:',
    'guideline missing → ask developer to choose between Modular Monolith and Hexagonal',
    'Developer chooses one of the two candidates.',
  ]) {
    it(`detects the CHOICE round "${round.slice(0, 44)}…"`, () => {
      expect(findApprovalRounds(`- ${round}`)).toEqual([
        { line: 1, text: `- ${round}`, qualified: false },
      ])
      expect(
        findApprovalRounds(`- ${round} <!-- approval-round: kind=choice; auto=accept -->`)[0]
          ?.qualified,
      ).toBe(true)
    })
  }

  it('does not mistake a report of a decision for a round that asks for one', () => {
    // `/assess-stack`'s Composition Interface DESCRIBES its return value. Matching
    // the noun ("developer decision") instead of the verb would flag it — and a
    // guard that flags prose nobody can qualify teaches authors to work around it.
    expect(
      findApprovalRounds('- **Output**: Returns the developer decision (approve/reject).'),
    ).toEqual([])
  })

  it('ignores a fenced Output Format sample — a printed line is not a step that asks', () => {
    const doc = ['```text', 'Status: Developer approves', '```'].join('\n')
    expect(findApprovalRounds(doc)).toEqual([])
  })

  it('does not flag a sentence that merely mentions an approval', () => {
    for (const line of [
      '- **Persistence**: on approval, `/review` persists via `/record-decision`.',
      '7. **Act**: If unbalanced + volatile → **gate at approval**: proceed only once recorded.',
      '- HALT at Step 4 approval; this is the one case where the capability blocks.',
    ]) {
      expect(findApprovalRounds(line)).toEqual([])
    }
  })
})

describe('checkApprovalSignal — the two obligations, injected one at a time', () => {
  const REL = 'capability/assess-example/SKILL.md'
  const ROW = '| `$approval` | No | Mode. See [approval rounds](approval-rounds.md). |'
  const ROUND =
    '4. **Verify**: Developer approves the choice. <!-- approval-round: kind=confirm; auto=accept -->'

  it('is silent on a conformant family member', () => {
    expect(checkApprovalSignal(REL, `${ROW}\n\n${ROUND}\n`)).toEqual([])
  })

  it('is silent on a family member with NO approval round (defect-driven, not name-driven)', () => {
    expect(checkApprovalSignal(REL, 'Output-only. Nothing here asks anything.\n')).toEqual([])
  })

  it('ignores a skill outside the obliged families, round or no round', () => {
    expect(
      checkApprovalSignal('process/bootstrap/SKILL.md', '4. **Verify**: Developer approves.\n'),
    ).toEqual([])
  })

  it('flags an unqualified round, naming its line and its text', () => {
    const errors = checkApprovalSignal(REL, `${ROW}\n\n4. **Verify**: Developer approves.\n`)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(`${REL}:3`)
    expect(errors[0]).toContain('Developer approves')
    expect(errors[0]).toContain('approval-rounds.md')
  })

  it('flags a qualified round whose skill exposes no `$approval` argument row', () => {
    const errors = checkApprovalSignal(REL, `${ROUND}\n\n[approval rounds](approval-rounds.md)\n`)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('no `$approval` argument row')
  })

  it('flags a skill that qualifies its rounds but never points at the convention', () => {
    const errors = checkApprovalSignal(REL, `| \`$approval\` | No | Mode. |\n\n${ROUND}\n`)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('never points at')
  })

  it('reports EVERY unqualified round, so a partial fix cannot look clean', () => {
    const errors = checkApprovalSignal(
      REL,
      [
        ROW,
        '',
        ROUND,
        '',
        '5. **Verify**: Developer confirms.',
        '',
        '6. **Act**: Present the delta:',
        '',
        '   > Approve or adjust?',
      ].join('\n'),
    )
    expect(errors).toHaveLength(2)
  })
})

// Review round 2, Major: qualifying a round must not change what the GUIDED path
// says. The round-1 fix to `assess-methodology` put "name the leader" BEFORE the
// `Under auto` clause, so it applied to the interactive path too: a guided
// bootstrap with Scrum 82 / Kanban 76 used to present two neutral options and ask
// which one, and would now name Scrum and ask for approval of it. Different
// question — and AC2 of this story is "guided must not shift by one word".
//
// The guard is the general rule, not the instance: `auto`-only vocabulary may not
// appear in the part of a round that precedes its `Under auto` clause.
// Round 7, Major + structural. Six rounds of guards, all built from the same
// tool: keyword presence inside a text window derived from MARKDOWN LAYOUT. Every
// round narrowed the window one notch (file → line, ±400 chars → sentence, literal
// phrase → concept regex) and the defect class survived each time, because the
// boundaries those windows are computed from — end of sentence, list-item start,
// heading name — are layout, not contract. When the text changes shape the guard
// does not fail; it WIDENS, and something unrelated satisfies it.
//
// The declared marker replaces the window. Attachment is LINE IDENTITY (the marker
// sits on the round's own line), `auto=` is a CLOSED ENUM, and an unparseable or
// absent marker is a violation. A tie resolved by document order stops being
// "unmatched by a regex" and becomes unrepresentable: no enum value spells it.
describe('parseRoundMarker — the declared contract, per round line', () => {
  it('parses a well-formed marker off the round’s own line', () => {
    expect(
      parseRoundMarker(
        '5. **Verify**: Developer approves. <!-- approval-round: kind=confirm; auto=accept -->',
      ),
    ).toEqual({ kind: 'confirm', auto: 'accept' })
  })

  it('accepts every declared kind and auto value, and nothing else', () => {
    for (const kind of ROUND_KINDS) {
      expect(parseRoundMarker(`x <!-- approval-round: kind=${kind}; auto=accept -->`)?.kind).toBe(
        kind,
      )
    }
    for (const auto of AUTO_RESOLUTIONS) {
      expect(parseRoundMarker(`x <!-- approval-round: kind=confirm; auto=${auto} -->`)?.auto).toBe(
        auto,
      )
    }
  })

  it('rejects a value outside the enum instead of passing it through', () => {
    // The whole point: "resolved by list order" cannot be declared, so it cannot
    // be documented as if it were a resolution.
    expect(parseRoundMarker('x <!-- approval-round: kind=choice; auto=first-listed -->')).toEqual({
      kind: 'choice',
      auto: undefined,
      malformed: 'auto=first-listed',
    })
    expect(parseRoundMarker('x <!-- approval-round: kind=vibes; auto=accept -->')).toEqual({
      kind: undefined,
      auto: 'accept',
      malformed: 'kind=vibes',
    })
  })

  it('returns undefined when the line carries no marker at all', () => {
    expect(parseRoundMarker('5. **Verify**: Developer approves.')).toBeUndefined()
  })

  it('does not read a marker from a neighbouring line', () => {
    // Line identity, not a window: this is the property every previous version of
    // the guard lacked.
    const doc = [
      '4. **Act**: Present the delta. <!-- approval-round: kind=confirm; auto=accept -->',
      '5. **Verify**: Developer approves.',
    ]
    expect(parseRoundMarker(doc[1] as string)).toBeUndefined()
  })
})

describe('checkApprovalSignal — an unmarked round is a violation (round 7 Major)', () => {
  const REL = 'capability/assess-example/SKILL.md'
  const ROW = '| `$approval` | No | Mode. See [approval rounds](approval-rounds.md). |'
  const MARKED =
    '4. **Verify**: Developer approves. <!-- approval-round: kind=confirm; auto=accept -->'

  it('is silent when every round line carries a valid marker', () => {
    expect(checkApprovalSignal(REL, `${ROW}\n\n${MARKED}\n`)).toEqual([])
  })

  it('flags a second round in the SAME STEP that has no marker of its own', () => {
    // The Major, verbatim: qualification used to be read off the step block, so one
    // qualified round immunised every other round in it. A continuation line adding
    // a fresh choice round rode in free.
    const errors = checkApprovalSignal(
      REL,
      `${ROW}\n\n${MARKED}\n   When two assistants score equally, present both with trade-off ` +
        `analysis, name the leader, and ask the developer to choose.\n`,
    )
    // Two findings, both correct: the continuation line declares nothing, and it
    // also carries auto-only vocabulary ("name the leader") with no clause scoping
    // it. Asserted by content rather than by count — a mutation that trips two
    // independent guards is a stronger result, not a failed expectation.
    expect(errors.some(e => e.includes('no approval-round marker'))).toBe(true)
    expect(errors.some(e => e.includes('GUIDED half'))).toBe(true)
  })

  it('flags a marker whose auto value is outside the enum', () => {
    const errors = checkApprovalSignal(
      REL,
      `${ROW}\n\n4. **Verify**: Developer approves. <!-- approval-round: kind=choice; auto=first-listed -->\n`,
    )
    expect(errors.some(e => e.includes('auto=first-listed'))).toBe(true)
  })

  it('flags a marker missing a field rather than treating it as absent', () => {
    const errors = checkApprovalSignal(
      REL,
      `${ROW}\n\n4. **Verify**: Developer approves. <!-- approval-round: kind=confirm -->\n`,
    )
    expect(errors.some(e => e.includes('auto='))).toBe(true)
  })

  it('requires a project-state tie-break to say so on the line it declares it', () => {
    // `auto=project-state-then-unresolved` is a CONTRACT: the prose on that line
    // must actually describe it. Anchored to the marker, not to a window.
    const line =
      '- Ties: take whichever is listed first. <!-- approval-round: kind=choice; auto=project-state-then-unresolved -->'
    const errors = checkApprovalSignal(REL, `${ROW}\n\n${line}\n`)
    expect(errors.some(e => e.includes('project state'))).toBe(true)
  })

  it('rejects a document-order tie-break even when the prose sounds resolved', () => {
    // The round-6 Minor-1 mutation, now unrepresentable rather than unmatched.
    const line =
      '- Ties: the one listed first wins from project state; no proposal is ever withheld. ' +
      '<!-- approval-round: kind=choice; auto=project-state-then-unresolved -->'
    const errors = checkApprovalSignal(REL, `${ROW}\n\n${line}\n`)
    expect(errors.some(e => /document order|listed first/i.test(e))).toBe(true)
  })
})

describe('findGuidedDrift — auto-only text must not leak into the guided half', () => {
  const LEADER = 'name the leader'

  it('flags an auto-only directive placed BEFORE the `Under auto` clause', () => {
    const drift = findGuidedDrift(
      '4. **Act**: If two score within 10%, present both with trade-off analysis ' +
        `(\`$approval: interactive\`) — and **${LEADER}**. Under \`auto\` the near-tie is ` +
        'resolved deterministically.\n',
    )
    expect(drift).toHaveLength(1)
    expect(drift[0]?.line).toBe(1)
    expect(drift[0]?.directive).toContain(LEADER)
  })

  it('accepts the same directive once it sits inside the `Under auto` clause', () => {
    expect(
      findGuidedDrift(
        '4. **Act**: If two score within 10%, present both with trade-off analysis ' +
          `(\`$approval: interactive\`). Under \`auto\`: **${LEADER}** — the higher-scoring one stands.\n`,
      ),
    ).toEqual([])
  })

  it('reads the whole step, so a directive in the clause’s own continuation line is fine', () => {
    const step = [
      '3. **Act**: Present the delta (`$approval: interactive`):',
      '',
      '   > Approve or adjust?',
      '',
      '   Under `$approval: auto` the proposal is accepted as-is and reported.',
    ].join('\n')
    expect(findGuidedDrift(step)).toEqual([])
  })

  it('flags a round that carries auto-only text with no `Under auto` clause at all', () => {
    // Nothing scopes it, so it reads as unconditional — the same defect, worse.
    const drift = findGuidedDrift(
      '5. **Verify** (`$approval: interactive`): Developer approves — the recommendation is ' +
        'accepted as-is.\n',
    )
    expect(drift).toHaveLength(1)
  })

  it('leaves a round with no auto-only vocabulary alone', () => {
    expect(
      findGuidedDrift(
        '5. **Verify** (`$approval: interactive`): Developer approves. Under `auto` the ' +
          'recommendation above is accepted as-is and reported, never asked.\n',
      ),
    ).toEqual([])
  })

  it('only looks at approval rounds, not at prose that happens to use the words', () => {
    expect(findGuidedDrift('- The proposal is accepted as-is by the caller.\n')).toEqual([])
  })
})

describe('checkApprovalSignal — a sub-doc is checked against its owning SKILL.md', () => {
  // Review round 1, Minor 5: the check ran on `SKILL.md` only, so a family member
  // whose round lived in a disclosed sub-doc (`references/*.md`, the progressive-
  // disclosure layout the corpus already uses) escaped it — weakening AC5 exactly
  // where a growing family would put new content.
  const OWNER = '| `$approval` | No | Mode. See [approval rounds](approval-rounds.md). |'

  it('flags an unqualified round in a sub-doc, even though the sub-doc has no Arguments table', () => {
    const errors = checkApprovalSignal(
      'capability/assess-example/references/deep.md',
      '3. **Verify**: Developer approves the delta.\n',
      OWNER,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('references/deep.md:1')
  })

  it('does not demand an argument row from the sub-doc itself — the owner carries it', () => {
    expect(
      checkApprovalSignal(
        'capability/assess-example/references/deep.md',
        '3. **Verify**: Developer approves the delta. <!-- approval-round: kind=confirm; auto=accept -->\n',
        OWNER,
      ),
    ).toEqual([])
  })

  it('flags the OWNER when a sub-doc round exists and the owner exposes no argument', () => {
    const errors = checkApprovalSignal(
      'capability/assess-example/references/deep.md',
      '3. **Verify** (`$approval: interactive`): Developer approves the delta.\n',
      'no arguments table here\n',
    )
    expect(errors.some(e => e.includes('no `$approval` argument row'))).toBe(true)
  })
})

describe('runChecks — the approval-round signal is enforced by the gate itself', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-conformance-approval-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('an unqualified round in a family member drives CLI exit 1', () => {
    mkdirSync(join(root, 'capability/assess-thing'), { recursive: true })
    writeFileSync(
      join(root, 'capability/assess-thing', 'SKILL.md'),
      '---\nname: assess-thing\ndescription: "Assesses."\n---\n' +
        '4. **Verify**: Developer approves the choice.\n',
    )
    const { errors } = runChecks(root)
    expect(errors.some(e => e.includes('assess-thing') && e.includes('$approval'))).toBe(true)
  })
})

describe('runChecks — a family sub-doc is in scope too (round 1, Minor 5)', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-conformance-approval-subdoc-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reads a round in references/*.md and reports it against the sub-doc path', () => {
    mkdirSync(join(root, 'capability/map-thing/references'), { recursive: true })
    writeFileSync(
      join(root, 'capability/map-thing', 'SKILL.md'),
      '---\nname: map-thing\ndescription: "Maps."\n---\n' +
        '| `$approval` | No | Mode. See [approval rounds](approval-rounds.md). |\n',
    )
    writeFileSync(
      join(root, 'capability/map-thing/references', 'deep.md'),
      '3. **Act**: Present the delta:\n\n   > Approve or adjust?\n',
    )
    const { errors } = runChecks(root)
    expect(
      errors.some(e => e.includes('references/deep.md') && e.includes('approval-round marker')),
    ).toBe(true)
  })

  it('leaves a sub-doc of a NON-family skill alone', () => {
    mkdirSync(join(root, 'process/other/references'), { recursive: true })
    writeFileSync(
      join(root, 'process/other', 'SKILL.md'),
      '---\nname: other\ndescription: "Other."\n---\nbody\n',
    )
    writeFileSync(
      join(root, 'process/other/references', 'deep.md'),
      '3. **Verify**: Developer approves.\n',
    )
    const { errors } = runChecks(root)
    expect(errors.some(e => e.includes('process/other') && e.includes('$approval'))).toBe(false)
  })
})

// --- Process-step catalogue and profiles (#251) ---

const CATALOGUE = [
  '# Step Catalogue',
  '',
  'Prose that mentions `plan-tasks` in passing.',
  '',
  '## The Catalogue',
  '',
  '| Step id | How-to | Executable | Requires (any-of) |',
  '| --- | --- | --- | --- |',
  '| `specify-prd` | `01-how-to-create-PRD.md` | `/specify-prd` | — |',
  '| `define-subdomains` | — | `/map-subdomains` | `specify-prd` |',
  '| `brainstorm` | — | `/brainstorm` | — |',
  '',
  '## Not Steps',
  '',
  '| Capability | Why |',
  '| --- | --- |',
  '| `/estimate` | Not a step. |',
  '',
].join('\n')

const PROFILES = [
  '# Process Profiles',
  '',
  '## Built-in Profiles',
  '',
  '| Profile | Enabled steps |',
  '| --- | --- |',
  '| `default` | `*` — every catalogue step |',
  '| `poc` | `specify-prd`, `brainstorm` |',
  '',
].join('\n')

describe('parseStepCatalogue', () => {
  it('reads id, both representations and the any-of prerequisites', () => {
    expect(parseStepCatalogue(CATALOGUE)).toEqual([
      {
        id: 'specify-prd',
        howTo: '01-how-to-create-PRD.md',
        executable: '/specify-prd',
        requires: [],
      },
      {
        id: 'define-subdomains',
        howTo: null,
        executable: '/map-subdomains',
        requires: ['specify-prd'],
      },
      { id: 'brainstorm', howTo: null, executable: '/brainstorm', requires: [] },
    ])
  })

  it('never reads a table from another section as steps', () => {
    // The "not a step" table sits in its own section on purpose — reading it
    // would catalogue `/estimate` as a governable step.
    expect(parseStepCatalogue(CATALOGUE).map(e => e.id)).not.toContain('estimate')
  })

  it('returns nothing when the section is absent', () => {
    expect(parseStepCatalogue('# Empty\n')).toEqual([])
  })
})

describe('parseProcessProfiles', () => {
  it('reads `*` as every step and a list as itself', () => {
    expect(parseProcessProfiles(PROFILES)).toEqual({
      default: '*',
      poc: ['specify-prd', 'brainstorm'],
    })
  })
})

describe('checkStepCatalogue — bidirectional corpus binding', () => {
  const corpus = {
    howToGuides: ['01-how-to-create-PRD.md'],
    skillDirs: ['process/specify-prd', 'capability/map-subdomains', 'process/brainstorm', 'next'],
  }
  const entries = parseStepCatalogue(CATALOGUE)

  it('passes on a catalogue that matches the corpus', () => {
    expect(checkStepCatalogue(entries, corpus)).toEqual([])
  })

  it('fails when a catalogued how-to does not exist', () => {
    expect(checkStepCatalogue(entries, { ...corpus, howToGuides: [] }).join('\n')).toContain(
      'not in the how-to corpus',
    )
  })

  it('fails when a how-to guide is in no row (the reverse direction)', () => {
    const errors = checkStepCatalogue(entries, {
      ...corpus,
      howToGuides: [...corpus.howToGuides, '99-how-to-orphan.md'],
    })
    expect(errors.join('\n')).toContain('99-how-to-orphan.md')
    expect(errors.join('\n')).toContain('appears in no catalogue row')
  })

  it('fails when a process skill is in no row (the reverse direction)', () => {
    const errors = checkStepCatalogue(entries, {
      ...corpus,
      skillDirs: [...corpus.skillDirs, 'process/newcomer'],
    })
    expect(errors.join('\n')).toContain('/newcomer')
    expect(errors.join('\n')).toContain('appears in no catalogue row')
  })

  it('tolerates a capability that is in no row — a capability is not always a step', () => {
    expect(
      checkStepCatalogue(entries, {
        ...corpus,
        skillDirs: [...corpus.skillDirs, 'capability/estimate'],
      }),
    ).toEqual([])
  })

  it('fails when an executable resolves to nothing', () => {
    expect(
      checkStepCatalogue(entries, {
        ...corpus,
        skillDirs: corpus.skillDirs.filter(d => d !== 'capability/map-subdomains'),
      }).join('\n'),
    ).toContain('resolves to no skill')
  })

  it('fails on a duplicate step id', () => {
    const dup = [...entries, entries[0]!]
    expect(checkStepCatalogue(dup, corpus).join('\n')).toContain('duplicate step id')
  })

  it('fails on a prerequisite that is not a catalogued id', () => {
    const broken = [{ ...entries[0]!, requires: ['ghost'] }, ...entries.slice(1)]
    expect(checkStepCatalogue(broken, corpus).join('\n')).toContain('not a catalogued step id')
  })

  it('fails on a step with no representation at all', () => {
    const orphan = [
      ...entries,
      { id: 'ghost', howTo: null, executable: null, requires: [] as string[] },
    ]
    expect(checkStepCatalogue(orphan, corpus).join('\n')).toContain(
      'declares neither a how-to nor an executable',
    )
  })
})

describe('checkStepMarkers', () => {
  const root = mkdtempSync(join(tmpdir(), 'step-markers-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const writeSkill = (dir: string, body: string): void => {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(
      join(root, dir, 'SKILL.md'),
      `---\nname: ${dir.split('/').pop()}\ndescription: "x"\n---\n${body}`,
    )
  }

  const entries = [{ id: 'review', howTo: null, executable: '/review', requires: [] as string[] }]

  // The two behavioural clauses of the shipped delta (process-profile-gate.md,
  // "What stays in the skill") — the sentence an executor actually reads.
  const CLAUSES =
    "A **direct** invocation while a step is disabled by the project's profile warns and asks " +
    'for confirmation; a **composed** one never prompts — it degrades exactly as a step that is ' +
    'not installed. No section ⇒ no-op.'
  const delta = (id: string, body = `${CLAUSES} See [gate](process-profile-gate.md).`): string =>
    `## Process Profile\n\n<!-- process-step: id=${id} -->\n\n${body}\n`

  it('passes when the executable declares its id and points at the convention', () => {
    writeSkill('process/review', delta('review'))
    writeSkill('capability/estimate', 'No marker here.\n')
    expect(checkStepMarkers(entries, root)).toEqual([])
  })

  it('fails when the executable declares no marker', () => {
    writeSkill('process/review', `## Process Profile\n\n${CLAUSES} [gate](process-profile-gate.md)`)
    expect(checkStepMarkers(entries, root).join('\n')).toContain('declares no')
  })

  it('fails when the declared id disagrees with the catalogue', () => {
    writeSkill('process/review', delta('implement'))
    expect(checkStepMarkers(entries, root).join('\n')).toContain('maps `/review` to step `review`')
  })

  it('fails when neither the skill nor a disclosed sibling points at the gate convention', () => {
    writeSkill('process/review', delta('review', 'Nothing else.'))
    expect(checkStepMarkers(entries, root).join('\n')).toContain('points at skill-conventions/')
  })

  it('accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)', () => {
    // A skill under a byte budget keeps the marker in its entrypoint and discloses
    // its half of the convention to the sibling that already owns that topic.
    writeSkill('process/review', delta('review', 'See [more](more.md).'))
    writeFileSync(
      join(root, 'process/review', 'more.md'),
      `${CLAUSES} See [gate](process-profile-gate.md).\n`,
    )
    expect(checkStepMarkers(entries, root)).toEqual([])
  })

  it('fails when an UNCATALOGUED skill carries a marker', () => {
    writeSkill('process/review', delta('review'))
    writeSkill('capability/estimate', '<!-- process-step: id=estimate -->\n')
    expect(checkStepMarkers(entries, root).join('\n')).toContain('is not a catalogued step')
  })

  // Round 11 Minor: the marker and a `process-profile-gate.md` string anywhere in
  // the dir were the whole per-skill obligation, so the BEHAVIOURAL sentence — the
  // only part an executor reads — could be deleted from ten of the twelve deltas
  // with every gate green (only `refine-story` and `map-subdomains` were pinned,
  // byte-for-byte, by `process-profile.test.ts`).
  it('fails when the delta drops the DIRECT warn-and-confirm clause', () => {
    writeSkill(
      'process/review',
      delta(
        'review',
        'A **composed** invocation never prompts — it degrades exactly as a step that is not ' +
          'installed. See [gate](process-profile-gate.md).',
      ),
    )
    expect(checkStepMarkers(entries, root).join('\n')).toContain('never states the DIRECT')
  })

  it('fails when the delta drops the COMPOSED never-prompt clause', () => {
    writeSkill(
      'process/review',
      delta(
        'review',
        "A **direct** invocation while a step is disabled by the project's profile warns and " +
          'asks for confirmation. See [gate](process-profile-gate.md).',
      ),
    )
    expect(checkStepMarkers(entries, root).join('\n')).toContain('never states the COMPOSED')
  })

  it('fails when the skill carries the marker but no `## Process Profile` section at all', () => {
    writeSkill(
      'process/review',
      `<!-- process-step: id=review -->\n\n${CLAUSES} [gate](process-profile-gate.md)\n`,
    )
    expect(checkStepMarkers(entries, root).join('\n')).toContain('`## Process Profile` section')
  })

  it('does NOT let the linked CONVENTION itself satisfy the clauses (it is one level up)', () => {
    // `../../../.pair/knowledge/**/process-profile-gate.md` states both clauses;
    // resolving through it would make every delta pass by carrying a link.
    mkdirSync(join(root, 'conv'), { recursive: true })
    writeFileSync(join(root, 'conv', 'process-profile-gate.md'), `${CLAUSES}\n`)
    writeSkill('process/review', delta('review', 'See [gate](../../conv/process-profile-gate.md).'))
    expect(checkStepMarkers(entries, root).join('\n')).toContain('never states the DIRECT')
  })
})

// The same finding, run against the file the reviewer corrupted: the REAL
// `/implement` delta with its behavioural sentence deleted, leaving the marker and
// the bare pointer — the exact shape that printed `PASS — 44 skills conformant`.
describe('checkStepMarkers — the REAL /implement delta, stripped', () => {
  const root = mkdtempSync(join(tmpdir(), 'step-delta-real-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const real = readFileSync(
    join(__dirname, '../..', 'dataset/.skills/process/implement/SKILL.md'),
    'utf-8',
  )
  const entries = [
    { id: 'implement', howTo: null, executable: '/implement', requires: [] as string[] },
  ]
  const corpusWith = (content: string): string => {
    const dir = mkdtempSync(join(root, 'corpus-'))
    mkdirSync(join(dir, 'process/implement'), { recursive: true })
    writeFileSync(join(dir, 'process/implement', 'SKILL.md'), content)
    return dir
  }

  it('the shipped delta passes', () => {
    expect(checkStepMarkers(entries, corpusWith(real))).toEqual([])
  })

  it('the same file with the delta sentence deleted fails', () => {
    const stripped = real.replace(/A \*\*direct\*\* invocation[\s\S]*?No section ⇒ no-op\. /, '')
    expect(stripped).not.toBe(real)
    expect(checkStepMarkers(entries, corpusWith(stripped)).join('\n')).toContain('never states the')
  })
})

// Round 1 Minor: `checkStepMarkers` ran over the DATASET only, so the installed
// mirrors — the files an assistant actually loads — were unguarded. Deleting a
// `<!-- process-step: id=review -->` from `.claude/skills/pair-process-review/SKILL.md`
// left every gate green: that skill can no longer tell which step it is, its profile
// gate never fires under `poc`, and nothing reports it.
describe('checkStepMarkersInMirror', () => {
  const root = mkdtempSync(join(tmpdir(), 'step-markers-mirror-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const dataset = join(root, 'dataset')
  const mirror = join(root, 'mirror')

  const write = (base: string, dir: string, file: string, body: string): void => {
    mkdirSync(join(base, dir), { recursive: true })
    writeFileSync(join(base, dir, file), body)
  }
  const skill = (base: string, dir: string, body: string): void =>
    write(base, dir, 'SKILL.md', `---\nname: x\ndescription: "x"\n---\n${body}`)

  const entries = [{ id: 'review', howTo: null, executable: '/review', requires: [] as string[] }]
  const CLAUSES =
    "A **direct** invocation while a step is disabled by the project's profile warns and asks " +
    'for confirmation; a **composed** one never prompts — it degrades exactly as a step that is ' +
    'not installed. No section ⇒ no-op.'
  const good = `## Process Profile\n\n<!-- process-step: id=review -->\n\n${CLAUSES} See [gate](process-profile-gate.md).\n`

  it('passes when the mirror carries the same marker and a gate pointer', () => {
    skill(dataset, 'process/review', good)
    skill(mirror, 'pair-process-review', good)
    expect(checkStepMarkersInMirror(entries, dataset, mirror)).toEqual([])
  })

  it('fails when the mirror LOST the marker the dataset declares', () => {
    skill(dataset, 'process/review', good)
    skill(mirror, 'pair-process-review', 'See [gate](process-profile-gate.md).\n')
    expect(checkStepMarkersInMirror(entries, dataset, mirror).join('\n')).toContain('declares no')
  })

  it('fails when the mirrored skill is missing entirely', () => {
    skill(dataset, 'process/review', good)
    rmSync(join(mirror, 'pair-process-review'), { recursive: true, force: true })
    expect(checkStepMarkersInMirror(entries, dataset, mirror).join('\n')).toContain('not installed')
  })

  it('accepts the gate pointer disclosed to a mirrored SIBLING', () => {
    skill(dataset, 'process/review', good)
    skill(
      mirror,
      'pair-process-review',
      '## Process Profile\n\n<!-- process-step: id=review -->\n\nSee [more](more.md).\n',
    )
    write(
      mirror,
      'pair-process-review',
      'more.md',
      `${CLAUSES} See [gate](process-profile-gate.md).\n`,
    )
    expect(checkStepMarkersInMirror(entries, dataset, mirror)).toEqual([])
  })
})

// Round 1 Major: the profile was reachable from `/next` and from the 12 step skills,
// but nothing a human with NO skills installed reads mentioned it — so a `poc` team
// following AGENTS.md step 3 picked `03-how-to-create-and-prioritize-initiatives.md`
// and ran by hand a step the project declared it does not run, with no warning.
describe('checkManualPathEntrypoint', () => {
  const flow = (extra: string): string =>
    `# AGENTS.md\n\n## 🎯 Quick Start Process\n\n**Without skills** (manual flow):\n\n1. Understand the project\n${extra}2. Identify your task using \`.pair/knowledge/how-to/\`\n\n## Available Tasks\n\nsomething\n`

  const governed =
    '2. **Check the process profile**: `.pair/adoption/tech/way-of-working.md` → `## Process Profile`; the step-catalogue.md maps each step to its how-to guide.\n'

  it('passes when the manual flow points at the profile, the file and the catalogue', () => {
    expect(checkManualPathEntrypoint(flow(governed))).toEqual([])
  })

  it('fails when the manual flow never mentions the profile', () => {
    expect(checkManualPathEntrypoint(flow('')).join('\n')).toContain('Process Profile')
  })

  it('does NOT accept the mention living outside the manual flow section', () => {
    const elsewhere = `${flow('')}\n## Notes\n\n\`## Process Profile\` in way-of-working.md, step-catalogue.md.\n`
    expect(checkManualPathEntrypoint(elsewhere)).not.toEqual([])
  })

  it('fails when the Quick Start section is missing altogether', () => {
    expect(checkManualPathEntrypoint('# AGENTS.md\n\nnothing here\n').join('\n')).toContain(
      'Quick Start',
    )
  })
})

describe('extractProfileExamples', () => {
  it('finds the fenced worked examples, and nothing else', () => {
    const doc =
      '# Schema\n\n```text\n## Process Profile\n\n- `profile`: `poc`\n```\n\n```text\nunrelated\n```\n\n## Process Profile\n\n- `profile`: `custom`\n'
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(examples[0]).toContain('`poc`')
  })

  // Round 4 Major: the shipped adoption TEMPLATE writes its examples as BARE key
  // lines — the heading is the prose above the fence, not inside it. Requiring the
  // heading inside the block made every template example invisible to the gate.
  it('accepts a fence carrying only key lines, and gives it the heading to parse by', () => {
    const doc = '# WoW\n\n## Process Profile\n\nExample:\n\n```text\n- `profile`: `poc`\n```\n'
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(parseWowProfileSection(examples[0] as string)).toMatchObject({
      present: true,
      profile: 'poc',
    })
  })

  it('still ignores a fence that declares no profile key at all', () => {
    const doc = '```text\n- `code-host`: `github`\n- `base-branch`: `main`\n```\n'
    expect(extractProfileExamples(doc)).toEqual([])
  })

  it('does not double the heading when the fence already carries one', () => {
    const doc = '```text\n## Process Profile\n\n- `profile`: `poc`\n```\n'
    const [example] = extractProfileExamples(doc)
    expect((example as string).match(/## Process Profile/g)).toHaveLength(1)
    expect(parseWowProfileSection(example as string).sectionHalts).toEqual([])
  })

  // Round 5 Major: extraction matched only ```[a-z]*\n, so any info string that is
  // not bare lowercase made the example invisible again — while the section
  // parser's own fence skipper still skipped it, leaving it neither read as a
  // declaration nor checked as an example. A titled fence is an ordinary docs edit
  // on the file `pair update` writes into every adopting project.
  it.each([
    ['a titled info string', '```text title="custom subset"'],
    ['an uppercase info string', '```TEXT'],
    ['no info string at all', '```'],
    ['a `~~~` fence', '~~~text'],
    ['a 4-backtick fence', '````text'],
  ])('extracts an example behind %s', (_, open) => {
    const close = open.startsWith('~') ? '~~~' : open.replace(/[^`]/g, '')
    const doc = `## Process Profile\n\nExample:\n\n${open}\n- \`profile\`: \`poc\`\n${close}\n`
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(parseWowProfileSection(examples[0] as string).profile).toBe('poc')
  })

  it('does not close a ``` fence on a `~~~` line inside it', () => {
    const doc = '```text\n~~~\n- `profile`: `poc`\n```\n'
    expect(extractProfileExamples(doc)).toHaveLength(1)
  })

  // Round 6 Minor: a closing fence must be at least as long as the one that opened
  // it (CommonMark). The recognizer's backreference already enforces that; pinned
  // here so it stays mirrored with `scanFences`, which did NOT.
  it('takes a ````-fenced block containing a ``` example as ONE example', () => {
    const doc = '## Process Profile\n\n````text\n```\n- `profile`: `poc`\n```\n````\n'
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(examples[0]).toContain('```')
  })

  it('reads a CRLF document', () => {
    const doc = '## Process Profile\r\n\r\n```text\r\n- `profile`: `poc`\r\n```\r\n'
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(parseWowProfileSection(examples[0] as string).profile).toBe('poc')
  })
})

describe('checkShippedProfileProse — the shipped TEMPLATE’s worked examples', () => {
  const entries = [
    { id: 'brainstorm', howTo: null, executable: '/brainstorm', requires: [] as string[] },
    {
      id: 'plan-stories',
      howTo: null,
      executable: '/plan-stories',
      requires: ['brainstorm'],
    },
    { id: 'refine-story', howTo: null, executable: '/refine-story', requires: ['plan-stories'] },
    { id: 'plan-tasks', howTo: null, executable: '/plan-tasks', requires: ['refine-story'] },
    { id: 'implement', howTo: null, executable: '/implement', requires: ['plan-tasks'] },
    { id: 'review', howTo: null, executable: '/review', requires: ['implement'] },
  ]
  const builtIns = {
    default: '*' as const,
    poc: ['brainstorm', 'plan-stories', 'refine-story', 'plan-tasks', 'implement'],
  }
  const shippedTemplate = readFileSync(join(__dirname, '../..', WOW_TEMPLATE_FILE), 'utf-8')

  const roots: string[] = []
  // The prose root sits two levels DOWN inside the temp box: the sweep reaches
  // outside the package (`../../apps/website/…`, `../../.pair/…`) exactly as the
  // mirror check does, and those writes must stay inside the box.
  const proseRootWithFiles = (files: Record<string, string>): string => {
    const box = mkdtempSync(join(tmpdir(), 'wow-template-'))
    roots.push(box)
    const root = join(box, 'repo', 'packages', 'knowledge-hub')
    for (const [rel, content] of Object.entries(files)) {
      const path = join(root, rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
    return root
  }
  // Round 10 Minor: a governed file that is absent is an ERROR now, not a skip, so
  // every box is seeded with a clean copy of all five and each test overrides the
  // one it is about.
  const GOVERNED_DEFAULTS: Record<string, string> = {
    ...Object.fromEntries(PROFILE_PROSE_FILES.map(f => [f, '# doc\n\nNo worked example.\n'])),
    ...Object.fromEntries(
      PROFILE_DECLARATION_FILES.map(f => [f, '## Process Profile\n\n- `profile`: `poc`\n']),
    ),
    [WOW_TEMPLATE_FILE]: shippedTemplate,
  }
  const checkFiles = (files: Record<string, string>): string[] =>
    checkShippedProfileProse(
      proseRootWithFiles({ ...GOVERNED_DEFAULTS, ...files }),
      entries,
      builtIns,
    )
  const check = (template: string): string[] => checkFiles({ [WOW_TEMPLATE_FILE]: template })
  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true })
  })

  it('passes on the template as shipped', () => {
    expect(check(shippedTemplate)).toEqual([])
  })

  // Round 10 Minor: both loops did `if (!existsSync(path)) continue`, so a governed
  // file that was MISSING or RENAMED was silently not checked while the CLI printed
  // a PASS banner naming it as validated — zero errors being the same observable
  // result as "all five validated clean". Two of the five reach outside the package
  // into the docs site, so any reorganisation there dropped a page out of the gate
  // with no signal. A guard that answers "nothing to check" when its input is gone
  // is indistinguishable from one that passes (approval-rounds.md, "fail closed,
  // everywhere").
  it('reports a governed file that is MISSING instead of skipping it', () => {
    const errors = checkShippedProfileProse(proseRootWithFiles({}), entries, builtIns)
    for (const file of new Set([...PROFILE_DECLARATION_FILES, ...PROFILE_PROSE_FILES])) {
      expect(errors.some(e => e.startsWith(`${file}: `) && e.includes('not found'))).toBe(true)
    }
  })

  it('reports a RENAMED docs page — the one the gate cannot see move', () => {
    const page = '../../apps/website/content/docs/reference/pair-next.mdx'
    const relocated = Object.fromEntries(
      Object.entries(GOVERNED_DEFAULTS).map(([rel, body]) => [
        rel === page ? '../../apps/website/docs/reference/pair-next.mdx' : rel,
        body,
      ]),
    )
    const errors = checkShippedProfileProse(proseRootWithFiles(relocated), entries, builtIns)
    expect(errors.join('\n')).toContain(`${page}: `)
    expect(errors.join('\n')).toContain('not found')
  })

  // The concrete failure the gate used to certify: one character in the template's
  // `custom` example, copied by every adopting project, HALTing at /next.
  it('FAILS when a step id in the template’s custom example is corrupted', () => {
    const corrupted = shippedTemplate.replace('`plan-stories`,', '`plan-storys`,')
    expect(corrupted).not.toBe(shippedTemplate)
    expect(check(corrupted).join('\n')).toContain('unknown step id')
  })

  it('FAILS when the template’s `poc` example names a profile that does not exist', () => {
    // Anchored on the FENCE, not on the bare key line: the template's prose
    // mentions the same line, and a first-occurrence replace corrupted that
    // sentence instead of the worked example — leaving the example intact and the
    // test green whatever the gate did (found while adding the round-9 case bullet
    // one line above it).
    const corrupted = shippedTemplate.replace(
      /```text\n- `profile`: `poc`\n```/,
      '```text\n- `profile`: `pocc`\n```',
    )
    expect(corrupted).not.toBe(shippedTemplate)
    expect(check(corrupted).join('\n')).toContain('unknown process profile')
  })

  // Round 5 Major: the round-4 fix held only for the exact fence spelling shipped
  // that day. Retitling a fence — an ordinary docs edit — made the example
  // invisible to the gate again, so a corrupted step id in the file `pair update`
  // writes into every adopting project shipped green.
  it.each([
    ['a titled fence', '```text title="custom subset"', '```'],
    ['a `~~~` fence', '~~~text', '~~~'],
  ])('FAILS on a corrupted example behind %s', (_, open, close) => {
    // Only the `custom` example's own fence is respelled — the template carries
    // other fences whose delimiters must stay matched.
    const retitled = shippedTemplate.replace(
      /```text\n(- `profile`: `custom`[\s\S]*?)```/,
      (_m, body: string) => `${open}\n${body}${close}`,
    )
    expect(retitled).not.toBe(shippedTemplate)
    const corrupted = retitled.replace('`plan-stories`,', '`plan-storys`,')
    expect(corrupted).not.toBe(retitled)
    expect(checkFiles({ [WOW_TEMPLATE_FILE]: corrupted }).join('\n')).toContain('unknown step id')
  })

  // Round 5 Minor: the error named the RESOLUTION's fallback profile, because
  // every HALT path returns `default` — so a corrupted `custom` example printed
  // "worked example (`default`)", and `default` accepts no whitelist at all.
  it('labels an example by position and by the profile IT declares', () => {
    const template =
      '## Process Profile\n\n```text\n- `profile`: `poc`\n```\n\n```text\n- `profile`: `custom`\n- `whitelist`: `plan-storys`\n```\n'
    const errors = check(template).join('\n')
    expect(errors).toContain('worked example #2 (`custom`)')
    expect(errors).not.toContain('(`default`)')
  })

  // Round 5 Minor: the sweep resolved worked examples in exactly two files, so the
  // feature's own public documentation — and the way-of-working `/next` reads when
  // run in this repo — carried the same declarations with no gate behind them.
  it.each([
    ['the docs concepts page', '../../apps/website/content/docs/concepts/adoption-files.mdx'],
    ['the docs reference page', '../../apps/website/content/docs/reference/pair-next.mdx'],
    ['this repo’s own way-of-working', '../../.pair/adoption/tech/way-of-working.md'],
  ])('sweeps the worked examples of %s', (_, file) => {
    const page =
      '## Process Profile\n\n```text\n## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `plan-stories`\n```\n'
    expect(checkFiles({ [file]: page }).join('\n')).toContain('none of its prerequisites')
    expect(checkFiles({ [file]: page }).join('\n')).toContain(file)
  })

  // Round 7 Minor: the sweep read this repo's own way-of-working for FENCED
  // examples ONLY, and its `## Process Profile` section carries none — so the
  // one thing that matters about that file (the declaration `/next` resolves
  // when run here) was checked by nothing, while the gate's PASS line named the
  // file as checked. A `pocc` typo shipped green and HALTed every `/next`.
  it.each([
    ['the shipped adoption template', WOW_TEMPLATE_FILE],
    ['this repo’s own way-of-working', REPO_WOW_FILE],
  ])('resolves %s as a DECLARATION, not only as a bag of examples', (_, file) => {
    const declared = '# Way of Working\n\n## Process Profile\n\n- `profile`: `pocc`\n'
    const errors = checkFiles({ [file]: declared }).join('\n')
    expect(errors).toContain('unknown process profile `pocc`')
    expect(errors).toContain(file)
  })

  it('reports a declared-profile WARNING from this repo’s own way-of-working too', () => {
    const declared =
      '# Way of Working\n\n## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`\n'
    expect(checkFiles({ [REPO_WOW_FILE]: declared }).join('\n')).toContain(
      'none of its prerequisites',
    )
  })

  it('passes on this repo’s own way-of-working as committed', () => {
    const repoWow = join(__dirname, '../..', REPO_WOW_FILE)
    expect(existsSync(repoWow)).toBe(true)
    expect(checkFiles({ [REPO_WOW_FILE]: readFileSync(repoWow, 'utf-8') })).toEqual([])
  })
})

describe('checkProcessProfiles', () => {
  const entries = [
    { id: 'specify-prd', howTo: null, executable: '/specify-prd', requires: [] as string[] },
    { id: 'brainstorm', howTo: null, executable: '/brainstorm', requires: [] as string[] },
    { id: 'plan-epics', howTo: null, executable: '/plan-epics', requires: ['specify-prd'] },
    {
      id: 'plan-stories',
      howTo: null,
      executable: '/plan-stories',
      requires: ['plan-epics', 'brainstorm'],
    },
  ]

  it('accepts `*` and a prerequisite-closed list', () => {
    expect(
      checkProcessProfiles(
        { default: '*', poc: ['specify-prd', 'brainstorm', 'plan-stories'] },
        entries,
      ),
    ).toEqual([])
  })

  it('accepts an any-of prerequisite satisfied by the ALTERNATIVE member', () => {
    // `plan-stories` requires `plan-epics` OR `brainstorm`; the strategic chain is
    // off and discovery is on — the shipped `poc` shape.
    expect(checkProcessProfiles({ poc: ['brainstorm', 'plan-stories'] }, entries)).toEqual([])
  })

  it('rejects a profile whose enabled step has NO enabled prerequisite', () => {
    expect(checkProcessProfiles({ poc: ['plan-stories'] }, entries).join('\n')).toContain(
      'none of its prerequisites',
    )
  })

  it('rejects an unknown step id', () => {
    expect(checkProcessProfiles({ poc: ['ghost'] }, entries).join('\n')).toContain(
      'not a catalogued step id',
    )
  })

  it('rejects an empty whitelist as a misconfiguration, not “everything disabled”', () => {
    const errors = checkProcessProfiles({ poc: [] }, entries).join('\n')
    expect(errors).toContain('enables no step')
    expect(errors).toContain('misconfiguration')
  })
})

// Round 11 Major: the gate bound the DATASET copies of the three files the feature
// rests on and left the GENERATED ones — the copies `/next`, every step skill and
// every human actually read at runtime — ungoverned. Deleting the `brainstorm` row
// from `.pair/knowledge/**/step-catalogue.md`, typo-ing `poc`'s first whitelist id
// in the installed `process-profiles.md`, or replacing the manual-flow profile step
// in the root `AGENTS.md`/`CLAUDE.md` each printed `PASS — 44 skills conformant`.
// Fixtures are the REAL files, corrupted exactly as the reviewer corrupted them.
describe('checkInstalledProfileCorpus — the copies a reader resolves', () => {
  const REPO = join(__dirname, '../..')
  const SKILLS = join(REPO, 'dataset/.skills')
  const INSTALLED_KB = '.pair/knowledge/guidelines/technical-standards/ai-development'
  const DATASET_KB = `dataset/${INSTALLED_KB}`

  const real = (rel: string): string => readFileSync(join(REPO, rel), 'utf-8')
  const datasetCatalogue = real(`${DATASET_KB}/step-catalogue.md`)
  const datasetProfiles = real(`${DATASET_KB}/process-profiles.md`)
  const entries = parseStepCatalogue(datasetCatalogue)
  const builtIns = parseProcessProfiles(datasetProfiles)

  const DEFAULTS: Record<string, string> = {
    [`${DATASET_KB}/step-catalogue.md`]: datasetCatalogue,
    [`${DATASET_KB}/process-profiles.md`]: datasetProfiles,
    [`../../${INSTALLED_KB}/step-catalogue.md`]: real(`../../${INSTALLED_KB}/step-catalogue.md`),
    [`../../${INSTALLED_KB}/process-profiles.md`]: real(
      `../../${INSTALLED_KB}/process-profiles.md`,
    ),
    [`../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`]: real(
      `../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`,
    ),
    '../../AGENTS.md': real('../../AGENTS.md'),
    '../../CLAUDE.md': real('../../CLAUDE.md'),
  }

  const boxes: string[] = []
  afterAll(() => {
    for (const b of boxes) rmSync(b, { recursive: true, force: true })
  })

  const check = (overrides: Record<string, string | null>): string[] => {
    const box = mkdtempSync(join(tmpdir(), 'installed-corpus-'))
    boxes.push(box)
    const root = join(box, 'repo', 'packages', 'knowledge-hub')
    for (const [rel, content] of Object.entries({ ...DEFAULTS, ...overrides })) {
      if (content === null) continue
      const path = join(root, rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content)
    }
    return checkInstalledProfileCorpus(SKILLS, root, entries, builtIns)
  }

  it('passes on the real installed copies', () => {
    expect(check({})).toEqual([])
  })

  it('fails when the installed catalogue LOST a step the dataset ships', () => {
    const rel = `../../${INSTALLED_KB}/step-catalogue.md`
    const without = (DEFAULTS[rel] as string)
      .split('\n')
      .filter(l => !l.startsWith('| `brainstorm`'))
      .join('\n')
    expect(check({ [rel]: without }).join('\n')).toContain('brainstorm')
  })

  it('fails when an installed `requires` cell drifts from the dataset', () => {
    const rel = `../../${INSTALLED_KB}/step-catalogue.md`
    const drifted = (DEFAULTS[rel] as string).replace(
      /^(\| `review`.*\| )`implement`/m,
      '$1`plan-tasks`',
    )
    expect(drifted).not.toBe(DEFAULTS[rel])
    expect(check({ [rel]: drifted }).join('\n')).toContain('requires')
  })

  it('fails when an installed executable is left UNTRANSFORMED', () => {
    const rel = `../../${INSTALLED_KB}/step-catalogue.md`
    const untransformed = (DEFAULTS[rel] as string).replace(
      '`/pair-process-review`',
      '`/review`            ',
    )
    expect(untransformed).not.toBe(DEFAULTS[rel])
    expect(check({ [rel]: untransformed }).join('\n')).toContain('/pair-process-review')
  })

  it('fails on a typo in an installed built-in whitelist', () => {
    const rel = `../../${INSTALLED_KB}/process-profiles.md`
    // `poc`'s FIRST whitelist id, in the built-in table (the reviewer's corruption).
    const typo = (DEFAULTS[rel] as string).replace(
      /^(\| `poc`\s*\|\s*)`specify-prd`/m,
      '$1`spcify-prd`',
    )
    expect(typo).not.toBe(DEFAULTS[rel])
    expect(check({ [rel]: typo }).join('\n')).toContain('process-profiles.md')
  })

  it('fails CLOSED when an installed governed file is missing', () => {
    const rel = `../../${INSTALLED_KB}/step-catalogue.md`
    expect(check({ [rel]: null }).join('\n')).toContain('not found')
  })

  // Round 12 Major, corruption 2: the CELLS of the installed profile schema were
  // bound and the PROSE around them was not, so a typo inside its `custom` worked
  // example was reported by nothing — while the identical typo in the DATASET copy
  // failed the gate. This repo dogfoods pair: its agents and developers read
  // `.pair/knowledge/**`, and a reader who copies that example into
  // `way-of-working.md` HALTs on every subsequent `/next` run.
  it('fails on a typo in a worked example of the INSTALLED profile schema', () => {
    const rel = `../../${INSTALLED_KB}/process-profiles.md`
    const typo = (DEFAULTS[rel] as string).replace(
      '- `whitelist`: `specify-prd`',
      '- `whitelist`: `spcify-prd`',
    )
    expect(typo).not.toBe(DEFAULTS[rel])
    const errors = check({ [rel]: typo }).join('\n')
    expect(errors).toContain('worked example')
    expect(errors).toContain('spcify-prd')
  })

  // Round 12 Major: the third governed file of the same feature was not bound at
  // all. All twelve installed step skills point at it, and it is the only home of
  // the prompt wording, "proceed silently", the HALT carve-out and `auto=halt`.
  it('fails when the installed gate convention is reduced to a placeholder', () => {
    const rel = `../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`
    const errors = check({ [rel]: '# Process Profile Gate\n\nTODO\n' }).join('\n')
    expect(errors).toContain('DIRECT')
    expect(errors).toContain('COMPOSED')
    expect(errors).toContain('auto=halt')
  })

  // The narrow half of the same corruption: everything else intact, only the
  // unattended resolution gone. No delta carries it, so nothing else can report it
  // — and an unattended `/pair-loop` reaching a disabled step then has no
  // instruction anywhere and the natural default is to run it.
  it('fails when the installed gate convention drops the `auto=halt` resolution', () => {
    const rel = `../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`
    const without = (DEFAULTS[rel] as string).replaceAll('auto=halt', 'auto=proceed')
    expect(without).not.toBe(DEFAULTS[rel])
    const errors = check({ [rel]: without }).join('\n')
    expect(errors).toContain('auto=halt')
    expect(errors).not.toContain('DIRECT')
  })

  // Round 13 Minor: round 12 bound three clauses of this file and added a FOURTH
  // rule to the convention in the same commit — the completion-report filter —
  // without binding it. Deleting that paragraph from the installed copy left
  // `pnpm skills:conformance` at `PASS — 44 skills conformant`, exit 0, its banner
  // still naming `installed gate convention` as validated, while the identical
  // deletion in the DATASET copy reddens. This repo dogfoods pair: an author
  // adding a 13th step skill follows the installed pointer, reads a convention
  // that no longer states the rule, and ships an unfiltered `Next:` line.
  it('fails when the installed gate convention drops the completion-report filter', () => {
    const rel = `../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`
    const without = (DEFAULTS[rel] as string)
      .split('\n')
      .filter(l => !l.startsWith('**A completion report that names a next skill'))
      .join('\n')
    expect(without).not.toBe(DEFAULTS[rel])
    const errors = check({ [rel]: without }).join('\n')
    expect(errors).toContain('Next:')
    expect(errors).not.toContain('DIRECT')
    expect(errors).not.toContain('auto=halt')
  })

  it('fails CLOSED when the installed gate convention is missing', () => {
    const rel = `../../${INSTALLED_KB}/skill-conventions/process-profile-gate.md`
    expect(check({ [rel]: null }).join('\n')).toContain('not found')
  })

  it.each(['AGENTS.md', 'CLAUDE.md'])(
    'fails when the root %s manual flow stops naming the profile',
    file => {
      const rel = `../../${file}`
      const gutted = (DEFAULTS[rel] as string).replace(
        /^3\. \*\*Check the process profile\*\*.*$/m,
        '3. **Check something else**: nothing to see here',
      )
      expect(gutted).not.toBe(DEFAULTS[rel])
      const errors = check({ [rel]: gutted }).join('\n')
      expect(errors).toContain(file)
      expect(errors).toContain('Process Profile')
    },
  )
})

describe('runChecks — the catalogue is required, not optional', () => {
  const root = mkdtempSync(join(tmpdir(), 'no-catalogue-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reports a missing step catalogue instead of skipping the check', () => {
    mkdirSync(join(root, 'process/thing'), { recursive: true })
    writeFileSync(
      join(root, 'process/thing', 'SKILL.md'),
      '---\nname: thing\ndescription: "x"\n---\nbody\n',
    )
    const { errors } = runChecks(root)
    expect(errors.join('\n')).toContain('step-catalogue.md: missing')
  })
})

describe('resolveProcessProfile — the six way-of-working states', () => {
  const entries = [
    { id: 'specify-prd', howTo: null, executable: '/specify-prd', requires: [] as string[] },
    { id: 'brainstorm', howTo: null, executable: '/brainstorm', requires: [] as string[] },
    { id: 'plan-epics', howTo: null, executable: '/plan-epics', requires: ['specify-prd'] },
    {
      id: 'plan-stories',
      howTo: null,
      executable: '/plan-stories',
      requires: ['plan-epics', 'brainstorm'],
    },
    { id: 'implement', howTo: null, executable: '/implement', requires: ['plan-stories'] },
  ]
  const builtIns = { default: '*' as const, poc: ['brainstorm', 'plan-stories', 'implement'] }

  /**
   * A flat VIEW of the resolution union, for assertions only.
   *
   * `profile` and `enabled` exist on the readable arm alone (round 7 Questions),
   * so the view reports them as `null` on a HALT — every halt case below asserts
   * that null, which is the pin that a halted resolution hands out no step set.
   * Production callers never see this shape: they narrow on `ok`, or read
   * `profileProblems`.
   */
  const resolve = (
    wow: string,
  ): {
    profile: string | null
    enabled: string[] | null
    halts: string[]
    warnings: string[]
  } => {
    const r = resolveProcessProfile(parseWowProfileSection(wow), entries, builtIns)
    return {
      profile: r.ok ? r.profile : null,
      enabled: r.ok ? r.enabled : null,
      halts: r.ok ? [] : r.halts,
      warnings: r.ok ? r.warnings : [],
    }
  }

  /**
   * A HALT hands out NO step set — not the full catalogue (the widening this
   * module exists to prevent), not an empty one (the narrowing the schema calls
   * the worse direction). Asserted at every halt case below.
   */
  const expectNoStepSet = (r: { profile: string | null; enabled: string[] | null }): void => {
    expect(r.profile).toBeNull()
    expect(r.enabled).toBeNull()
  }

  // The type-level half of the same finding: the union offers no `enabled` to
  // read from a halted resolution, so the widening cannot be written at all.
  it('a HALTED resolution carries no step set — the arm does not have one', () => {
    const r = resolveProcessProfile(
      parseWowProfileSection('## Process Profile\n\n- `profile`: `pocc`\n'),
      entries,
      builtIns,
    )
    expect(r.ok).toBe(false)
    expect(Object.keys(r).sort()).toEqual(['halts', 'ok'])
    expect(profileProblems(r)).toHaveLength(1)
  })

  it('a READABLE resolution surfaces its warnings through the same accessor', () => {
    const r = resolveProcessProfile(
      parseWowProfileSection(
        '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`\n',
      ),
      entries,
      builtIns,
    )
    expect(r.ok).toBe(true)
    expect(profileProblems(r)).toHaveLength(1)
    expect(profileProblems(r)[0]).toContain('minimal fix')
  })

  it('no section ⇒ `default` ⇒ every step, no halt, no warning (AC1)', () => {
    const r = resolve('# Way of Working\n\n## Quality Gates\n\n- something\n')
    expect(r.profile).toBe('default')
    expect(r.enabled).toEqual(entries.map(e => e.id))
    expect(r.halts).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('`poc` ⇒ the built-in set, DDD/strategic steps excluded (AC3)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.enabled).toEqual(['brainstorm', 'plan-stories', 'implement'])
    expect(r.enabled).not.toContain('plan-epics')
    expect(r.halts).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('a custom whitelist enables exactly what it names (AC4)', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `brainstorm`, `plan-stories`\n',
    )
    expect(r.profile).toBe('custom')
    expect(r.enabled).toEqual(['brainstorm', 'plan-stories'])
    expect(r.halts).toEqual([])
  })

  it('a disabled prerequisite is FLAGGED with the minimal fix, not repaired (AC9)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`\n')
    expect(r.halts).toEqual([])
    expect(r.enabled).toEqual(['implement'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('minimal fix')
    expect(r.warnings[0]).toContain('`plan-stories`')
  })

  it('an empty whitelist is a misconfiguration, NOT "everything disabled" (AC10)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`:\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('misconfiguration')
    // The run reports; it neither disables the whole process nor re-enables it.
    expectNoStepSet(r)
  })

  it('an unknown step id HALTs listing the valid ids (AC5)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `plan-tsaks`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('unknown step id')
    expect(r.halts[0]).toContain('`plan-stories`')
  })

  // Round 8 Minor: a repeated id was neither deduped nor reported. The SAME KEY on
  // two lines HALTs one level up ("only the last is read"), and two values on a
  // `profile` line HALT — but the same authoring mistake INSIDE a whitelist value
  // was silently accepted: one typo produced two byte-identical warnings and an
  // `enabled` list carrying the id twice, so any consumer counting "N steps
  // enabled" over-counted. HALTing rather than deduping is what the duplicate-key
  // precedent does, and a repeated id is genuinely ambiguous — the second name may
  // be a copy-paste that was never edited into the step actually meant.
  it('a whitelist repeating a step id HALTs naming it, never dedupes it in silence', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`, `implement`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`implement`')
    expect(r.halts[0]).toContain('once')
    expect(r.warnings).toEqual([])
    expectNoStepSet(r)
  })

  it('names every repeated id once, whatever the repeat count', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n' +
        '- `whitelist`: `brainstorm`, `implement`, `brainstorm`, `implement`, `brainstorm`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`brainstorm`')
    expect(r.halts[0]).toContain('`implement`')
    expect(r.halts[0].match(/`brainstorm`/g)).toHaveLength(1)
  })

  it('an unknown profile name HALTs listing the known profiles — a different message (AC5)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `pocc`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('unknown process profile')
    expect(r.halts[0]).toContain('`poc`')
    expect(r.halts[0]).not.toContain('unknown step id')
  })

  it('HALTs on a whitelist under a built-in profile rather than ignoring it', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n- `whitelist`: `implement`\n')
    expect(r.halts[0]).toContain('silently ignored')
  })

  it('HALTs on a whitelist with no profile key', () => {
    const r = resolve('## Process Profile\n\n- `whitelist`: `implement`\n')
    expect(r.halts[0]).toContain('only applies to')
  })

  it('never reads a fenced EXAMPLE as a declaration', () => {
    const r = resolve(
      '## Process Profile\n\nOptional. Example:\n\n```text\n- `profile`: `poc`\n```\n',
    )
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Detection is LOOSE, acceptance is STRICT. Round 1 Major: a `profile` key whose
  // value was not backticked matched no key regex at all, so the section resolved to
  // `default` — 12 steps enabled — with zero halts and zero warnings. That narrows in
  // the WIDENING direction, the one direction nothing else catches: a PoC team copying
  // the shape from the schema TABLE rather than the fenced example silently got the
  // full process.
  it('HALTs on a `profile` line whose VALUE is not backticked, never silently `default`', () => {
    const r = resolve('## Process Profile\n\n- `profile`: poc\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    // The message hands back the schema shape rather than naming a state.
    expect(r.halts[0]).toContain('- `profile`: `poc`')
    expectNoStepSet(r)
  })

  it('HALTs on a `profile` line with no backticks at all', () => {
    const r = resolve('## Process Profile\n\n- profile: poc\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
  })

  it('accepts a BOLDED key with a backticked value — a shape, not a different meaning', () => {
    const r = resolve('## Process Profile\n\n- **profile**: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('HALTs on an unreadable `whitelist` line instead of reporting it as EMPTY', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: brainstorm, implement\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expect(r.halts[0]).not.toContain('empty')
  })

  // Round 1 Minor: `custom` with NO whitelist key reported "declares an empty
  // whitelist", sending the reader looking for a line that does not exist — and
  // conflating two distinct mistakes behind one message.
  it('`custom` with no `whitelist` KEY is a different message from an EMPTY whitelist', () => {
    const missing = resolve('## Process Profile\n\n- `profile`: `custom`\n')
    expect(missing.halts).toHaveLength(1)
    expect(missing.halts[0]).toContain('no `whitelist`')
    expect(missing.halts[0]).not.toContain('empty')

    const empty = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`:\n')
    expect(empty.halts[0]).toContain('empty')
    expect(empty.halts[0]).not.toBe(missing.halts[0])
  })

  // Round 1 Minor: the section was located with `content.indexOf('## ' + heading)` —
  // the first TEXTUAL occurrence, prose and fences included. A file that mentions
  // `## Process Profile` in an earlier sentence made that sentence the section start
  // and the real heading its terminator, so the real declaration was never read.
  it('is not fooled by a PROSE cross-reference to the heading', () => {
    const r = resolve(
      '## Way of Working\n\nSee `## Process Profile` below.\n\n## Process Profile\n\n- `profile`: `poc`\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('is not fooled by the heading appearing inside a fenced block', () => {
    const r = resolve(
      '## Intro\n\n```text\n## Process Profile\n\n- `profile`: `custom`\n```\n\n## Process Profile\n\n- `profile`: `poc`\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 3 Minor: heading LEVEL was the one level of the declaration the round-2
  // "detect loosely" fix did not reach. A `### Process Profile` was not a section
  // AND was not reported — `## Git Workflow` + `### Process Profile` over a
  // perfectly valid `- `profile`: `poc`` resolved to `default`, 12 steps, zero
  // halts, zero warnings: byte-identical to having written nothing, in the
  // widening direction nothing downstream catches.
  it.each([
    ['h1', '# Process Profile'],
    ['h3', '### Process Profile'],
    ['h4', '#### Process profile'],
  ])('HALTs on a %s profile heading rather than not seeing it at all', (_, heading) => {
    const r = resolve(`## Git Workflow\n\n- something\n\n${heading}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('heading level')
    expect(r.halts[0]).toContain('## Process Profile')
    // Still not read as the section — but no longer silently.
    expectNoStepSet(r)
  })

  it('HALTs on a mis-levelled heading even when a valid `##` section also exists', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n## Notes\n\n### Process Profile\n\n- `profile`: `custom`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('heading level')
  })

  it('does not read a `### Process Profile Gate` sub-heading as a profile heading', () => {
    const r = resolve('## Notes\n\n### Process Profile Gate\n\n- `profile`: `poc`\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 3 Minor: a SECOND `## Process Profile` section was silently ignored —
  // first match wins, nothing reported. Made likely by this very story: the
  // shipped template AND this repo's own way-of-working.md both already carry a
  // `## Process Profile` section that is present and EMPTY (prose only, no keys),
  // so a team obeying the schema ("the profile lives only in way-of-working.md, in
  // a `## Process Profile` section") by APPENDING one gets total silence —
  // `default`, every step enabled, zero halts, zero warnings.
  it('HALTs when `## Process Profile` is declared more than once', () => {
    const r = resolve(
      '## Process Profile\n\nNothing declared here — the profile is `default`.\n\n' +
        '## Git Workflow\n\n- something\n\n## Process Profile\n\n- `profile`: `poc`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('more than once')
    expectNoStepSet(r)
  })

  it('counts a DECORATED second heading as the same section, not a different one', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n## **Process profile** (optional)\n\n- `profile`: `custom`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('more than once')
  })

  it('does not count a PROSE or FENCED mention as a second section', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n## Notes\n\nSee `## Process Profile` above.\n\n' +
        '```text\n## Process Profile\n\n- `profile`: `custom`\n```\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 2 Major: the whitelist arm flagged a line as unreadable only when it
  // yielded ZERO backticked tokens. A PARTIALLY backticked line yielded ≥1 and was
  // accepted as-is, so every unbackticked id was dropped on the floor — the same
  // silent NARROWING the schema calls the worse direction, reached by the likelier
  // hand-edit (copy a correct example, append one id).
  it('HALTs on a PARTIALLY backticked whitelist instead of dropping the bare ids', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`, plan-stories\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expectNoStepSet(r)
  })

  it('HALTs when a bare id sits BETWEEN two backticked ones', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n' +
        '- `whitelist`: `implement`, plan-stories, `brainstorm`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
  })

  it('still accepts a fully backticked whitelist with irregular spacing', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`:  `brainstorm` ,  `plan-stories`\n',
    )
    expect(r.enabled).toEqual(['brainstorm', 'plan-stories'])
    expect(r.halts).toEqual([])
  })

  // Round 2 Minor: heading DETECTION was exact-match while key detection is
  // deliberately loose — so a decorated heading made the whole declaration
  // evaporate into `default` (every step re-enabled) with zero halts and zero
  // warnings, byte-identical to having written nothing.
  it.each([
    ['sentence case', '## Process profile'],
    ['trailing parenthetical', '## Process Profile (optional)'],
    ['bolded', '## **Process Profile**'],
    ['trailing colon', '## Process Profile:'],
  ])('reads a %s heading as the section rather than widening to `default`', (_, heading) => {
    const r = resolve(`${heading}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 13 Minor: the same widening one notch wider — only TRAILING decoration
  // was stripped, so LEADING decoration and INTERNAL separators left the heading
  // unmatched and the section unread. Each of these four resolved to `default`
  // with all 12 steps, zero halts and zero warnings — byte-identical to writing
  // nothing — while `## 🎯 Quick Start Process` / `## 📋 Available Tasks` are this
  // corpus's own house style in the very files the gate reads.
  it.each([
    ['a leading emoji', '## 🎯 Process Profile'],
    ['a leading numbering', '## 1. Process Profile'],
    ['a doubled internal space', '## Process  Profile'],
    ['a hyphen separator', '## Process-Profile'],
  ])('reads a heading written with %s as the section', (_, heading) => {
    const r = resolve(`${heading}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('does NOT swallow a differently-named heading that merely starts the same', () => {
    const r = resolve('## Process Profile Gate\n\n- `profile`: `poc`\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // The equality survives the wider normalization: an internal separator collapses,
  // an extra WORD does not.
  it('does NOT swallow a hyphen-separated heading that names a different section', () => {
    const r = resolve('## Process-Profile-Gate\n\n- `profile`: `poc`\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 2 Minor: a `profile` line carrying several backticked tokens took
  // `values[0]` silently — the author's parenthetical qualifier decided nothing,
  // and nothing reported that half the line was ignored.
  it('HALTs on a `profile` line carrying more than one backticked value', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc` (not `custom`)\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expectNoStepSet(r)
  })

  // Round 4 Major: the KEY level, between the two the earlier rounds closed. A
  // second SECTION halts and a `profile` LINE with two values halts, but the same
  // key declared on two LINES of one section resolved last-wins in total silence.
  // A team on `poc` hand-adding a `custom` line under the same section lost 7 of 8
  // steps from every /next suggestion, with nothing reported.
  it('HALTs when `profile` is declared on two lines of the same section', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n- `profile`: `custom`\n- `whitelist`: `implement`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expect(r.halts[0]).toContain('more than once')
    expectNoStepSet(r)
  })

  it('HALTs when `whitelist` is declared on two lines of the same section', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`, `brainstorm`\n- `whitelist`: `brainstorm`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expect(r.halts[0]).toContain('more than once')
  })

  // The old behaviour was order-dependent: `custom` then `poc` resolved silently,
  // `poc` then `custom` HALTed on "whitelist under a built-in". Same two lines,
  // opposite outcomes.
  it('reports the duplicate the same way whichever order the two lines are in', () => {
    const body = ['- `profile`: `poc`', '- `profile`: `custom`', '- `whitelist`: `implement`']
    const a = resolve(`## Process Profile\n\n${body.join('\n')}\n`)
    const b = resolve(`## Process Profile\n\n${[body[1], body[0], body[2]].join('\n')}\n`)
    expect(a.halts).toEqual(b.halts)
    expect(a.halts[0]).toContain('more than once')
  })

  it('does not read a repeated key inside a fenced EXAMPLE as a duplicate', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n```text\n- `profile`: `custom`\n```\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 4 Major: `+` is a CommonMark bullet, so `+ `profile`: `poc`` IS the
  // "backticked list item" the schema asks for — and it resolved to `default`,
  // every step re-enabled, byte-identical to writing nothing.
  it('accepts a `+` bullet, the third CommonMark list marker', () => {
    const r = resolve('## Process Profile\n\n+ `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('accepts a `*` bullet', () => {
    const r = resolve('## Process Profile\n\n* `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // A key the author plainly MEANT to declare, on a line whose marker this reader
  // does not accept, is a detected key in an unreadable shape — never "no
  // declaration", which is the silent widening again.
  it.each([
    ['no bullet at all', '`profile`: `poc`'],
    ['an ordered-list marker', '1. `profile`: `poc`'],
    ['an ordered-list paren marker', '1) `profile`: `poc`'],
    ['a leading-space, bullet-less key', '  `profile`: `poc`'],
  ])('HALTs on a `profile` key written with %s', (_, line) => {
    const r = resolve(`## Process Profile\n\n${line}\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expectNoStepSet(r)
  })

  it('HALTs on a bullet-less `whitelist` key too', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n`whitelist`: `implement`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
  })

  // Round 7 Minor: the off-marker comment claimed a `| `profile` | … |` table row
  // as a shape it catches. It does not — and MUST not: the shipped adoption
  // template and the KB schema both document the two keys in a table inside or
  // beside the section, so catching that row would HALT the shipped template.
  // A table row is documentation; only a bullet or a bare backticked key declares.
  it('does not read a documentation TABLE row as a declaration', () => {
    const r = resolve(
      '## Process Profile\n\n| Key | Value |\n| --- | --- |\n' +
        '| `profile` | `poc` |\n| `whitelist` | step ids |\n',
    )
    expect(r.profile).toBe('default')
    expect(r.enabled).toEqual(entries.map(e => e.id))
    expect(r.halts).toEqual([])
  })

  // Round 8 Questions: a key inside a BLOCKQUOTE matched neither the accepted-shape
  // regex (`^\s*[-*+]`, and `>` is not whitespace) nor the off-marker one
  // (`^[ \t]*`), so the whole declaration was invisible text — `default`, all 12
  // steps, zero halts, zero warnings, byte-identical to writing nothing. That is the
  // silent WIDENING direction every other off-shape here HALTs on. The blockquote is
  // ruled the opposite way from the table row on purpose: a table row is the shape
  // the shipped template and the KB schema use to DOCUMENT the keys, while
  // `> - \`profile\`: \`poc\`` is a decorated declaration nothing in this corpus
  // writes as documentation.
  it.each([
    ['a bulleted key inside a blockquote', '> **Note**: PoC subset.\n>\n> - `profile`: `poc`'],
    ['a bare backticked key inside a blockquote', '> `profile`: `poc`'],
    ['a key inside a nested blockquote', '>> - `profile`: `poc`'],
  ])('HALTs on %s instead of resolving to `default`', (_, block) => {
    const r = resolve(`## Process Profile\n\n${block}\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expect(r.halts[0]).toContain('blockquote')
    expectNoStepSet(r)
  })

  it('HALTs on a blockquoted `whitelist` key too', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n\n> - `whitelist`: `implement`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expect(r.halts[0]).toContain('blockquote')
  })

  // The other arm of the same rule: a blockquote OPENS a block, so blockquoted
  // prose right under a key line is not the second half of a wrapped value. Before
  // the blockquote was modelled at all, `isSpilledValueLine` read it as a lazy
  // continuation and HALTed on a perfectly readable declaration.
  it('does not read blockquoted PROSE under a key line as a spilled value', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n> Note: PoC subset.\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('leaves a blockquoted key inside a fence an example', () => {
    const r = resolve('## Process Profile\n\n```text\n> - `profile`: `poc`\n```\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 10 Minor: the two REJECTED-marker patterns required the key to be
  // BACKTICKED while the ACCEPTED-bullet one does not, so each error axis HALTed
  // alone and their INTERSECTION was invisible. `1. profile: poc` and
  // `> - profile: poc` resolved to `{ok:true, profile:'default', enabled:[all 12],
  // warnings:[]}` — byte-identical to writing nothing, the silent WIDENING. The
  // stated reason for requiring backticks is that "without a list marker that is
  // the only signal separating a declaration from a sentence"; `1.` IS a list
  // marker and `> -` carries a bullet, so the requirement over-reached exactly
  // where its own rationale does not. The unbackticked VALUE is the shape the
  // schema's documentation TABLE suggests — the case the accepted-bullet pattern
  // was loosened for in the first place.
  it.each([
    ['an ordered-list marker', '1. profile: poc'],
    ['an ordered-list paren marker', '1) profile: poc'],
    ['a bold ordered-list key', '1. **profile**: poc'],
  ])('HALTs on an UNBACKTICKED `profile` key written with %s', (_, line) => {
    const r = resolve(`## Process Profile\n\n${line}\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expectNoStepSet(r)
  })

  it.each([
    ['a bulleted key inside a blockquote', '> - profile: poc'],
    ['an ordered key inside a blockquote', '> 1. profile: poc'],
    ['a bulleted key inside a nested blockquote', '>> - profile: poc'],
  ])('HALTs on an UNBACKTICKED `profile` key written as %s', (_, line) => {
    const r = resolve(`## Process Profile\n\n${line}\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expect(r.halts[0]).toContain('blockquote')
    expectNoStepSet(r)
  })

  // Asserted on the SHAPE halt, not merely on the key name: unread, this line left
  // `custom` with no whitelist at all, so the run HALTed anyway — with "declares no
  // `whitelist`" about a line visibly in the file, the anti-pattern the schema's own
  // table writes down.
  it('HALTs on an unbackticked ordered `whitelist` key as an unreadable SHAPE', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n\n1. whitelist: implement\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expect(r.halts[0]).toContain('a shape this reader does not accept')
  })

  // The line the requirement was actually drawn for stays where it was: with no
  // list marker of any kind, the backticks are the only thing separating a
  // declaration from a sentence that happens to open on the word.
  it.each([
    ['a marker-less unbackticked key', 'profile: poc'],
    ['a marker-less unbackticked key inside a blockquote', '> profile: poc'],
  ])('does not read %s as a declaration', (_, line) => {
    const r = resolve(`## Process Profile\n\n${line}\n`)
    expect(r.profile).toBe('default')
    expect(r.enabled).toEqual(entries.map(e => e.id))
    expect(r.halts).toEqual([])
  })

  // The third, weaker shape of the same class: the bullet and the backticks are
  // both there, padded inside the ticks. Detected on the accepted pattern (the
  // marker is present and the value is readable), so it RESOLVES rather than
  // HALTs — before, it was neither.
  it('accepts a bulleted key whose backticks are padded', () => {
    const r = resolve('## Process Profile\n\n- ` profile `: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 9 Minor: key detection was CASE-SENSITIVE while the HEADING one level up
  // is not — so `- `Profile`: `poc`` was read by nothing and reported by nothing:
  // `default`, all 12 catalogue steps, zero halts, zero warnings, byte-identical to
  // writing nothing. The heading immediately above the key is Title Case
  // (`## Process Profile`), so mirroring its case into the key is the same class of
  // author error as copying the table's bare key spelling, which this reader already
  // handles. Case belongs to DETECTION (the key's spelling), which is loose; the
  // VALUE stays strict, so `` `POC` `` still HALTs as an unknown profile.
  it.each([
    ['Title Case', 'Profile'],
    ['upper case', 'PROFILE'],
    ['mixed case', 'pRoFiLe'],
  ])('reads a `profile` key spelled in %s as the key', (_, spelling) => {
    const r = resolve(`## Process Profile\n\n- \`${spelling}\`: \`poc\`\n`)
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // The second arm of the same finding, and the worse one: the key WAS invisible,
  // so `custom` HALTed with "declares no `whitelist`" about a line visibly in the
  // file — the very anti-pattern the schema writes down ("one message sends the
  // reader hunting for a line their file does not have").
  it('reads a case-variant `whitelist` key rather than HALTing about a line that is there', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `Whitelist`: `implement`\n')
    expect(r.halts).toEqual([])
    expect(r.enabled).toEqual(['implement'])
  })

  it('counts a case-variant repeat of a key as the SAME key declared twice', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n- `Profile`: `custom`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expectNoStepSet(r)
  })

  // Detection is case-insensitive on the rejected shapes too — otherwise a
  // case-variant key on an off-marker or inside a blockquote reopens the same
  // silent widening one shape lower down. The HALT names the CANONICAL spelling.
  it.each([
    ['no bullet at all', '`Profile`: `poc`'],
    ['an ordered-list marker', '1. `PROFILE`: `poc`'],
    ['a blockquote', '> - `Profile`: `poc`'],
  ])('HALTs on a case-variant key written with %s', (_, line) => {
    const r = resolve(`## Process Profile\n\n${line}\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`profile`')
    expect(r.halts[0]).not.toContain('`Profile`')
    expectNoStepSet(r)
  })

  // The asymmetry the split rests on, pinned in both directions: the KEY's case is
  // detection (loose), the VALUE's is acceptance (strict).
  it('still HALTs on a case-variant VALUE — acceptance stays strict', () => {
    const r = resolve('## Process Profile\n\n- `Profile`: `POC`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('unknown process profile `POC`')
    expectNoStepSet(r)
  })

  // A case-variant key must not turn a documentation table row into a declaration
  // either: the shipped template and the KB schema head their column `Key`, and
  // `| \`Profile\` | \`poc\` |` is as writable as the lowercase row already ruled out.
  it('still reads a case-variant documentation TABLE row as documentation', () => {
    const r = resolve(
      '## Process Profile\n\n| Key | Value |\n| --- | --- |\n| `Profile` | `poc` |\n',
    )
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  it('does not read PROSE mentioning the key as a declaration', () => {
    const r = resolve(
      '## Process Profile\n\nA project that runs a subset declares `profile`: `poc` here.\n',
    )
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  it('does not read the schema TABLE rows as declarations', () => {
    const r = resolve(
      '## Process Profile\n\n| Field | Default |\n| --- | --- |\n| `profile` | `default` |\n| `whitelist` | *(none)* |\n',
    )
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 5 Major: both the key regex and the heading regex ended in `(.*)$` with
  // no `m` flag — `.` cannot match `\r` and `$` anchors at end-of-string, so on a
  // CRLF file EVERY line matched nothing. A team on Windows (`core.autocrlf=true`,
  // the platform default) checks way-of-working.md out with CRLF, writes the
  // documented declaration, and gets `default` with 12 steps, zero halts and zero
  // warnings — byte-identical to writing nothing, with every level of this guard
  // silent at once.
  it('reads a CRLF file exactly as it reads the LF one', () => {
    const crlf = resolve('## Process Profile\r\n\r\n- `profile`: `poc`\r\n')
    expect(crlf.profile).toBe('poc')
    expect(crlf.halts).toEqual([])
    expect(crlf).toEqual(resolve('## Process Profile\n\n- `profile`: `poc`\n'))
  })

  it('reports the SECTION problems on a CRLF file too', () => {
    const dup = resolve(
      '## Process Profile\r\n\r\n- `profile`: `poc`\r\n\r\n## Process Profile\r\n\r\n- `profile`: `custom`\r\n',
    )
    expect(dup.halts).toHaveLength(1)
    expect(dup.halts[0]).toContain('more than once')

    const misLevelled = resolve('### Process Profile\r\n\r\n- `profile`: `poc`\r\n')
    expect(misLevelled.halts).toHaveLength(1)
    expect(misLevelled.halts[0]).toContain('heading level')
  })

  // Round 5 Minor: only ``` fences were skipped inside the section, so an
  // illustrative example written in either other CommonMark code-block form was
  // read as the project's real declaration — the 4-space-indented one silently
  // BECAME the profile, and a `~~~` one carrying a placeholder id HALTed /next
  // with an error naming a step the project never configured.
  it('does not read a `~~~`-fenced example as the declaration', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n~~~text\n- `profile`: `custom`\n- `whitelist`: `nope-not-a-step`\n~~~\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 6 Minor: four spaces (or a tab) in front of a key is ALSO a legitimate
  // CommonMark sublist, and the two are indistinguishable from the line alone. The
  // ambiguity was resolved silently in the widening direction — skipped as an
  // example, section resolved to `default`, all 12 steps back, zero halts — while
  // the SAME content indented by two spaces resolved to `poc`. Which one a team got
  // depended on their editor's Tab width.
  it.each([
    ['four spaces', '    '],
    ['a tab', '\t'],
  ])('HALTs on a key indented by %s rather than skipping it as an example', (_, indent) => {
    const r = resolve(`## Process Profile\n\n- Configuration:\n${indent}- \`profile\`: \`poc\`\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('does not accept')
    expectNoStepSet(r)
  })

  it('still reads a key nested under a bullet by TWO spaces', () => {
    const r = resolve('## Process Profile\n\n- Configuration:\n  - `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('does not read an indented code block with no key line as a declaration', () => {
    const r = resolve('## Process Profile\n\nFor example:\n\n    some sample text\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  it('still closes a ``` fence on ``` and not on a `~~~` line inside it', () => {
    const r = resolve(
      '## Process Profile\n\n```text\n~~~\n- `profile`: `custom`\n```\n\n- `profile`: `poc`\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 5 Minor: three CommonMark-valid spellings of the heading were neither
  // matched nor reported — each re-enabled all 12 steps on a project that declared
  // `poc`, indistinguishable from having written nothing.
  it.each([
    ['closed ATX', '## Process Profile ##'],
    ['a 3-space indent', '   ## Process Profile'],
    ['both', '  ## Process Profile  ##'],
  ])('reads a heading written with %s as the section', (_, heading) => {
    const r = resolve(`${heading}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it.each([
    ['a level-2 underline', '---------------'],
    ['a level-1 underline', '==============='],
  ])('HALTs on a setext heading with %s rather than not seeing it', (_, underline) => {
    const r = resolve(`Process Profile\n${underline}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('SETEXT')
    expect(r.halts[0]).toContain('## Process Profile')
    expectNoStepSet(r)
  })

  it('does not read a `---` after unrelated prose as a setext profile heading', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n\nSome prose\n\n---\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 6 Major: a whitelist WRAPPED onto a second line was truncated in silence.
  // The residue check erased the trailing `,` before looking, so the first line read
  // as complete, and the continuation line matched no key regex and was discarded.
  // The shipped example is 131 columns wide, so wrapping it is the natural edit in
  // any project whose markdownlint keeps the default 80-column rule.
  it('HALTs on a whitelist wrapped onto a second line instead of truncating it', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n' +
        '- `whitelist`: `specify-prd`, `brainstorm`,\n  `plan-stories`, `implement`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('ONE line')
    expectNoStepSet(r)
  })

  it('HALTs on a value line that ends on a dangling separator', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`,\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('ONE line')
  })

  it('HALTs on a value continued on the next line with no trailing separator', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n' +
        '- `whitelist`: `specify-prd` `brainstorm`\n  `plan-stories` `implement`\n',
    )
    expect(r.halts.join('\n')).toContain('ONE line')
  })

  it('leaves an ordinary paragraph after a key line alone', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\nThe profile governs the step, not a skill.\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('leaves a following bullet that is not a key alone', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n- see the KB schema for the rest\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  // Round 6 Minor: the fence scanner tracked the fence CHARACTER but not its LENGTH,
  // so the inner ``` closed the outer ````. Wrapping a four-backtick fence around a
  // block that itself contains backticks is exactly how a markdown example of a
  // backticked declaration is shown — which is all this section documents.
  it('does not let an inner ``` close an outer ```` fence', () => {
    const r = resolve(
      '## Process Profile\n\n````text\n```\n- `profile`: `poc`\n```\n````\n\n' +
        '- `profile`: `custom`\n- `whitelist`: `implement`, `plan-stories`\n',
    )
    expect(r.profile).toBe('custom')
    expect(r.enabled).toEqual(['implement', 'plan-stories'])
    expect(r.halts).toEqual([])
  })

  it('reads a nested example alone as no declaration at all', () => {
    const r = resolve('## Process Profile\n\n````text\n```\n- `profile`: `poc`\n```\n````\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 6 Minor: commenting a block out is the ordinary way to disable it without
  // deleting it, and an HTML comment is the same class of non-content as a fence.
  it('does not count a commented-out section as a second section', () => {
    const r = resolve(
      '<!--\n## Process Profile\n\n- `profile`: `custom`\n-->\n\n' +
        '## Process Profile\n\n- `profile`: `poc`\n',
    )
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('does not read a commented-out key inside the live section', () => {
    const r = resolve('## Process Profile\n\n<!-- - `profile`: `custom` -->\n- `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
  })

  it('still reads a `<!-- -->` example printed inside a fence as an example', () => {
    const r = resolve('## Process Profile\n\n```text\n<!-- - `profile`: `custom` -->\n```\n')
    expect(r.profile).toBe('default')
    expect(r.halts).toEqual([])
  })

  // Round 6 Minor: `open` stayed set for every remaining line, so the real heading
  // was inside a fence as far as the reader was concerned and the section was simply
  // not found — `default`, 12 steps, byte-identical to writing nothing.
  it('HALTs on an UNTERMINATED fence above the section instead of not seeing it', () => {
    const r = resolve('## Intro\n\n```text\nblah\n\n## Process Profile\n\n- `profile`: `poc`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('UNTERMINATED')
    expectNoStepSet(r)
  })

  it('HALTs on an unterminated HTML comment for the same reason', () => {
    const r = resolve('## Intro\n\n<!-- parked\n\n## Process Profile\n\n- `profile`: `poc`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('UNTERMINATED')
  })

  // Round 11 Minor: the section ended only at the next LEVEL-2 heading, so a level-1
  // one did not terminate it and every key under that `#` was read as still inside
  // `## Process Profile` — reported as "declares `profile` more than once (2 lines)"
  // about a section that visibly carries one, sending the author looking for a
  // duplicate that is not there.
  it('ends the section at a LEVEL-1 heading too, not only at the next level-2 one', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n# Other\n\n- `profile`: `custom`\n',
    )
    expect(r.halts).toEqual([])
    expect(r.profile).toBe('poc')
    expect(r.enabled).toEqual(['brainstorm', 'plan-stories', 'implement'])
  })

  // The other half of the same predicate, unchanged on purpose (documented at the
  // level-check HALT): an `###` sub-heading is legitimately INSIDE a section.
  it('keeps a `###` sub-heading inside the section', () => {
    const r = resolve('## Process Profile\n\n### The keys\n\n- `profile`: `poc`\n')
    expect(r.halts).toEqual([])
    expect(r.profile).toBe('poc')
  })
})
