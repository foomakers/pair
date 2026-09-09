import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
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
  checkInstallableLayout,
  collectSkillMarkdownFiles,
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
  checkSkillLocalScripts,
  collectSkillFiles,
  installedSkillDirName,
  SKILLS_DIR,
  INSTALLED_SKILLS_DIR,
} from './skills-conformance-check'
import {
  SKILL_COPY_OPTS,
  readSkillsDatasetFromDisk,
  datasetSkillDirs,
  installedSkillDir,
  skillCopySyncOptions,
} from './skill-md-mirror'
import { InMemoryFileSystemService, copyDirectoryWithTransforms } from '@pair/content-ops'
import { join as pathJoin, dirname as pathDirname, relative, sep } from 'node:path'

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

// ---------------------------------------------------------------------------
// Skill-local scripts (#482): a skill is portable as ONE folder — every script
// its SKILL.md links ships beside it, and every shipped script has a
// byte-identical installed twin.
// ---------------------------------------------------------------------------

/**
 * A two-tree fixture: a dataset `.skills` root and an installed `.claude/skills`
 * root, so the twin check is exercised against real files rather than a stub.
 */
const scriptsFixture = (prefix: string): { root: string; dataset: string; installed: string } => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const dataset = join(root, 'dataset')
  const installed = join(root, 'installed')
  mkdirSync(dataset, { recursive: true })
  mkdirSync(installed, { recursive: true })
  return { root, dataset, installed }
}

const put = (base: string, rel: string, content: string): void => {
  mkdirSync(pathDirname(join(base, rel)), { recursive: true })
  writeFileSync(join(base, rel), content)
}

const putSkill = (dataset: string, dir: string, body: string): void => {
  const name = dir.split('/').pop() as string
  put(dataset, `${dir}/SKILL.md`, `---\nname: ${name}\ndescription: "Fixture."\n---\n${body}`)
}

