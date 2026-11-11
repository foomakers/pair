import { describe, it, expect, afterAll } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  chmodSync,
} from 'node:fs'
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
  checkSkillLocalScripts,
  ENTRY_DEPTH,
  runChecks,
  APPROVAL_SIGNAL_FAMILIES,
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

  it('requires name and description', () => {
    const errors = checkFrontmatterFields(['version'])
    expect(errors.some(e => e.includes('"name"'))).toBe(true)
    expect(errors.some(e => e.includes('"description"'))).toBe(true)
  })
})

describe('checkSizeLimits', () => {

  it('fails name over 64 chars', () => {
    expect(checkSizeLimits('x'.repeat(65), 'ok')).toHaveLength(1)
  })

  it('fails description over 1024 chars and the combined bound', () => {
    const errors = checkSizeLimits('foo', 'x'.repeat(1025))
    expect(errors.some(e => e.includes('description is 1025'))).toBe(true)
    expect(errors.some(e => e.includes('combined'))).toBe(true)
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
})

describe('extractLinkTargets', () => {

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

  it('flags a stale breakdown even when an earlier breakdown in the same file is correct', () => {
    const content =
      '37 skills (9 process + 27 capability + 1 navigator).\nrecap: (9 process + 26 capability + 1 navigator)'
    const errors = checkProseCounts('gs.md', content, counts)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not match corpus')
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

  it('ignores a fenced Output Format sample — a printed line is not a step that asks', () => {
    const doc = ['```text', 'Status: Developer approves', '```'].join('\n')
    expect(findApprovalRounds(doc)).toEqual([])
  })
})

describe('checkApprovalSignal — the two obligations, injected one at a time', () => {
  const REL = 'capability/assess-example/SKILL.md'
  const ROW = '| `$approval` | No | Mode. See [approval rounds](approval-rounds.md). |'
  const ROUND =
    '4. **Verify**: Developer approves the choice. <!-- approval-round: kind=confirm; auto=accept -->'

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

  it('flags a skill that qualifies its rounds but never points at the convention', () => {
    const errors = checkApprovalSignal(REL, `| \`$approval\` | No | Mode. |\n\n${ROUND}\n`)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('never points at')
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

describe('parseStepCatalogue', () => {

  it('returns nothing when the section is absent', () => {
    expect(parseStepCatalogue('# Empty\n')).toEqual([])
  })
})

describe('checkStepCatalogue — bidirectional corpus binding', () => {
  const corpus = {
    howToGuides: ['01-how-to-create-PRD.md'],
    skillDirs: ['process/specify-prd', 'capability/map-subdomains', 'process/brainstorm', 'next'],
  }
  const entries = parseStepCatalogue(CATALOGUE)

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

  it('fails when the declared id disagrees with the catalogue', () => {
    writeSkill('process/review', delta('implement'))
    expect(checkStepMarkers(entries, root).join('\n')).toContain('maps `/review` to step `review`')
  })

  // QUARANTINE U6 (#613): fixture `root` is shared and mutated across tests; result depends on order. Tracking: docs/testing/test-policy.config.json `quarantine`.
  it.skip('fails when neither the skill nor a disclosed sibling points at the gate convention', () => {
    writeSkill('process/review', delta('review', 'Nothing else.'))
    expect(checkStepMarkers(entries, root).join('\n')).toContain('points at skill-conventions/')
  })

  // QUARANTINE U6 (#613): fixture `root` is shared and mutated across tests; result depends on order. Tracking: docs/testing/test-policy.config.json `quarantine`.
  it.skip('accepts the convention pointer in a DISCLOSED SIBLING (progressive disclosure)', () => {
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
})

// Round 1 Major: the profile was reachable from `/next` and from the 12 step skills,
// but nothing a human with NO skills installed reads mentioned it — so a `poc` team
// following AGENTS.md step 3 picked `03-how-to-create-and-prioritize-initiatives.md`
// and ran by hand a step the project declared it does not run, with no warning.
describe('checkManualPathEntrypoint', () => {
  const flow = (extra: string): string =>
    `# AGENTS.md\n\n## 🎯 Quick Start Process\n\n**Without skills** (manual flow):\n\n1. Understand the project\n${extra}2. Identify your task using \`.pair/knowledge/how-to/\`\n\n## Available Tasks\n\nsomething\n`

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

  // Round 6 Minor: a closing fence must be at least as long as the one that opened
  // it (CommonMark). The recognizer's backreference already enforces that; pinned
  // here so it stays mirrored with `scanFences`, which did NOT.
  it('takes a ````-fenced block containing a ``` example as ONE example', () => {
    const doc = '## Process Profile\n\n````text\n```\n- `profile`: `poc`\n```\n````\n'
    const examples = extractProfileExamples(doc)
    expect(examples).toHaveLength(1)
    expect(examples[0]).toContain('```')
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

  it('`poc` ⇒ the built-in set, DDD/strategic steps excluded (AC3)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.enabled).toEqual(['brainstorm', 'plan-stories', 'implement'])
    expect(r.enabled).not.toContain('plan-epics')
    expect(r.halts).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('a disabled prerequisite is FLAGGED with the minimal fix, not repaired (AC9)', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`\n')
    expect(r.halts).toEqual([])
    expect(r.enabled).toEqual(['implement'])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('minimal fix')
    expect(r.warnings[0]).toContain('`plan-stories`')
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

  // Round 14 Minor: every rule above is per-HEADING-SHAPE, so each round closed the
  // spellings that round thought of, while a key line was only ever READ inside a
  // matched section and never REPORTED when it sat outside one. `## Process
  // Profiles` is not an invented typo — it is the KB schema page's own H1
  // (`# Process Profiles`), the page the adoption template links to as the place to
  // look the section up. Each of these resolved a perfectly valid
  // `- `profile`: `poc`` to `default`, 12 steps, zero halts, zero warnings.
  it.each([
    ['the plural of the schema page’s own title', '## Process Profiles'],
    ['the unspaced spelling', '## ProcessProfile'],
    ['an unrelated heading', '## Setup'],
    ['no heading at all', ''],
  ])('HALTs on a key declared under %s', (_, heading) => {
    const r = resolve(`${heading === '' ? 'Some prose.' : heading}\n\n- \`profile\`: \`poc\`\n`)
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('OUTSIDE')
    expect(r.halts[0]).toContain('## Process Profile')
    expectNoStepSet(r)
  })

  it('reports a key that sits outside the section a file DOES have', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`\n\n' +
        '## Notes\n\n- `profile`: `poc`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('OUTSIDE')
  })

  it('counts a DECORATED second heading as the same section, not a different one', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n## **Process profile** (optional)\n\n- `profile`: `custom`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('more than once')
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

  it('HALTs when `whitelist` is declared on two lines of the same section', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `custom`\n- `whitelist`: `implement`, `brainstorm`\n- `whitelist`: `brainstorm`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('`whitelist`')
    expect(r.halts[0]).toContain('more than once')
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

  // The other arm of the same rule: a blockquote OPENS a block, so blockquoted
  // prose right under a key line is not the second half of a wrapped value. Before
  // the blockquote was modelled at all, `isSpilledValueLine` read it as a lazy
  // continuation and HALTed on a perfectly readable declaration.
  it('does not read blockquoted PROSE under a key line as a spilled value', () => {
    const r = resolve('## Process Profile\n\n- `profile`: `poc`\n> Note: PoC subset.\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
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

  // The third, weaker shape of the same class: the bullet and the backticks are
  // both there, padded inside the ticks. Detected on the accepted pattern (the
  // marker is present and the value is readable), so it RESOLVES rather than
  // HALTs — before, it was neither.
  it('accepts a bulleted key whose backticks are padded', () => {
    const r = resolve('## Process Profile\n\n- ` profile `: `poc`\n')
    expect(r.profile).toBe('poc')
    expect(r.halts).toEqual([])
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
  //
  // Round 14: the key under that `#` is now reported — as what it is, a key sitting
  // outside every section, naming its own line. What round 11 closed is the WRONG
  // message, not the report: it is still not a duplicate inside the section above.
  it('ends the section at a LEVEL-1 heading too, not only at the next level-2 one', () => {
    const r = resolve(
      '## Process Profile\n\n- `profile`: `poc`\n\n# Other\n\n- `profile`: `custom`\n',
    )
    expect(r.halts).toHaveLength(1)
    expect(r.halts[0]).toContain('OUTSIDE')
    expect(r.halts[0]).toContain('line 7')
    expect(r.halts[0]).not.toContain('more than once')
  })

  // The other half of the same predicate, unchanged on purpose (documented at the
  // level-check HALT): an `###` sub-heading is legitimately INSIDE a section.
  it('keeps a `###` sub-heading inside the section', () => {
    const r = resolve('## Process Profile\n\n### The keys\n\n- `profile`: `poc`\n')
    expect(r.halts).toEqual([])
    expect(r.profile).toBe('poc')
  })
})

describe('checkSkillLocalScripts — scripts ship with their skill and mirror byte-identically', () => {
  const root = mkdtempSync(join(tmpdir(), 'skills-local-scripts-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  const write = (base: string, rel: string, content: string) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true })
    writeFileSync(join(base, rel), content)
  }
  const fixture = (name: string, body: string) => {
    const skills = join(root, name, 'skills')
    const installed = join(root, name, 'installed')
    write(skills, 'workflow/demo/SKILL.md', `---\nname: demo\ndescription: "d"\n---\n${body}`)
    return { skills, installed }
  }

  it('AC1: a linked script absent from scripts/ is an error naming skill and script', () => {
    const { skills } = fixture('missing', 'Run [x](./scripts/a.mjs) and [y](scripts/b.mjs).')
    write(skills, 'workflow/demo/scripts/a.mjs', 'a')
    const errors = checkSkillLocalScripts(skills)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('workflow/demo/SKILL.md')
    expect(errors[0]).toContain('scripts/b.mjs')
  })

  it('AC1: a target outside scripts/ is out of scope', () => {
    const { skills } = fixture('outside', 'See [x](../other/x.mjs).')
    expect(checkSkillLocalScripts(skills)).toEqual([])
  })

  it('AC2: missing and drifted installed twins are reported with both paths', () => {
    const { skills, installed } = fixture('twin', 'No links.')
    write(skills, 'workflow/demo/scripts/a.mjs', 'same')
    write(skills, 'workflow/demo/scripts/host/b.mjs', 'dataset')
    write(installed, 'pair-workflow-demo/scripts/a.mjs', 'same')
    expect(checkSkillLocalScripts(skills, installed)).toEqual([
      expect.stringContaining('installed twin missing'),
    ])
    write(installed, 'pair-workflow-demo/scripts/host/b.mjs', 'datasex')
    const errors = checkSkillLocalScripts(skills, installed)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('drifted')
    expect(errors[0]).toContain('workflow/demo/scripts/host/b.mjs')
    expect(errors[0]).toContain('pair-workflow-demo/scripts/host/b.mjs')
  })

  it('AC2: an unreadable dataset script is an error naming both paths, never identical', () => {
    const { skills, installed } = fixture('unreadable', 'No links.')
    write(skills, 'workflow/demo/scripts/a.mjs', 'same')
    write(installed, 'pair-workflow-demo/scripts/a.mjs', 'same')
    const locked = join(skills, 'workflow/demo/scripts/a.mjs')
    chmodSync(locked, 0o000)
    try {
      const errors = checkSkillLocalScripts(skills, installed)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('unreadable')
      expect(errors[0]).toContain('workflow/demo/scripts/a.mjs')
      expect(errors[0]).toContain('pair-workflow-demo/scripts/a.mjs')
    } finally {
      chmodSync(locked, 0o644)
    }
  })

  it('AC3: the real corpus passes and the summary names the check', () => {
    const { errors } = runChecks(join(__dirname, '..', '..', 'dataset', '.skills'))
    expect(errors.filter(e => e.includes('scripts'))).toEqual([])
    expect(readFileSync(join(__dirname, 'skills-conformance-check.ts'), 'utf-8')).toContain(
      'skill-local scripts shipped and mirrored',
    )
  })
})
