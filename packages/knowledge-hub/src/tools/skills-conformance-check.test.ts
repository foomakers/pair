import { describe, it, expect, afterAll } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  existsSync,
  copyFileSync,
  symlinkSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, basename, dirname } from 'node:path'
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
} from './skills-conformance-check'
import * as conformanceModule from './skills-conformance-check'
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
  it('buckets by top-level dir (process/capability/workflow/navigator)', () => {
    const skillsDir = pathJoin('/corpus', '.skills')
    const files = [
      pathJoin(skillsDir, 'process', 'review', 'SKILL.md'),
      pathJoin(skillsDir, 'process', 'implement', 'SKILL.md'),
      pathJoin(skillsDir, 'capability', 'classify', 'SKILL.md'),
      pathJoin(skillsDir, 'workflow', 'red-spec', 'SKILL.md'),
      pathJoin(skillsDir, 'next', 'SKILL.md'),
    ]
    expect(countByCategory(files, skillsDir)).toEqual({
      total: 5,
      process: 2,
      capability: 1,
      workflow: 1,
      navigator: 1,
    })
  })
})

describe('checkProseCounts', () => {
  const counts = { total: 37, process: 9, capability: 27, workflow: 0, navigator: 1 }

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

  // US-479 c2: the `workflow/` category (delivery-phase skills the batch engine dispatches to).
  it('accepts a four-part breakdown and requires the workflow term once the corpus has workflow skills', () => {
    const withWorkflow = { total: 43, process: 9, capability: 27, workflow: 6, navigator: 1 }
    expect(
      checkProseCounts(
        'sg.md',
        '43 skills (9 process + 27 capability + 6 workflow + 1 navigator)',
        withWorkflow,
      ),
    ).toEqual([])
    const omitted = checkProseCounts(
      'sg.md',
      '43 skills (9 process + 27 capability + 1 navigator)',
      withWorkflow,
    )
    expect(omitted).toHaveLength(1)
    expect(omitted[0]).toContain('does not match corpus')
    // and a corpus WITHOUT workflow skills still reads the three-part form as complete
    expect(checkProseCounts('sg.md', '(9 process + 27 capability + 1 navigator)', counts)).toEqual(
      [],
    )
    expect(
      checkProseCounts('sg.md', '(9 process + 27 capability + 0 workflow + 1 navigator)', counts),
    ).toEqual([])
  })
})

