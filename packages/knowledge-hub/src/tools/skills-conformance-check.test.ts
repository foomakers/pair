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
  checkApprovalSignal,
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
    it(`detects "${round}" and reads its step's qualification`, () => {
      expect(findApprovalRounds(`1. **Verify**: ${round}`)).toEqual([
        { line: 1, text: `1. **Verify**: ${round}`, qualified: false },
      ])
      const qualified = `1. **Verify** (\`$approval: interactive\`): ${round}`
      expect(findApprovalRounds(qualified)[0]?.qualified).toBe(true)
    })
  }

  it('detects a prompt line inside a step, qualified by that step (not by the prompt)', () => {
    const step = [
      '3. **Act**: Present the delta (`$approval: interactive`):',
      '',
      '   > Proposed placement: X',
      '   > Approve or adjust?',
      '',
    ].join('\n')
    const rounds = findApprovalRounds(step)
    expect(rounds).toHaveLength(1)
    expect(rounds[0]).toMatchObject({ line: 4, qualified: true })
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
  const ROUND = '4. **Verify** (`$approval: interactive`): Developer approves the choice.'

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
