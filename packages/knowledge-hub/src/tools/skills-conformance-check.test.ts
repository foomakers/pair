import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  checkProcessProfiles,
  resolveProcessProfile,
  parseWowProfileSection,
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

  it('passes when the executable declares its id and points at the convention', () => {
    writeSkill(
      'process/review',
      '<!-- process-step: id=review -->\nSee [gate](process-profile-gate.md).\n',
    )
    writeSkill('capability/estimate', 'No marker here.\n')
    expect(checkStepMarkers(entries, root)).toEqual([])
  })

  it('fails when the executable declares no marker', () => {
    writeSkill('process/review', 'See [gate](process-profile-gate.md).\n')
    expect(checkStepMarkers(entries, root).join('\n')).toContain('declares no')
  })

  it('fails when the declared id disagrees with the catalogue', () => {
    writeSkill(
      'process/review',
      '<!-- process-step: id=implement -->\nSee [gate](process-profile-gate.md).\n',
    )
    expect(checkStepMarkers(entries, root).join('\n')).toContain('maps `/review` to step `review`')
  })

  it('fails when neither the skill nor a disclosed sibling points at the gate convention', () => {
    writeSkill('process/review', '<!-- process-step: id=review -->\nNothing else.\n')
    expect(checkStepMarkers(entries, root).join('\n')).toContain('points at skill-conventions/')
  })

  it('accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)', () => {
    // A skill under a byte budget keeps the marker in its entrypoint and discloses
    // its half of the convention to the sibling that already owns that topic.
    writeSkill('process/review', '<!-- process-step: id=review -->\nSee [more](more.md).\n')
    writeFileSync(join(root, 'process/review', 'more.md'), 'See [gate](process-profile-gate.md).\n')
    expect(checkStepMarkers(entries, root)).toEqual([])
  })

  it('fails when an UNCATALOGUED skill carries a marker', () => {
    writeSkill(
      'process/review',
      '<!-- process-step: id=review -->\nSee [gate](process-profile-gate.md).\n',
    )
    writeSkill('capability/estimate', '<!-- process-step: id=estimate -->\n')
    expect(checkStepMarkers(entries, root).join('\n')).toContain('is not a catalogued step')
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
  const resolve = (wow: string) =>
    resolveProcessProfile(parseWowProfileSection(wow), entries, builtIns)

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
    // Fail-safe: the run reports rather than silently disabling the whole process.
    expect(r.enabled).toEqual(entries.map(e => e.id))
  })

  it('an unknown step id HALTs listing the valid ids (AC5)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `plan-tsaks`\n')
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('unknown step id')
    expect(r.halts[0]).toContain('`plan-stories`')
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
})