describe('checkCategoryLabelCounts', () => {
  const counts = { total: 37, process: 9, capability: 27, workflow: 0, navigator: 1 }

  it('checks a "### Workflow Skills (N)" heading against the workflow count', () => {
    const c = { ...counts, total: 43, workflow: 6 }
    expect(
      checkCategoryLabelCounts('sg.md', '### Workflow Skills (6)\n| **Workflow** | 6 |', c),
    ).toEqual([])
    const errors = checkCategoryLabelCounts('sg.md', '### Workflow Skills (5)', c)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('6 workflow skills')
  })

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

/**
 * The #482 producer, resolved through the module NAMESPACE rather than as a named
 * import on purpose: until it exists, a named import is a link-time error that
 * fails every test in this file — including the controls that must stay green and
 * the per-row failures the contract records. Through the namespace each row fails
 * on its own assertion, for its own reason.
 */
type CheckSkillLocalScripts = (skillsDir: string, installedSkillsDir: string) => string[]
const checkSkillLocalScripts: CheckSkillLocalScripts = (skillsDir, installedSkillsDir) =>
  (
    conformanceModule as unknown as { checkSkillLocalScripts: CheckSkillLocalScripts }
  ).checkSkillLocalScripts(skillsDir, installedSkillsDir)

// --- #482 fixtures: the real corpus anchors for the wiring and CLI rows -------

const KNOWLEDGE_HUB_ROOT = join(__dirname, '..', '..')
const REPO_ROOT = join(KNOWLEDGE_HUB_ROOT, '..', '..')
const REAL_SKILLS_DIR = join(KNOWLEDGE_HUB_ROOT, 'dataset', '.skills')
const INSTALLED_SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills')

/**
 * The first dataset skill-local script that already has an installed twin,
 * derived from the corpus rather than hard-coded: the wiring row needs a
 * `<category>/<name>/scripts/<file>` whose twin really exists under
 * `.claude/skills/`, and which skills own scripts is not this test's subject.
 */
const firstMirroredScript = (): { category: string; name: string; file: string } => {
  for (const category of readdirSync(REAL_SKILLS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()) {
    for (const name of readdirSync(join(REAL_SKILLS_DIR, category), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()) {
      const scriptsDir = join(REAL_SKILLS_DIR, category, name, 'scripts')
      if (!existsSync(scriptsDir)) continue
      for (const file of readdirSync(scriptsDir).sort()) {
        if (existsSync(join(INSTALLED_SKILLS_DIR, `pair-${category}-${name}`, 'scripts', file))) {
          return { category, name, file }
        }
      }
    }
  }
  throw new Error(
    'no dataset skill-local script has an installed twin — the corpus this check exists for is gone',
  )
}
// ---------------------------------------------------------------------------
// Skill-local scripts (#482) — a skill is portable as ONE folder.
//
// Two obligations, one producer (`checkSkillLocalScripts(skillsDir, installedSkillsDir)`,
// wired into `runChecks` and named in the CLI summary):
//
//   1. every script a dataset SKILL.md links as `[…](./scripts/x)` / `[…](scripts/x)`
//      exists beside it in that skill's own `scripts/` directory;
//   2. every dataset skill-local script has a byte-identical installed twin under
//      `.claude/skills/pair-<category>-<name>/scripts/`.
//
// The dataset copy is canonical, the installed copy derived: the check REPORTS
// drift, it never repairs it. Every fixture below is hermetic (two temp trees,
// dataset + installed) except the three rows that are deliberately about the real
// corpus — the wiring row, the corpus-clean control and the CLI summary row.
// ---------------------------------------------------------------------------
describe('checkSkillLocalScripts — linked scripts exist, installed twins are byte-identical (#482)', () => {
  const roots: string[] = []
  afterAll(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true })
  })

  const tree = () => {
    const dataset = mkdtempSync(join(tmpdir(), 'skills-local-dataset-'))
    const installed = mkdtempSync(join(tmpdir(), 'skills-local-installed-'))
    roots.push(dataset, installed)
    const api = {
      dataset,
      installed,
      /** A dataset skill entrypoint at `<rel>/SKILL.md`. */
      skill(rel: string, body = 'body\n') {
        mkdirSync(join(dataset, rel), { recursive: true })
        writeFileSync(
          join(dataset, rel, 'SKILL.md'),
          `---\nname: ${basename(rel)}\ndescription: "Fixture."\n---\n${body}`,
        )
        return api
      },
      /** A dataset skill-local script at `<rel>/scripts/<file>`. */
      script(rel: string, file: string, content: string) {
        mkdirSync(join(dataset, rel, 'scripts'), { recursive: true })
        writeFileSync(join(dataset, rel, 'scripts', file), content)
        return api
      },
      /**
       * A dataset skill-local script NESTED in a sub-directory of `scripts/`
       * (`<rel>/scripts/<sub>/<file>`). The `pair update` transform installs it
       * inside the skill — `installedArtifactPath` over the registry's bounded
       * flatten maps `workflow/alpha/scripts/lib/util.mjs` to
       * `pair-workflow-alpha/scripts/lib/util.mjs` (verified against the real
       * derivation, `skill-md-mirror.ts`) — so it ships and must be guarded.
       */
      nestedScript(rel: string, sub: string, file: string, content: string) {
        mkdirSync(join(dataset, rel, 'scripts', sub), { recursive: true })
        writeFileSync(join(dataset, rel, 'scripts', sub, file), content)
        return api
      },
      /** The installed twin of a nested script, at `<installedDir>/scripts/<sub>/<file>`. */
      nestedTwin(installedDir: string, sub: string, file: string, content: string) {
        mkdirSync(join(installed, installedDir, 'scripts', sub), { recursive: true })
        writeFileSync(join(installed, installedDir, 'scripts', sub, file), content)
        return api
      },
      /** An empty `<rel>/scripts/` directory. */
      emptyScripts(rel: string) {
        mkdirSync(join(dataset, rel, 'scripts'), { recursive: true })
        return api
      },
      /** The installed twin at `.claude/skills/<installedDir>/scripts/<file>`. */
      twin(installedDir: string, file: string, content: string) {
        mkdirSync(join(installed, installedDir, 'scripts'), { recursive: true })
        writeFileSync(join(installed, installedDir, 'scripts', file), content)
        return api
      },
      /** An installed path occupied by a DIRECTORY where a script file is expected. */
      twinAsDirectory(installedDir: string, file: string) {
        mkdirSync(join(installed, installedDir, 'scripts', file), { recursive: true })
        return api
      },
      /**
       * A skill-local script that is a SYMLINK to a file living outside the skill —
       * the layout a maintainer reaches for when the same helper is copied into
       * several skills. `readdirSync(…, { withFileTypes: true })` reports lstat
       * semantics, so the entry is neither a file nor a directory to the walk.
       */
      scriptSymlink(rel: string, file: string, target: string) {
        mkdirSync(join(dataset, rel, 'scripts'), { recursive: true })
        symlinkSync(target, join(dataset, rel, 'scripts', file))
        return api
      },
      /** A SYMLINKED sub-directory under a skill's `scripts/` (`scripts/<name>` → an outside dir). */
      scriptDirSymlink(rel: string, name: string, target: string) {
        mkdirSync(join(dataset, rel, 'scripts'), { recursive: true })
        symlinkSync(target, join(dataset, rel, 'scripts', name), 'dir')
        return api
      },
      /** The skill's `scripts` entry itself, as a symlink that points at nothing. */
      scriptsAsBrokenSymlink(rel: string) {
        mkdirSync(join(dataset, rel), { recursive: true })
        symlinkSync(join(dataset, rel, 'no-such-target'), join(dataset, rel, 'scripts'), 'dir')
        return api
      },
      /** A plain file anywhere in the dataset tree — a link target that is not a script. */
      datasetFile(relPath: string, content: string) {
        mkdirSync(dirname(join(dataset, relPath)), { recursive: true })
        writeFileSync(join(dataset, relPath), content)
        return api
      },
    }
    return api
  }

  /** A tree OUTSIDE any skill: the symlink is the subject of the row, its target is not. */
  const outsideTree = () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-local-outside-'))
    roots.push(dir)
    return dir
  }

  it('R1 — a linked ./scripts/ file that does not exist beside the SKILL.md is an error naming the skill and the script', () => {
    const t = tree()
    t.skill('workflow/alpha', 'Run [the helper](./scripts/absent.mjs) first.\n')
    t.twin('pair-workflow-alpha', 'keep.mjs', 'x\n')
    t.script('workflow/alpha', 'keep.mjs', 'x\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes('scripts/absent.mjs'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('workflow/alpha')
  })

  it('R2 — the bare `scripts/<file>` link form is the same obligation as `./scripts/<file>`', () => {
    const t = tree()
    t.skill('workflow/alpha', 'See [helper](scripts/absent.mjs).\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    expect(errors.some(e => e.includes('workflow/alpha') && e.includes('scripts/absent.mjs'))).toBe(
      true,
    )
  })

  it('R3 — a linked script that DOES exist beside the SKILL.md raises nothing', () => {
    const t = tree()
    t.skill('workflow/alpha', 'Run [the helper](./scripts/present.mjs).\n')
    t.script('workflow/alpha', 'present.mjs', 'console.log(1)\n')
    t.twin('pair-workflow-alpha', 'present.mjs', 'console.log(1)\n')

    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R4 — a link OUTSIDE scripts/ is out of scope here (checkLinks owns it)', () => {
    const t = tree()
    t.skill('workflow/alpha', 'See [elsewhere](../other/x.mjs) and [up](../../root.md).\n')

    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R5 — a missing installed twin is an error naming BOTH paths as missing', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'ghost.mjs', 'canonical\n')
    t.twin('pair-workflow-alpha', 'other.mjs', 'unrelated\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes('ghost.mjs'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain(join('workflow', 'alpha', 'scripts', 'ghost.mjs'))
    expect(hit[0]).toContain(join('pair-workflow-alpha', 'scripts', 'ghost.mjs'))
    expect(hit[0]).toMatch(/missing/i)
  })

  it('R6 — an installed twin differing by ONE byte is an error naming BOTH paths as drifted', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'edited.mjs', 'export const n = 1\n')
    t.twin('pair-workflow-alpha', 'edited.mjs', 'export const n = 2\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes('edited.mjs'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain(join('workflow', 'alpha', 'scripts', 'edited.mjs'))
    expect(hit[0]).toContain(join('pair-workflow-alpha', 'scripts', 'edited.mjs'))
    expect(hit[0]).toMatch(/drift/i)
  })

  it('R7 — a byte-identical twin raises nothing, and equality is by BYTES, not by size', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'same.mjs', 'const a = 1\n')
    t.twin('pair-workflow-alpha', 'same.mjs', 'const a = 1\n')
    t.skill('workflow/beta')
    t.script('workflow/beta', 'swap.mjs', 'ab\n')
    t.twin('pair-workflow-beta', 'swap.mjs', 'ba\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    expect(errors.some(e => e.includes('same.mjs'))).toBe(false)
    expect(errors.some(e => e.includes('swap.mjs'))).toBe(true)
  })

  it('R8 — an installed twin with no dataset source is ignored (directional, like the SKILL.md mirror guard)', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'kept.mjs', 'k\n')
    t.twin('pair-workflow-alpha', 'kept.mjs', 'k\n')
    t.twin('pair-workflow-alpha', 'orphan.mjs', 'left behind\n')
    t.twin('pair-workflow-nobody', 'stranger.mjs', 'no dataset source\n')

    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R9 — an empty scripts/ directory is not an error', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.emptyScripts('workflow/alpha')

    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R10 — an absent installed skills root skips the twin check instead of reporting every script missing (dataset-only checkout)', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'a.mjs', 'a\n')
    t.script('workflow/alpha', 'b.mjs', 'b\n')

    expect(checkSkillLocalScripts(t.dataset, join(t.installed, 'does-not-exist'))).toEqual([])
  })

  it('R11 — an unreadable installed twin is an error naming the path, never a silent "identical"', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.script('workflow/alpha', 'blocked.mjs', 'canonical\n')
    t.twinAsDirectory('pair-workflow-alpha', 'blocked.mjs')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    expect(errors.some(e => e.includes('blocked.mjs'))).toBe(true)
  })

  it('R12 — a bare/meta skill owning a scripts/ sub-directory is refused: the bounded flatten cannot install it', () => {
    const t = tree()
    t.skill('next')
    t.script('next', 'router.mjs', 'r\n')
    t.twin('pair-next', 'router.mjs', 'r\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    expect(errors.some(e => e.includes('next') && e.includes('scripts'))).toBe(true)
  })

  it('R13 — runChecks wires the check to the REAL installed tree: a drifted dataset script fails the gate', () => {
    const real = firstMirroredScript()
    const t = tree()
    t.skill(`${real.category}/${real.name}`)
    t.script(`${real.category}/${real.name}`, real.file, '// drifted by the #482 fixture\n')

    const { errors } = runChecks(t.dataset)
    expect(errors.some(e => e.includes(real.file) && /drift/i.test(e))).toBe(true)
  })

  it('R14 — the real corpus is clean under the check (control: it passes today and must keep passing)', () => {
    const { errors } = runChecks(REAL_SKILLS_DIR)
    expect(errors).toEqual([])
  })

  it('R16 — control: pointer resolution keeps owning both link forms, in and out of scripts/ (must not regress)', () => {
    const t = tree()
    t.skill(
      'workflow/alpha',
      'See [a](./scripts/absent.mjs), [b](scripts/gone.mjs), [c](../other/x.mjs).\n',
    )

    const { errors } = runChecks(t.dataset)
    for (const target of ['./scripts/absent.mjs', 'scripts/gone.mjs', '../other/x.mjs']) {
      expect(
        errors.some(
          e => e.includes('workflow/alpha') && e.includes(`broken relative reference "${target}"`),
        ),
      ).toBe(true)
    }
  })

  it('R15 — `pnpm skills:conformance` PASSes on the real corpus and its summary names the new check', () => {
    const out = execFileSync('pnpm', ['skills:conformance'], {
      cwd: KNOWLEDGE_HUB_ROOT,
      encoding: 'utf-8',
    })
    expect(out).toMatch(/^PASS —/m)
    expect(out).toMatch(/skill-local scripts/i)
  }, 180_000)

  it('R18 — control: a corpus WITH violations exits non-zero and prints FAIL (the exit branch the summary edit sits next to)', () => {
    // `SKILLS_DIR` is frozen at module load (`join(__dirname,'..','..','dataset','.skills')`),
    // so the only way to spawn the REAL CLI over a fixture corpus is to run a copy of
    // the module from a temp ROOT — the module imports nothing but `fs`/`path`, so the
    // copy is the production file itself, not a re-implementation. Whatever the fixer
    // writes into `require.main` is what this row executes.
    const cliRoot = mkdtempSync(join(tmpdir(), 'skills-local-cli-'))
    roots.push(cliRoot)
    mkdirSync(join(cliRoot, 'src', 'tools'), { recursive: true })
    copyFileSync(
      join(__dirname, 'skills-conformance-check.ts'),
      join(cliRoot, 'src', 'tools', 'skills-conformance-check.ts'),
    )
    mkdirSync(join(cliRoot, 'dataset', '.skills', 'workflow', 'alpha'), { recursive: true })
    writeFileSync(
      join(cliRoot, 'dataset', '.skills', 'workflow', 'alpha', 'SKILL.md'),
      '---\nname: alpha\ndescription: "Fixture."\n---\nRun [the helper](./scripts/absent.mjs) first.\n',
    )

    let status = 0
    let stdout = ''
    try {
      stdout = execFileSync(
        'pnpm',
        ['exec', 'ts-node', join(cliRoot, 'src', 'tools', 'skills-conformance-check.ts')],
        { cwd: KNOWLEDGE_HUB_ROOT, encoding: 'utf-8' },
      )
    } catch (err) {
      const e = err as { status?: number; stdout?: string }
      status = e.status ?? -1
      stdout = e.stdout ?? ''
    }

    expect(status).not.toBe(0)
    // Distinguishes a reported FAIL from a crash: a throw inside runChecks exits
    // non-zero too, but prints no summary at all.
    expect(stdout).toMatch(/^FAIL — \d+ violation/m)
    expect(stdout).toContain('scripts/absent.mjs')
  }, 180_000)

  it('R19 — a non-checkable target under scripts/ (placeholder, fragment, pattern) is not a missing script', () => {
    const t = tree()
    t.skill(
      'workflow/alpha',
      [
        'Placeholder: [helper](./scripts/<file>.mjs).',
        'Fragment: [usage](./scripts/tool.mjs#usage).',
        'Pattern: [adr](./scripts/adr-NNN-note.mjs).',
        '',
      ].join('\n'),
    )
    t.script('workflow/alpha', 'tool.mjs', 'export const t = 1\n')
    t.twin('pair-workflow-alpha', 'tool.mjs', 'export const t = 1\n')

    // `<file>.mjs` and `adr-NNN-…` are filtered by isCheckableTarget; `tool.mjs#usage`
    // resolves to the real `tool.mjs` once the fragment is stripped. A producer that
    // pattern-matches the raw target reports up to three phantom missing scripts.
    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R20 — a scripts/ link that exists ONLY inside a fenced code block is an example, not a reference', () => {
    const t = tree()
    t.skill(
      'workflow/alpha',
      ['Authoring example:', '', '```markdown', 'See [x](./scripts/absent.mjs).', '```', ''].join(
        '\n',
      ),
    )

    // extractLinkTargets strips fenced blocks precisely so a documented template
    // path is not a broken pointer; a raw-body scan turns every such SKILL.md red.
    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R21 — a script nested in a scripts/ sub-directory is guarded too: its twin is the mirrored nested path', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.nestedScript('workflow/alpha', 'lib', 'util.mjs', 'export const u = 1\n')

    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes('util.mjs'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain(join('workflow', 'alpha', 'scripts', 'lib', 'util.mjs'))
    expect(hit[0]).toContain(join('pair-workflow-alpha', 'scripts', 'lib', 'util.mjs'))
    expect(hit[0]).toMatch(/missing/i)
  })

  it('R22 — a nested script whose mirrored twin is identical raises nothing (and the sub-directory entry is never read as a file)', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.nestedScript('workflow/alpha', 'lib', 'util.mjs', 'export const u = 1\n')
    t.nestedTwin('pair-workflow-alpha', 'lib', 'util.mjs', 'export const u = 1\n')
    t.script('workflow/alpha', 'flat.mjs', 'export const f = 1\n')
    t.twin('pair-workflow-alpha', 'flat.mjs', 'export const f = 1\n')

    // A flat `readdirSync` + `readFileSync(join(scriptsDir, name))` throws EISDIR on
    // the `lib` entry and takes the whole gate down; this row is the no-throw guard.
    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R23 — a SYMLINKED skill-local script is compared or refused, never silently dropped (r0-1)', () => {
    const outside = outsideTree()
    writeFileSync(join(outside, 'real-helper.mjs'), 'export const h = 1\n')
    const t = tree()
    t.skill('workflow/alpha')
    t.scriptSymlink('workflow/alpha', 'helper.mjs', join(outside, 'real-helper.mjs'))
    t.twin('pair-workflow-alpha', 'other.mjs', 'unrelated\n')

    // The walk reports lstat semantics: a symlink is neither `isFile()` nor
    // `isDirectory()`, so the entry is dropped and the twin half goes green over a file
    // that really ships. Both resolutions the module may take — follow the link and
    // compare bytes, or refuse the layout — name this path; only silence is inadmissible.
    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes(join('workflow', 'alpha', 'scripts', 'helper.mjs')))
    expect(hit).toHaveLength(1)
  })

  it('R24 — a SYMLINKED sub-directory under scripts/ is walked or refused, never silently dropped (r0-1)', () => {
    const outside = outsideTree()
    mkdirSync(join(outside, 'lib'), { recursive: true })
    writeFileSync(join(outside, 'lib', 'util.mjs'), 'export const u = 1\n')
    const t = tree()
    t.skill('workflow/alpha')
    t.scriptDirSymlink('workflow/alpha', 'lib', join(outside, 'lib'))
    t.twin('pair-workflow-alpha', 'other.mjs', 'unrelated\n')

    // The recursive half is blind in the same way, so `scripts/lib/util.mjs` is never
    // reached. Deliberately tolerant between the two admissible answers — following names
    // `scripts/lib/util.mjs`, refusing names `scripts/lib`, and this assertion holds for
    // either — while forbidding the empty array R21's real sub-directory never returns.
    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes(join('workflow', 'alpha', 'scripts', 'lib')))
    expect(hit).toHaveLength(1)
  })

  it('R25 — a broken symlink named scripts/ is reported by path, not skipped in silence (r0-1)', () => {
    const t = tree()
    t.skill('workflow/alpha')
    t.scriptsAsBrokenSymlink('workflow/alpha')

    // `existsSync` follows the link and answers false, so this skill's twin half is
    // skipped without a word — while a non-directory `scripts` entry is already reported
    // by path two lines below. A dangling link is the same unreadable thing, and the
    // module's own principle is that an unreadable twin is never assumed identical.
    let errors: string[] = []
    expect(() => {
      errors = checkSkillLocalScripts(t.dataset, t.installed)
    }).not.toThrow()
    expect(errors.some(e => e.includes(join('workflow', 'alpha', 'scripts')))).toBe(true)
  })

  it('R26 — a scripts/-prefixed link that ESCAPES the skill folder is refused (r2-6)', () => {
    const t = tree()
    t.skill('workflow/alpha', 'Run [the helper](scripts/../../beta/outside.mjs).\n')
    t.skill('workflow/beta')
    t.datasetFile(join('workflow', 'beta', 'outside.mjs'), 'export const o = 1\n')

    // The prefix test claims the target and the existence test then accepts it, because
    // the resolved path really exists — under a SIBLING skill. `checkLinks` accepts it for
    // the same reason, so neither producer refuses it. Packaging or moving alpha alone
    // breaks the link: precisely the failure the 'portable as ONE folder' rule exists for.
    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes(join('workflow', 'alpha', 'SKILL.md')))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('scripts/../../beta/outside.mjs')
  })

  it('R27 — control: a scripts/ link that normalizes back INSIDE the skill stays legal', () => {
    const t = tree()
    t.skill('workflow/alpha', 'Run [the helper](scripts/lib/../helper.mjs).\n')
    t.script('workflow/alpha', 'helper.mjs', 'export const h = 1\n')
    t.twin('pair-workflow-alpha', 'helper.mjs', 'export const h = 1\n')
    t.nestedScript('workflow/alpha', 'lib', 'util.mjs', 'export const u = 1\n')
    t.nestedTwin('pair-workflow-alpha', 'lib', 'util.mjs', 'export const u = 1\n')

    // Containment is decided on the RESOLVED path, never by banning `..` in the spelling:
    // this target lands on the skill's own scripts/helper.mjs. Passes at this head — it is
    // what stops R26's fix from turning a legal, self-contained link red.
    expect(checkSkillLocalScripts(t.dataset, t.installed)).toEqual([])
  })

  it('R28 — a DANGLING symlink ENTRY inside scripts/ is reported by path, and never throws (RV-5)', () => {
    const outside = outsideTree()
    const t = tree()
    t.skill('workflow/alpha')
    // The target is NEVER created: the entry is a dangling link one level BELOW the
    // `scripts` directory R25 guards. To the walk it is neither `isFile()` nor
    // `isDirectory()` under lstat semantics, so it is dropped in the same silence as
    // R23's and R24's entries — and the obvious fix for those two, resolving a symlinked
    // entry's type with `statSync` inside the walk, throws ENOENT here and takes the whole
    // conformance run down with no report. Both halves are the row: no throw, and the path
    // named. Tolerant between the two admissible answers (follow-and-compare, or refuse
    // the layout as unsupported); only `[]` and an exception are inadmissible.
    t.scriptSymlink('workflow/alpha', 'ghost.mjs', join(outside, 'never-created.mjs'))
    t.twin('pair-workflow-alpha', 'other.mjs', 'unrelated\n')

    let errors: string[] = []
    expect(() => {
      errors = checkSkillLocalScripts(t.dataset, t.installed)
    }).not.toThrow()
    expect(errors.some(e => e.includes(join('workflow', 'alpha', 'scripts', 'ghost.mjs')))).toBe(
      true,
    )
  })

  it('R29 — the containment boundary is the skill’s own scripts/, not the skill folder (RV-6)', () => {
    const t = tree()
    t.skill('workflow/alpha', 'Run [the helper](scripts/../helper.mjs).\n')
    t.datasetFile(join('workflow', 'alpha', 'helper.mjs'), 'export const h = 1\n')
    t.script('workflow/alpha', 'real.mjs', 'export const r = 1\n')
    t.twin('pair-workflow-alpha', 'real.mjs', 'export const r = 1\n')

    // The one input that separates the two containment boundaries a fix could implement:
    // the resolved path `<skill>/helper.mjs` is INSIDE the skill folder but OUTSIDE the
    // skill's own scripts/. R26's fixture escapes both and R27's is inside both, so
    // neither discriminates. The card decides it: AC 1 obliges the linked file to exist
    // "in the skill's `scripts/` directory" and the business rule scopes the check to
    // "files under a skill's own `scripts/` directory". The `scripts/` prefix CLAIMS this
    // target, so this producer owes it an answer, and the answer is a refusal.
    const errors = checkSkillLocalScripts(t.dataset, t.installed)
    const hit = errors.filter(e => e.includes(join('workflow', 'alpha', 'SKILL.md')))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('scripts/../helper.mjs')
  })
})