describe('checkSkillLocalScripts — a linked script ships beside its SKILL.md (AC1)', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  const fixture = (prefix: string) => {
    const f = scriptsFixture(prefix)
    roots.push(f.root)
    return f
  }

  it('errors with the skill path AND the missing script path when the target is absent', () => {
    const { dataset, installed } = fixture('skills-scripts-missing-')
    putSkill(dataset, 'workflow/phase', 'Run [scripts/go.mjs](scripts/go.mjs) first.')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('workflow/phase')
    expect(errors[0]).toContain('workflow/phase/scripts/go.mjs')
  })

  it('accepts the `./scripts/` spelling and reports it the same way', () => {
    const { dataset, installed } = fixture('skills-scripts-dotslash-')
    putSkill(dataset, 'workflow/phase', 'Run [go](./scripts/go.mjs).')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('workflow/phase/scripts/go.mjs')
  })

  it('follows a nested target under scripts/', () => {
    const { dataset, installed } = fixture('skills-scripts-nested-link-')
    putSkill(dataset, 'workflow/phase', 'Run [go](scripts/lib/go.mjs).')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('workflow/phase/scripts/lib/go.mjs')
  })

  it('is silent when the linked script exists', () => {
    const { dataset, installed } = fixture('skills-scripts-present-')
    putSkill(dataset, 'workflow/phase', 'Run [go](scripts/go.mjs).')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'export const go = 1\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'export const go = 1\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('strips an anchor before resolving the target', () => {
    const { dataset, installed } = fixture('skills-scripts-anchor-')
    putSkill(dataset, 'workflow/phase', 'Run [go](scripts/go.mjs#usage).')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'x\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('leaves a target OUTSIDE scripts/ to checkLinks (out of scope here)', () => {
    const { dataset, installed } = fixture('skills-scripts-outside-')
    putSkill(dataset, 'workflow/phase', 'See [x](../other/x.mjs) and [y](./notes.md).')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('does not mistake a sibling whose name merely STARTS with "scripts" for a script link', () => {
    const { dataset, installed } = fixture('skills-scripts-prefix-')
    putSkill(dataset, 'workflow/phase', 'See [notes](scripts-of-note.md).')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('ignores non-checkable targets (URL, absolute, placeholder)', () => {
    const { dataset, installed } = fixture('skills-scripts-noncheckable-')
    putSkill(
      dataset,
      'workflow/phase',
      'See [a](https://example.com/scripts/go.mjs), [b](/scripts/go.mjs), [c](scripts/<name>.mjs).',
    )

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('ignores a link inside a fenced code block, like checkLinks does', () => {
    const { dataset, installed } = fixture('skills-scripts-fenced-')
    putSkill(dataset, 'workflow/phase', '```md\n[go](scripts/go.mjs)\n```\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('accepts a link to the scripts/ directory itself when the directory exists', () => {
    const { dataset, installed } = fixture('skills-scripts-dirlink-')
    putSkill(dataset, 'workflow/phase', 'Everything under [scripts/](scripts/).')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'x\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })
})

describe('checkSkillLocalScripts — the installed twin is byte-identical (AC2)', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  const fixture = (prefix: string) => {
    const f = scriptsFixture(prefix)
    roots.push(f.root)
    return f
  }

  it('is silent when the twin exists with identical bytes', () => {
    const { dataset, installed } = fixture('skills-twin-identical-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'console.log(1)\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'console.log(1)\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('reports `missing` naming both paths when the twin is absent', () => {
    const { dataset, installed } = fixture('skills-twin-missing-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'console.log(1)\n')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('missing')
    // Anchored: `pair-workflow-phase/scripts/go.mjs` CONTAINS the dataset path as a
    // substring, so a bare toContain cannot tell the two sides apart. The row is
    // prefixed by the side it is about — here the dataset script whose twin is gone.
    expect(errors[0]).toMatch(/^workflow\/phase\/scripts\/go\.mjs: /)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/go.mjs')
  })

  it('reports `drifted` naming both paths when the twin differs by ONE byte', () => {
    const { dataset, installed } = fixture('skills-twin-drift-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'console.log(1)\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'console.log(2)\n')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('drifted')
    expect(errors[0]).toMatch(/^workflow\/phase\/scripts\/go\.mjs: /)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/go.mjs')
  })

  it('maps a BARE skill to `pair-<name>` (loop, next)', () => {
    const { dataset, installed } = fixture('skills-twin-bare-')
    putSkill(dataset, 'loop', 'body')
    put(dataset, 'loop/scripts/go.mjs', 'x\n')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('pair-loop/scripts/go.mjs')
  })

  it('mirrors a nested script at the same relative path under the skill', () => {
    const { dataset, installed } = fixture('skills-twin-nested-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/lib/go.mjs', 'x\n')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/lib/go.mjs')
  })

  it('ignores an installed script that has no dataset source', () => {
    const { dataset, installed } = fixture('skills-twin-orphan-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(installed, 'pair-workflow-phase/scripts/orphan.mjs', 'x\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('treats an empty scripts/ directory as neither an error nor a pass line', () => {
    const { dataset, installed } = fixture('skills-twin-empty-')
    putSkill(dataset, 'workflow/phase', 'body')
    mkdirSync(join(dataset, 'workflow/phase/scripts'), { recursive: true })

    const result = checkSkillLocalScripts(dataset, installed)

    expect(result.errors).toEqual([])
    expect(result.notes).toEqual([])
  })

  it('ignores a scripts/ directory that is NOT the skill’s own (references/scripts/)', () => {
    const { dataset, installed } = fixture('skills-twin-notown-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/references/scripts/go.mjs', 'x\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })

  it('reports an unreadable script as an error naming the path, never as identical', () => {
    const { dataset, installed } = fixture('skills-twin-unreadable-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    // The twin exists as a DIRECTORY where a file is expected: reading it throws.
    mkdirSync(join(installed, 'pair-workflow-phase/scripts/go.mjs'), { recursive: true })

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/go.mjs')
    expect(errors[0]).not.toContain('identical')
    // The INSTALLED twin is the side that threw and the dataset file is readable:
    // the row is prefixed by the broken side, not by the canonical one.
    expect(errors[0]).toMatch(/^pair-workflow-phase\/scripts\/go\.mjs: unreadable/)
  })

  it('skips the twin check with ONE informational note when the installed root is absent', () => {
    const { root, dataset } = fixture('skills-twin-nodir-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')

    const result = checkSkillLocalScripts(dataset, join(root, 'does-not-exist'))

    expect(result.errors).toEqual([])
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toContain('does-not-exist')
  })
})

// An unreadable pair has TWO sides and the errno does not reliably name either:
// `EISDIR: illegal operation on a directory, read` carries no path at all. The
// message is therefore the only thing that tells a maintainer WHICH copy to go
// and look at — the canonical dataset script, or the derived installed twin.
describe('checkSkillLocalScripts — the unreadable side is the side that is named', () => {
  const roots: string[] = []
  const locked: string[] = []
  afterAll(() => {
    locked.forEach(f => {
      try {
        chmodSync(f, 0o600)
      } catch {
        /* already gone */
      }
    })
    roots.forEach(r => rmSync(r, { recursive: true, force: true }))
  })

  const fixture = (prefix: string) => {
    const f = scriptsFixture(prefix)
    roots.push(f.root)
    return f
  }

  /** Make a dataset script exist but throw on read, for real, without root. */
  const lock = (base: string, rel: string): void => {
    const file = join(base, rel)
    chmodSync(file, 0o000)
    locked.push(file)
  }

  it('names the DATASET path when the dataset script is the unreadable side', () => {
    const { dataset, installed } = fixture('skills-unreadable-dataset-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'x\n')
    lock(dataset, 'workflow/phase/scripts/go.mjs')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^workflow\/phase\/scripts\/go\.mjs: unreadable/)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/go.mjs')
  })

  it('names the INSTALLED path when the installed twin is the unreadable side', () => {
    const { dataset, installed } = fixture('skills-unreadable-installed-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    mkdirSync(join(installed, 'pair-workflow-phase/scripts/go.mjs'), { recursive: true })

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^pair-workflow-phase\/scripts\/go\.mjs: unreadable/)
    // The other side is still named, so the pair stays legible — but `pair-…`
    // contains the dataset path as a substring, so the token boundary matters.
    expect(errors[0]).toMatch(/(?:^|\s)workflow\/phase\/scripts\/go\.mjs\b/)
  })

  it('emits ONE row naming a side that actually threw when BOTH sides are unreadable', () => {
    const { dataset, installed } = fixture('skills-unreadable-both-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    lock(dataset, 'workflow/phase/scripts/go.mjs')
    mkdirSync(join(installed, 'pair-workflow-phase/scripts/go.mjs'), { recursive: true })

    const { errors } = checkSkillLocalScripts(dataset, installed)

    // Either side is a truthful label here; a THIRD path, or two rows for one
    // pair, is not.
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^(?:pair-)?workflow\/phase\/scripts\/go\.mjs: unreadable/)
    expect(errors[0]).toContain('pair-workflow-phase/scripts/go.mjs')
    expect(errors[0]).toMatch(/(?:^|\s)workflow\/phase\/scripts\/go\.mjs\b/)
  })

  it('keeps a readable, identical pair silent — unreadability is not the default', () => {
    const { dataset, installed } = fixture('skills-unreadable-none-')
    putSkill(dataset, 'workflow/phase', 'body')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')
    put(installed, 'pair-workflow-phase/scripts/go.mjs', 'x\n')

    expect(checkSkillLocalScripts(dataset, installed).errors).toEqual([])
  })
})

describe('checkSkillLocalScripts — the two checks meet (collision rows)', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  const fixture = (prefix: string) => {
    const f = scriptsFixture(prefix)
    roots.push(f.root)
    return f
  }

  it('a linked-but-absent script yields the link error ONLY — never a phantom missing twin', () => {
    const { dataset, installed } = fixture('skills-collide-linkonly-')
    putSkill(dataset, 'workflow/phase', 'Run [go](scripts/go.mjs).')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors.some(e => e.includes('pair-workflow-phase'))).toBe(false)
  })

  it('a shipped-but-unlinked script is still mirror-checked', () => {
    const { dataset, installed } = fixture('skills-collide-unlinked-')
    putSkill(dataset, 'workflow/phase', 'No links here.')
    put(dataset, 'workflow/phase/scripts/go.mjs', 'x\n')

    const { errors } = checkSkillLocalScripts(dataset, installed)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('missing')
  })
})

describe('installedSkillDirName — pinned to the real copy-pipeline transform', () => {
  it("uses the registry's declared prefix, not an independent string", () => {
    expect(installedSkillDirName('workflow/red-seal')).toBe(
      `${SKILL_COPY_OPTS.prefix}-workflow-red-seal`,
    )
  })

  it('agrees with skill-md-mirror’s installedSkillDir for every real dataset skill dir', () => {
    const tree = readSkillsDatasetFromDisk(SKILLS_DIR)
    const dirs = datasetSkillDirs(tree)
    expect(dirs.length).toBeGreaterThan(0)
    for (const dir of dirs) {
      expect(installedSkillDirName(dir)).toBe(installedSkillDir(dir))
    }
  })
})

describe('runChecks — skill-local scripts are part of the gate', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  it('a drifted twin surfaces through runChecks (drives CLI exit 1)', () => {
    const f = scriptsFixture('skills-gate-drift-')
    roots.push(f.root)
    putSkill(f.dataset, 'workflow/phase', 'Run [go](scripts/go.mjs).')
    put(f.dataset, 'workflow/phase/scripts/go.mjs', 'a\n')
    put(f.installed, 'pair-workflow-phase/scripts/go.mjs', 'b\n')

    const { errors } = runChecks(f.dataset, f.installed)

    expect(errors.some(e => e.includes('drifted') && e.includes('scripts/go.mjs'))).toBe(true)
  })

  it('a missing linked script is reported by BOTH this check and checkLinks', () => {
    const f = scriptsFixture('skills-gate-link-')
    roots.push(f.root)
    putSkill(f.dataset, 'workflow/phase', 'Run [go](scripts/go.mjs).')

    const { errors } = runChecks(f.dataset, f.installed)

    expect(errors.some(e => e.includes('broken relative reference'))).toBe(true)
    expect(errors.some(e => e.includes('workflow/phase/scripts/go.mjs'))).toBe(true)
  })
})

describe('the real corpus ships and mirrors every skill-local script (AC3)', () => {
  it('PASSes with no errors and no notes', () => {
    const result = checkSkillLocalScripts(SKILLS_DIR, INSTALLED_SKILLS_DIR)

    expect(result.errors).toEqual([])
    expect(result.notes).toEqual([])
  })
})

describe('collectSkillFiles — a bare skill stays visible once it ships a subdirectory', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  it('finds `<name>/SKILL.md` even when the dir also holds `scripts/`', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-bare-with-subdir-'))
    roots.push(root)
    put(root, 'loop/SKILL.md', '---\nname: loop\ndescription: "Loops."\n---\nbody\n')
    put(root, 'loop/scripts/go.mjs', 'x\n')

    const files = collectSkillFiles(root).map(f => relative(root, f).split(sep).join('/'))

    expect(files).toContain('loop/SKILL.md')
  })
})

// ---------------------------------------------------------------------------
// The gate's layout acceptance vs. the REAL copy pipeline (PR #483, r1-g1).
//
// `collectSkillFiles` decides which SKILL.md every check in this gate ever
// reads, and therefore whether `runChecks` PASSes a corpus. What that corpus
// does in production is decided by `copyDirectoryWithTransforms` under the
// registry's `skillCopySyncOptions()` — the code `pair update` actually runs.
// It VALIDATES the source layout before copying a single file, so a layout it
// cannot represent is not partially installed: it throws and installs NOTHING.
//
// The oracle here is that function, driven over an in-memory clone of the same
// fixture `runChecks` judges — the harness `skill-md-mirror.ts`'s
// `runCopyPipeline` already uses. It is NOT `datasetSkillDirs`: that is a pure
// `*/SKILL.md` key enumeration over an in-memory tree, it never runs the copy
// pipeline or its layout validators, and above all it cannot express REFUSAL —
// so a table built on it can only ever describe corpora as installable and can
// never fail on a corpus the installer rejects.
//
// FROZEN DECISION RULE, one line, asserted per row:
//     runChecks(dataset, installed).errors.length > 0  IFF  the pipeline throws.
// A gate that PASSes a corpus `pair update` refuses is a green light on an
// install that yields nothing for anyone; a gate that fails one the installer
// accepts blocks legal work. Both directions are asserted, so neither an
// under- nor an over-correction can pass.
//
// The domain below is the finite shape domain of the TWO source-layout rules
// this table owns. Both are marker-BLIND by construction (ADR-020: no `SKILL.md`
// knowledge in a transform four non-skill registries share):
//
//   * `validateNoShallowEntryWithSubdir`
//     (content-ops/src/ops/copy/layout-validation.ts:101-129) — for each
//     directory SHALLOWER than `flattenDepth` (= 2), the cross-product of
//       (holds files DIRECTLY: no | a SKILL.md marker | a non-marker file)
//       x (owns a SUB-DIRECTORY: no | one with a SKILL.md | one without)
//     plus the producer's own depth-0 exemption branch (`collectDirShapes`'
//     `if (dir === '.') continue` — "files at the source ROOT are copied
//     straight to the destination root and are never entries"), plus the legal
//     depth-2 entries the repair must NOT start rejecting. Rows D1-D13.
//
//   * `validateNoDeepEntry` (same file, :170-200) — for each directory DEEPER
//     than `flattenDepth`, whether its ancestor at EXACTLY `flattenDepth` also
//     holds files directly: if it does, the directory is CONTENT of that entry
//     and installs fine; if it does not, nothing owns it and it is an entry too
//     deep, so `pair update` refuses the whole corpus. Rows D14-D19: the
//     marker-BEARING offender (D14), the marker-LESS one at depth 3 (D15) and
//     at depth 4 (D16), the marker-less offender beside legal content of a real
//     entry (D19), and the two ordinary complements a naive repair breaks —
//     content whose immediate PARENT holds no files but whose ancestor at the
//     entry depth does (D17), and content whose owning entry holds only a
//     NON-marker file (D18).
//
// Marker-blindness is why the non-marker rows matter: a fix that keys off
// `SKILL.md` disagrees with the producer on D7, D15, D16, D18 and D19, and a
// fix that forgets the root exemption disagrees on D9-D11. `checkEntrypointDepth`
// is a marker-BOUND complement which happens to be the only reason D14 is caught
// today; it is NOT the owner of `validateNoDeepEntry`'s marker-blind rule and is
// not modified here, so the repair must be ADDITIVE — D14 staying green pins it.
//
// Every REFUSE row also asserts ATTRIBUTION: the gate must name the very source
// directory the producer's refusal blames, extracted from the refusal string
// itself so the expectation cannot drift from the oracle. Without it a row is
// satisfied by any unrelated error the gate happens to raise on that fixture.
//
// KNOWN UNCLAIMED PARITY GAP — deliberately outside this group's oracle, named
// so the narrowing is explicit and re-plannable, never silently implied:
//   * `validateNoCollisions`: `a/b-c/SKILL.md` + `a-b/c/SKILL.md` both flatten
//     to `pair-a-b-c`. Measured at this base: the pipeline REFUSES with
//     "Flatten naming collision detected: pair-a-b-c. Different source paths
//     resolve to the same target name.", the gate reports no error. A real
//     parity gap, a DIFFERENT rule, not repaired here.
// ---------------------------------------------------------------------------

// Deep source + repo-root dataset root, exactly as the real `pair update`
// resolves them (same rationale as skill-md-mirror.ts's VIRTUAL_* constants).
const PIPELINE_SRC = '/ds/packages/knowledge-hub/dataset/.skills'
const PIPELINE_DEST = '/ds/.claude/skills'

/**
 * The REAL producer over an in-memory clone of `tree`: the refusal message if
 * `pair update` would refuse this layout, and the destination files it actually
 * wrote. No parallel re-implementation — a change in the installer's layout
 * rules surfaces here rather than being masked. This is the harness
 * `skill-md-mirror.ts`'s `runCopyPipeline` already uses, with the refusal kept
 * instead of thrown so a REJECTED layout is expressible as a result.
 */
const runSkillCopyPipeline = async (
  tree: Record<string, string>,
): Promise<{ refusal: string | null; produced: string[] }> => {
  const initial: Record<string, string> = {}
  for (const [rel, content] of Object.entries(tree)) initial[`${PIPELINE_SRC}/${rel}`] = content
  const fileService = new InMemoryFileSystemService(initial, '/', '/')

  let refusal: string | null = null
  try {
    await copyDirectoryWithTransforms({
      fileService,
      srcPath: PIPELINE_SRC,
      destPath: PIPELINE_DEST,
      source: 'packages/knowledge-hub/dataset/.skills',
      target: '.claude/skills',
      datasetRoot: '/ds',
      options: skillCopySyncOptions(),
    })
  } catch (e) {
    refusal = (e as Error).message
  }

  const produced: string[] = []
  const walk = async (dir: string): Promise<void> => {
    if (!fileService.existsSync(dir)) return
    for (const entry of await fileService.readdir(dir)) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) await walk(full)
      else produced.push(full.slice(PIPELINE_DEST.length + 1))
    }
  }
  await walk(PIPELINE_DEST)
  return { refusal, produced: produced.sort() }
}

describe('runChecks and the copy pipeline accept the same corpora — the bounded-flatten layout rules', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  const fm = (name: string, extra = '', body = 'body\n'): string =>
    `---\nname: ${name}\ndescription: "Fixture."\n${extra}---\n${body}`

  const corpus = (prefix: string, tree: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), prefix))
    roots.push(root)
    for (const [rel, content] of Object.entries(tree)) put(root, rel, content)
    return root
  }

  const walkedDirs = (root: string): string[] =>
    collectSkillFiles(root)
      .map(f => relative(root, pathDirname(f)).split(sep).join('/'))
      .sort()

  const SHALLOW = /Ambiguous layout for a bounded flatten/
  const TOO_DEEP = /is an entry too deep|entry too deep/

  // [label, tree, refusal the pipeline raises (null = installs), files it writes]
  type Row = [string, Record<string, string>, RegExp | null, string[]]

  const rows: Row[] = [
    // --- holds NO file directly ---
    [
      'D1 no direct file + SKILL.md-bearing subdirs (a category)',
      { 'capability/a/SKILL.md': fm('a'), 'capability/b/SKILL.md': fm('b') },
      null,
      ['pair-capability-a/SKILL.md', 'pair-capability-b/SKILL.md'],
    ],
    [
      'D2 no direct file + a subdir holding no SKILL.md',
      { 'capability/a/notes.md': 'x\n' },
      null,
      ['pair-capability-a/notes.md'],
    ],
    // --- holds its own SKILL.md directly (a bare/meta skill) ---
    [
      'D3 marker + no subdir (a bare meta skill)',
      { 'loop/SKILL.md': fm('loop') },
      null,
      ['pair-loop/SKILL.md'],
    ],
    [
      'D4 marker + a subdir holding no SKILL.md (#482 bare-skill scripts/)',
      { 'loop/SKILL.md': fm('loop'), 'loop/scripts/go.mjs': 'x\n' },
      SHALLOW,
      [],
    ],
    [
      'D5 marker + a SKILL.md-bearing subdir (both markers)',
      { 'loop/SKILL.md': fm('loop'), 'loop/nested/SKILL.md': fm('nested') },
      SHALLOW,
      [],
    ],
    // --- holds a NON-marker file directly (the rule is marker-blind) ---
    [
      'D6 non-marker file + no subdir',
      { 'capability/notes.md': 'x\n' },
      null,
      ['pair-capability/notes.md'],
    ],
    [
      'D7 non-marker file + a subdir holding no SKILL.md',
      { 'capability/README.md': '# r\n', 'capability/a/notes.md': 'x\n' },
      SHALLOW,
      [],
    ],
    [
      'D8 non-marker file + a SKILL.md-bearing subdir',
      { 'capability/README.md': '# r\n', 'capability/a/SKILL.md': fm('a') },
      SHALLOW,
      [],
    ],
    // --- the producer's depth-0 exemption: the registry ROOT is never an entry ---
    [
      'D9 ROOT file + a category (root is exempt, depth 0)',
      { 'README.md': '# r\n', 'capability/a/SKILL.md': fm('a') },
      null,
      ['README.md', 'pair-capability-a/SKILL.md'],
    ],
    [
      'D10 ROOT file + a bare skill (root exemption beside a marker)',
      { 'README.md': '# r\n', 'loop/SKILL.md': fm('loop') },
      null,
      ['README.md', 'pair-loop/SKILL.md'],
    ],
    ['D11 ROOT file alone', { 'README.md': '# r\n' }, null, ['README.md']],
    // --- legal depth-2 entries: the repair must not start rejecting these ---
    [
      'D12 depth-2 entry + its own scripts/ (the layout #482 must keep legal)',
      { 'capability/loop/SKILL.md': fm('loop'), 'capability/loop/scripts/go.mjs': 'x\n' },
      null,
      ['pair-capability-loop/SKILL.md', 'pair-capability-loop/scripts/go.mjs'],
    ],
    [
      'D13 depth-2 entry + a sub-document dir',
      { 'capability/loop/SKILL.md': fm('loop'), 'capability/loop/references/r.md': '# r\n' },
      null,
      ['pair-capability-loop/SKILL.md', 'pair-capability-loop/references/r.md'],
    ],
    // --- `validateNoDeepEntry`: an entry DEEPER than the entry depth. The rule
    // is marker-BLIND — it asks only whether the ancestor at EXACTLY the entry
    // depth holds files of its own — so D14 (marker-bearing, caught today only
    // by the marker-BOUND `checkEntrypointDepth`) is the complement, not the
    // rule, and D15/D16/D19 are the rule itself. ---
    [
      'D14 entry deeper than the entry depth, marker-BEARING',
      { 'capability/sub/foo/SKILL.md': fm('foo') },
      TOO_DEEP,
      [],
    ],
    [
      'D15 entry deeper than the entry depth, marker-LESS (ancestor@2 holds no file)',
      { 'capability/a/SKILL.md': fm('a'), 'capability/sub/foo/notes.md': 'x\n' },
      TOO_DEEP,
      [],
    ],
    [
      'D16 the same, one level deeper still (the rule is not pinned to depth 3)',
      { 'capability/a/SKILL.md': fm('a'), 'capability/sub/foo/bar/notes.md': 'x\n' },
      TOO_DEEP,
      [],
    ],
    [
      'D17 depth-4 content whose PARENT holds no file but whose ancestor@2 does',
      {
        'capability/loop/SKILL.md': fm('loop'),
        'capability/loop/references/deep/r.md': '# r\n',
      },
      null,
      ['pair-capability-loop/SKILL.md', 'pair-capability-loop/references/deep/r.md'],
    ],
    [
      'D18 depth-3 content owned by an entry holding only a NON-marker file',
      { 'capability/x/notes.md': 'x\n', 'capability/x/sub/deep.md': 'y\n' },
      null,
      ['pair-capability-x/notes.md', 'pair-capability-x/sub/deep.md'],
    ],
    [
      'D19 a marker-less too-deep entry beside legal content of a real entry',
      {
        'capability/loop/SKILL.md': fm('loop'),
        'capability/loop/references/r.md': '# r\n',
        'capability/sub/foo/notes.md': 'x\n',
      },
      TOO_DEEP,
      [],
    ],
  ]

  /**
   * The source directory the producer's own refusal BLAMES, read out of the
   * refusal string rather than hand-copied: the attribution assertion cannot
   * drift from the oracle, and cannot be satisfied by an unrelated gate error
   * about a different directory of the same fixture. Both layout rules phrase
   * it identically (`flattenDepth=N): '<dir>' is ...`); a refusal that names no
   * directory throws here rather than silently weakening the assertion.
   */
  const blamedDir = (refusal: string): string => {
    const m = /flattenDepth=\d+\): '([^']+)' is /.exec(refusal)
    if (m === null) throw new Error(`refusal names no source directory: ${refusal}`)
    return m[1]
  }

  // Anti-vacuity: pins the ORACLE itself. If this row's outcome ever stops
  // matching what `pair update` does, the parity assertion below is measuring
  // nothing and says so here first, in the producer's own terms.
  it.each(rows)(
    '%s — the pipeline outcome recorded by this table is the one `pair update` produces',
    async (_label, tree, refusal, produced) => {
      const actual = await runSkillCopyPipeline(tree)
      if (refusal === null) expect(actual.refusal).toBeNull()
      else expect(actual.refusal).toMatch(refusal)
      expect(actual.produced).toEqual(produced)
    },
  )

  it.each(rows)(
    '%s — the gate errors IFF the installer refuses the corpus',
    async (label, tree, refusal) => {
      const root = corpus(`skills-parity-${label.slice(0, 3).toLowerCase()}-`, tree)
      const { errors } = runChecks(root, join(root, '__no-installed'))
      const { refusal: actualRefusal } = await runSkillCopyPipeline(tree)

      expect(actualRefusal === null).toBe(refusal === null)
      expect(
        errors.length > 0,
        actualRefusal === null
          ? `installer INSTALLS this corpus, gate reported: ${JSON.stringify(errors)}`
          : `installer REFUSES this corpus (${actualRefusal}), gate reported no error`,
      ).toBe(actualRefusal !== null)
    },
  )

  // Attribution, the refuse side: `errors.length > 0` alone is satisfied by ANY
  // error the gate raises on the fixture — a frontmatter complaint, a size
  // complaint, a marker-bound depth error about a different path. A row only
  // proves parity if the gate blames the same directory the installer blames.
  it.each(rows.filter(([, , refusal]) => refusal !== null))(
    '%s — the gate names the very directory the installer refuses over',
    async (label, tree) => {
      const root = corpus(`skills-blame-${label.slice(0, 3).toLowerCase()}-`, tree)
      const { errors } = runChecks(root, join(root, '__no-installed'))
      const { refusal: actualRefusal } = await runSkillCopyPipeline(tree)
      const dir = blamedDir(actualRefusal as string)

      expect(
        errors.some(e => e.includes(dir)),
        `no gate error names '${dir}' — the source directory the installer's refusal blames; gate reported ${JSON.stringify(errors)}`,
      ).toBe(true)
    },
  )

  // The accept side, at full strength: for a corpus the installer DOES install,
  // every entrypoint it installs must be one the walk sees, and vice versa —
  // an unchecked installed skill and a phantom checked one are both defects.
  it.each(rows.filter(([, , refusal]) => refusal === null))(
    '%s — the walk sees exactly the entrypoints the installer installs',
    async (label, tree) => {
      const root = corpus(`skills-accept-${label.slice(0, 3).toLowerCase()}-`, tree)
      const { produced } = await runSkillCopyPipeline(tree)
      const installedEntries = produced
        .filter(p => p.endsWith('/SKILL.md'))
        .map(p => p.slice(0, -'/SKILL.md'.length))
        .sort()

      expect(walkedDirs(root).map(installedSkillDir).sort()).toEqual(installedEntries)
    },
  )

  // Whole-corpus over-correction anchor: the 55 shipped skills are a layout
  // `pair update` installs today, and every one of the rules above must keep
  // accepting it. A repair that widens the deep rule (joining every segment,
  // testing the immediate parent, demanding a marker on the ancestor) fails
  // here on real data, not only on the synthetic rows.
  it('the real corpus installs, and the gate raises no layout error on it', async () => {
    const { refusal } = await runSkillCopyPipeline(readSkillsDatasetFromDisk(SKILLS_DIR))

    expect(refusal).toBeNull()
    expect(checkInstallableLayout(SKILLS_DIR)).toEqual([])
  })

  it('the two walks agree on the real corpus', () => {
    const walk = collectSkillFiles(SKILLS_DIR)
      .map(f => relative(SKILLS_DIR, pathDirname(f)).split(sep).join('/'))
      .sort()
    const pipeline = datasetSkillDirs(readSkillsDatasetFromDisk(SKILLS_DIR)).sort()

    expect(walk.length).toBeGreaterThan(0)
    expect(walk).toEqual(pipeline)
  })
})

describe('runChecks — a nested skill beside a bare one is checked, not silently dropped', () => {
  const roots: string[] = []
  afterAll(() => roots.forEach(r => rmSync(r, { recursive: true, force: true })))

  const twoMarker = (prefix: string): { root: string; installed: string } => {
    const root = mkdtempSync(join(tmpdir(), prefix))
    roots.push(root)
    put(root, 'loop/SKILL.md', '---\nname: loop\ndescription: "Loops."\n---\nbody\n')
    put(
      root,
      'loop/nested/SKILL.md',
      '---\nname: nested\ndescription: "Nested."\ndisable-model-invocation: true\n---\n' +
        'See [x](./missing.md).\n',
    )
    // Explicit non-existent installed root: the twin check is out of scope here.
    return { root, installed: join(root, '__no-installed') }
  }

  it('counts both skills', () => {
    const { root, installed } = twoMarker('skills-two-marker-count-')
    expect(runChecks(root, installed).skillCount).toBe(2)
  })

  it("surfaces the nested skill's frontmatter portability violation", () => {
    const { root, installed } = twoMarker('skills-two-marker-portability-')
    const { errors } = runChecks(root, installed)
    expect(errors.some(e => e.includes('nested') && e.includes('disable-model-invocation'))).toBe(
      true,
    )
  })

  it("surfaces the nested skill's broken relative reference", () => {
    const { root, installed } = twoMarker('skills-two-marker-link-')
    const { errors } = runChecks(root, installed)
    expect(errors.some(e => e.includes('nested') && e.includes('./missing.md'))).toBe(true)
  })

  it('cannot be caught by the depth check — the nested entrypoint sits at ENTRY_DEPTH', () => {
    // Pinned so the fix is made in the walk and not mistaken for depth work:
    // `loop/nested/SKILL.md` is depth 2 == ENTRY_DEPTH, hence legal by depth.
    const { root } = twoMarker('skills-two-marker-depth-')
    expect(checkEntrypointDepth(root, collectSkillMarkdownFiles(root))).toEqual([])
  })

  // Retired: this slot asserted that the pipeline "installs the nested skill as
  // invocable, prefixed and flattened", measured with `datasetSkillDirs` — a
  // `*/SKILL.md` key enumeration that never runs the pipeline and cannot express
  // refusal. Driven through the real producer the claim is false, so the two
  // rows below replace it with what `pair update` actually does.

  it('the installer REFUSES this corpus and installs nothing', async () => {
    // The premise the whole block rests on, measured at the producer rather than
    // assumed: `loop` is 1 segment deep, holds `SKILL.md` directly AND owns
    // `loop/nested`, so the bounded flatten cannot represent it. The validators
    // run before the first write, so the refusal is total — not a partial
    // install of `pair-loop` with `pair-loop-nested` missing.
    const { refusal, produced } = await runSkillCopyPipeline({
      'loop/SKILL.md': '---\nname: loop\ndescription: "Loops."\n---\nbody\n',
      'loop/nested/SKILL.md': '---\nname: nested\ndescription: "Nested."\n---\nbody\n',
    })

    expect(refusal).toMatch(/Ambiguous layout for a bounded flatten/)
    expect(produced).toEqual([])
  })

  it('so the gate must refuse it too, instead of PASSing a corpus that installs nothing', async () => {
    const { root, installed } = twoMarker('skills-two-marker-refused-')
    const { errors } = runChecks(root, installed)

    expect(
      errors.some(e => /Ambiguous layout for a bounded flatten/.test(e)),
      `gate reported: ${JSON.stringify(errors)}`,
    ).toBe(true)
  })

  it('and refusing it never means silently shrinking the corpus — both markers stay walked', () => {
    // The repair is ADDITIVE: report the unrepresentable layout. Dropping the
    // entrypoints from the walk instead would reinstate, with no error at all,
    // exactly the silent-drop defect this story set out to close.
    const { root, installed } = twoMarker('skills-two-marker-still-walked-')
    const walked = collectSkillFiles(root)
      .map(f => relative(root, f).split(sep).join('/'))
      .sort()

    expect(walked).toEqual(['loop/SKILL.md', 'loop/nested/SKILL.md'].sort())
    expect(runChecks(root, installed).skillCount).toBe(2)
  })
})
