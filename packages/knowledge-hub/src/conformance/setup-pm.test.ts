/**
 * Conformance guard for `/pair-capability-setup-pm` — the PM-tool configuration skill (story #321).
 *
 * TARGET ARTIFACT, NOT STORY (ADL `2026-07-18-conformance-test-per-file-not-per-story.md`):
 * this file is the home of every checkable claim about `setup-pm/SKILL.md`, in both corpora
 * — the dataset (authoring source of truth) and the generated `.claude/skills/**` mirror.
 * A later story adding a setup-pm claim extends a `describe` here rather than adding a file.
 * The last block additionally covers the Azure adapter's `### Adoption Configuration` snippet
 * and its hand-maintained website twin: those two are not a *new* target so much as the
 * other half of ONE contract — the fields setup-pm must write into `way-of-working.md` —
 * and splitting them from the skill that writes them is exactly the fragmentation the ADL
 * rejects. The cross-cutting `pm-tool-adapter-contract.test.ts` stays reserved for the
 * invariant that spans EVERY adapter (visibility); an Azure-only claim does not belong there.
 *
 * WHY IT EXISTS. The skill drifted against itself: #389 added Azure DevOps and Linear to the
 * Step 2 selection table and the Step 3 guide list, but `## Notes` kept asserting
 * "Supported tools with implementation guides: GitHub Projects, Filesystem" — two screens
 * below a table offering four. Nothing on the gate could see it, because the supported-tools
 * claim was prose nobody compared against the adapters actually shipped on disk.
 *
 * DATA-DRIVEN BY CONSTRUCTION, NO ADAPTER COUNT ASSERTED. The adapter set is discovered from
 * disk (`*-implementation.md`) in both corpora and the tool's display name is read from the
 * adapter's own pinned H1 (`# <Name> - Complete Implementation Guide`) — so no name table is
 * maintained here either. THE INTENDED CONTRACT FOR THE NEXT AUTHOR: the day a 5th adapter
 * lands (say `gitlab-implementation.md`), these cases go red until `setup-pm/SKILL.md` lists
 * it in all three places. That is the guard working, not a mystery failure — the remedy is to
 * enroll the tool in the skill (Step 2 table row + Step 3 guide link + the Notes line), never
 * to relax the assertion. An adapter whose H1 does not carry the pinned form fails loudly for
 * the same reason: a silently-unparsed name would make every claim below vacuously true.
 *
 * Every assertion in this file was injection-tested — the claim was deleted from the artifact
 * and the assertion confirmed to redden — per the vacuous-assertion lesson recorded in
 * `pm-tool-adapter-contract.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { sectionBetween } from './test-utils'

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')
const ADAPTER_REL = '.pair/knowledge/guidelines/collaboration/project-management-tool'

const read = (path: string): string => readFileSync(path, 'utf-8')

/**
 * The two corpora, each pairing the adapters on disk with the setup-pm skill that must list
 * them. Pairing them per corpus (rather than checking the dataset adapters against the root
 * skill) is what makes the mirror's own copy of the claim asserted rather than assumed.
 */
const CORPORA = [
  {
    label: 'dataset',
    adapterDir: join(DATASET, ADAPTER_REL),
    skill: join(DATASET, '.skills/capability/setup-pm/SKILL.md'),
  },
  {
    label: 'generated root',
    adapterDir: join(REPO_ROOT, ADAPTER_REL),
    skill: join(REPO_ROOT, '.claude/skills/pair-capability-setup-pm/SKILL.md'),
  },
]

/** Adapter files present on disk — discovered, never enumerated. */
const adapterFiles = (dir: string): string[] =>
  readdirSync(dir)
    .filter(name => name.endsWith('-implementation.md'))
    .sort()

/** The pinned H1 form every adapter carries; group 1 is the tool's display name. */
const ADAPTER_TITLE = /^# (.+?) - Complete Implementation Guide\s*$/m

const displayName = (content: string, file: string): string => {
  const match = ADAPTER_TITLE.exec(content)
  if (!match) {
    throw new Error(
      `${file}: no "# <Name> - Complete Implementation Guide" H1 — the display name this guard ` +
        `matches against setup-pm cannot be derived. Restore the pinned H1 form.`,
    )
  }
  return (match[1] as string).trim()
}

/**
 * Strips markdown emphasis and code spans, then collapses whitespace — without it an assertion
 * requiring two adjacent words goes vacuously green the moment prose puts `**bold**` between
 * them, which is exactly how the Notes line hid its own contradiction.
 */
const normalize = (markdown: string): string =>
  markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The real cells of ONE markdown table row, normalized — or a throw.
 *
 * FAILS CLOSED. A markdown row is written with a leading AND a trailing pipe, so splitting it
 * yields an empty element on each side of the real cells. A line without that shape (prose that
 * happens to carry a pipe, a row truncated before its trailing pipe) is NOT a row: it throws
 * rather than yielding cells, so a row lookup that drifts can never be a way to reach green.
 */
const rowCells = (row: string, label: string): string[] => {
  const parts = row.trim().replace(/^>\s*/, '').split('|')
  const bounded = parts.length >= 3 && parts[0]?.trim() === '' && parts.at(-1)?.trim() === ''
  if (!bounded) {
    throw new Error(
      `${label}: "${row.trim()}" is not a | Tool | Best For | Implementation Guide | table row — ` +
        `the enrolment verdict this guard reads cannot be located.`,
    )
  }
  return parts.slice(1, -1).map(cell => normalize(cell).trim())
}

/**
 * The columns the Step 2 selection table declares, in the order it declares them. Pinned as a
 * constant so the synthetic rows below can be read without a corpus, and asserted against the
 * real header in `the Step 2 table declares the columns this guard reads` — the constant is a
 * restatement of the artifact, never a second source of truth.
 */
const STEP2_COLUMNS = ['tool', 'best for', 'implementation guide']

/** The column whose cell decides whether a tool is selectable at Step 2. */
const VERDICT_COLUMN = 'implementation guide'

/** The one verdict that enrolls a tool as selectable in Step 2. */
const AVAILABLE = 'available'

/**
 * The HALT vocabulary the `Other` row carries. Step 2.4 sends a tool filed under it to a HALT,
 * so it must appear NOWHERE in the row of an adapter that ships — not only in the verdict cell.
 */
const HALT_VERDICT = 'no implementation guide'

/** `rowCells` for the header SEARCH only, where a non-row line is an ordinary miss, not a fault. */
const rowCellsOrNull = (row: string): string[] | null => {
  try {
    return rowCells(row, 'probe')
  } catch {
    return null
  }
}

/**
 * The columns the Step 2 table's own header row declares — read from the corpus, so the verdict
 * below is located by the column the table NAMES rather than by a position counted from the end.
 * Throws when there is no header, or when the header does not declare the verdict column.
 */
const step2Columns = (step2: string, label: string): string[] => {
  const header = step2
    .split('\n')
    .find(line => line.includes('|') && rowCellsOrNull(line)?.[0] === 'tool')
  if (!header) {
    throw new Error(
      `${label}: the Step 2 selection table has no header row starting with a "Tool" column — ` +
        `the enrolment verdict cannot be bound to a declared column.`,
    )
  }
  const columns = rowCells(header, label)
  if (!columns.includes(VERDICT_COLUMN)) {
    throw new Error(
      `${label}: the Step 2 table header declares [${columns.join(' | ')}] — no ` +
        `"${VERDICT_COLUMN}" column, so no cell of a row can be read as the enrolment verdict.`,
    )
  }
  return columns
}

/**
 * The `Implementation Guide` verdict of ONE Step 2 selection-table row — normalized, trimmed,
 * located by the DECLARED column and read EXACTLY, never by substring and never by position.
 *
 * WHY EXACTLY. `toContain('available')` is satisfied by its own negations: `Not Available` and
 * `Unavailable` both contain the token, so a shipped adapter marked unselectable in the very
 * table this guard keeps in sync went 43/43 green. The companion `not.toContain('no
 * implementation guide')` did not catch it either — neither phrasing contains that string.
 * Exact equality against the table's one positive verdict rejects both negations, the HALT
 * vocabulary and any cell outside the vocabulary, through ONE assertion on the verdict cell.
 *
 * WHY BY COLUMN, AND WITH EXACT ARITY. Reading the verdict positionally (the cell before the
 * trailing pipe) is sound only while the table has exactly the columns it has today. Append one
 * column to a row and the read silently SHIFTS onto the new cell: a row rewritten to
 * `| **Azure DevOps** | Microsoft ecosystem | Not Available | Available |` stays bounded, throws
 * nothing, and yields `available` — the very "silently reading a neighbouring column as the
 * verdict" this guard exists to prevent, reached from the right instead of the left. So the cell
 * is located at the index the header declares, and a row whose real-cell count is not the
 * declared column count fails closed and loudly instead of shifting.
 */
const guideVerdict = (row: string, label: string, columns: string[] = STEP2_COLUMNS): string => {
  const cells = rowCells(row, label)
  if (cells.length !== columns.length) {
    throw new Error(
      `${label}: "${row.trim()}" carries ${cells.length} cells but the Step 2 table declares ` +
        `${columns.length} (${columns.join(' | ')}) — a column added or removed shifts the ` +
        `enrolment verdict onto a neighbouring cell, so this guard fails closed rather than reading it.`,
    )
  }
  const index = columns.indexOf(VERDICT_COLUMN)
  if (index < 0) {
    throw new Error(`${label}: no "${VERDICT_COLUMN}" column among [${columns.join(' | ')}].`)
  }
  return cells[index] as string
}

const adapterCases = CORPORA.flatMap(({ label, adapterDir, skill }) =>
  adapterFiles(adapterDir).map(file => {
    const content = read(join(adapterDir, file))
    return { corpus: label, file, tool: displayName(content, file), skillText: read(skill) }
  }),
)

const skillCases = CORPORA.map(({ label, skill }) => ({ corpus: label, skillText: read(skill) }))

describe('setup-pm SKILL.md — every adapter on disk is a selectable tool (#321)', () => {
  it('discovers adapters from disk in both corpora', () => {
    // Not a count assertion — a non-empty guard, so the data-driven cases below can never
    // pass vacuously by iterating an empty list.
    for (const { label, adapterDir } of CORPORA) {
      expect(adapterFiles(adapterDir).length, `no adapters found in ${label}`).toBeGreaterThan(0)
    }
  })

  it.each(skillCases)(
    '$corpus — the Step 2 table declares the columns this guard reads',
    ({ corpus, skillText }) => {
      // The verdict is located by the column the table NAMES, so the header is asserted rather
      // than assumed: renaming or dropping `Implementation Guide` must fail loudly here instead
      // of leaving every enrolment case below reading whatever cell happened to take its place.
      const step2 = sectionBetween(skillText, '### Step 2: Select PM Tool', '### Step 3:')
      expect(step2Columns(step2, `${corpus} — Step 2 table header`)).toEqual(STEP2_COLUMNS)
    },
  )

  it.each(adapterCases)(
    '$corpus — Step 2 offers $tool as Available (AC-1/AC-8)',
    ({ corpus, tool, skillText }) => {
      const step2 = sectionBetween(skillText, '### Step 2: Select PM Tool', '### Step 3:')
      const columns = step2Columns(step2, `${corpus} — Step 2 table header`)
      const row = step2.split('\n').find(line => line.includes('|') && line.includes(`**${tool}**`))
      expect(row, `Step 2 selection table has no row for ${tool}`).toBeDefined()
      // AC-1 and AC-8 in ONE exact read of the DECLARED verdict column: the cell must BE the
      // positive vocabulary, so a shipped adapter can be neither negated (`Not Available`,
      // `Unavailable`) nor filed under the no-guide HALT row, and a column added to the row
      // throws instead of shifting the read. See `guideVerdict`.
      expect(
        guideVerdict(row as string, `${corpus} — Step 2 row for ${tool}`, columns),
        `Step 2 marks ${tool} "${row}" — an adapter that ships must read exactly "Available"`,
      ).toBe(AVAILABLE)
      // AC-8, ROW-SCOPED AND DELIBERATELY KEPT. The exact read above holds the verdict CELL; it
      // is strictly stronger than the old `toContain('available')` there and nowhere else. The
      // HALT vocabulary parked in another cell — `| **Azure DevOps** | Microsoft ecosystem; no
      // implementation guide yet | Available |` — passes the cell read and is caught only here,
      // which is why both assertions stand rather than one replacing the other.
      expect(
        normalize(row as string),
        `Step 2 files ${tool} under the no-implementation-guide HALT vocabulary: "${row}"`,
      ).not.toContain(HALT_VERDICT)
    },
  )

  it.each(adapterCases)('$corpus — Step 3 links $file (AC-1)', ({ file, skillText }) => {
    const step3 = sectionBetween(skillText, '### Step 3: Apply Implementation Guide', '### Step 4:')
    expect(step3).toMatch(new RegExp(`\\]\\([^)]*${escapeRegExp(file)}\\)`))
  })

  it.each(adapterCases)(
    '$corpus — the Notes supported-tools line names $tool (AC-1)',
    ({ tool, skillText }) => {
      const notes = skillText.slice(skillText.indexOf('## Notes'))
      expect(notes.length, 'no ## Notes section').toBeGreaterThan(0)
      const claim = notes
        .split('\n')
        .find(line => normalize(line).includes('supported tools with implementation guides'))
      expect(claim, 'no supported-tools claim in ## Notes').toBeDefined()
      // The claim line carries BOTH halves of the contract: the tools that ship an adapter, then an
      // `Anything else (…)` sentence naming tools that take the Step 2.4 HALT. Matching the tool
      // name anywhere on the line therefore passes when the tool appears in the EXCLUSION half —
      // so the day a GitLab adapter lands, Step 2/Step 3 enrolment would be enforced while this
      // case still went green on a Notes line that says GitLab halts. Split the line and hold both
      // halves: named among the supported, absent from the excluded.
      const claimText = normalize(claim as string)
      const cut = claimText.indexOf('anything else')
      const supported = cut >= 0 ? claimText.slice(0, cut) : claimText
      const excluded = cut >= 0 ? claimText.slice(cut) : ''
      expect(supported, `${tool} is not named among the supported tools`).toContain(
        tool.toLowerCase(),
      )
      expect(
        excluded,
        `${tool} ships an adapter but the Notes line still excludes it`,
      ).not.toContain(tool.toLowerCase())
    },
  )
})

describe('setup-pm SKILL.md — the tool-agnostic contract holds (#321)', () => {
  it.each(skillCases)(
    '$corpus — the tool argument row points at the canonical token table, never copies it',
    ({ skillText }) => {
      const args = sectionBetween(skillText, '## Arguments', '## Composed Skills')
      const row = args.split('\n').find(line => line.includes('`$tool`') && line.startsWith('|'))
      expect(row, 'no $tool argument row').toBeDefined()
      // AC-2: the accepted values are resolved BY REFERENCE — the single source of truth is
      // the convention, so a token added there is not a two-place edit.
      expect(row as string).toMatch(/way-of-working-pm-resolution\.md/)
      // ...and the Edge Cases keep an unrecognized token from being coerced to a near match.
      const edges = sectionBetween(skillText, '## Edge Cases', '## Graceful Degradation')
      expect(normalize(edges)).toMatch(/invalid \$tool token[\s\S]{0,240}step 2/)
    },
  )

  it.each(skillCases)(
    '$corpus — the Azure walkthrough runs detection before any configuration write (AC-3)',
    ({ skillText }) => {
      const step3 = sectionBetween(
        skillText,
        '### Step 3: Apply Implementation Guide',
        '### Step 4:',
      )
      const azure = step3.split('\n').find(line => normalize(line).includes('for azure devops:'))
      expect(azure, 'no Azure DevOps walkthrough bullet in Step 3').toBeDefined()
      const claim = normalize(azure as string)
      // The adapter's own gate, by name — not a bare mention of `az` authentication.
      expect(claim).toContain('detection and halt behavior')
      expect(claim).toMatch(/before any configuration write/)
      // The skill still never installs or authenticates on its own.
      expect(claim).toMatch(/never installs|neither installs|does not install/)
    },
  )

  it.each(skillCases)(
    '$corpus — Step 4 writes the fields the Azure adapter reads back (AC-4/AC-6)',
    ({ skillText }) => {
      const step4 = sectionBetween(skillText, '### Step 4: Update Way-of-Working', '### Step 5:')
      // SCOPED PER ACT-STEP, not over the whole of Step 4. The injection sweep caught the
      // unscoped version passing vacuously: `team` and `area path` also occur in the AC-6
      // report step, and `invisible` in the pre-existing `## Assignment` paragraph, so a
      // whole-section `toContain` stayed green with the AC-4 claim deleted. Slicing by the
      // step's own bolded title fails CLOSED (`sectionBetween` throws on a miss).
      const FIELDS = '**Act**: Add or update the PM tool section with:'
      const STATE_MAPPING = '**Act — `## State Mapping`'
      const REPORT = '**Act — report what could not be resolved**'
      const GIT_WORKFLOW = '**Act — `## Git Workflow`'

      // AC-4: team + area path are what `--area` on every create is taken from, and they are
      // named in the field list the skill writes — not merely somewhere in the step.
      const fields = normalize(sectionBetween(step4, FIELDS, STATE_MAPPING))
      expect(fields).toContain('area path')
      expect(fields).toContain('team')

      // AC-4: a `## State Mapping` section built from real WORK ITEM states. The skill stays
      // tool-agnostic — it links the schema rather than copying state literals into itself.
      const stateStep = sectionBetween(step4, STATE_MAPPING, REPORT)
      const stateClaim = normalize(stateStep)
      expect(stateClaim).toContain('## state mapping')
      expect(stateClaim).toContain('work item state')
      expect(stateClaim).toContain('board column')
      expect(stateStep).toMatch(/canonical-states\.md/)

      // AC-6: an unresolvable field is REPORTED as a follow-up, never silently dropped.
      const reportClaim = normalize(sectionBetween(step4, REPORT, GIT_WORKFLOW))
      expect(reportClaim).toMatch(/report it to the developer/)
      expect(reportClaim).toMatch(/outside the team's board view/)
      expect(reportClaim).toMatch(/never silently omit/)
    },
  )
})

describe('Azure adapter Adoption Configuration and its website twin agree (#321 AC-5)', () => {
  const ADAPTER = 'azure-devops-implementation.md'
  const WEBSITE = join(REPO_ROOT, 'apps/website/content/docs/pm-tools/azure-devops.mdx')

  /** The single fenced ```markdown block of a section — the snippet a reader copies. */
  const snippet = (section: string, label: string): string => {
    const match = /```markdown\n([\s\S]*?)```/.exec(section)
    if (!match) throw new Error(`${label}: no fenced markdown snippet`)
    return (match[1] as string).trim()
  }

  const adapterSnippet = (dir: string): string =>
    snippet(
      sectionBetween(read(join(dir, ADAPTER)), '### Adoption Configuration', '## Work Item'),
      `${dir}/${ADAPTER}`,
    )

  it.each(CORPORA)('$label — the snippet declares team and area path', ({ adapterDir }) => {
    const claim = normalize(adapterSnippet(adapterDir))
    expect(claim).toContain('team:')
    expect(claim).toContain('area path:')
  })

  it('the website Configuration snippet is the same text, verbatim', () => {
    // Hand-maintained twin (no derivation mechanism, by design) — so the equality is asserted.
    const website = snippet(
      sectionBetween(read(WEBSITE), '## Configuration', '### Prerequisites'),
      'azure-devops.mdx',
    )
    expect(website).toBe(adapterSnippet(join(REPO_ROOT, ADAPTER_REL)))
  })
})

/**
 * ONE act-step of a `### Step N:` section, as the skill's own grammar writes them:
 * `<ordinal>. **<title>**: <body>` at column 0, continuation lines indented under it.
 *
 * The ordinal is the LITERAL numeral in the source, not the position in the array: a skill is
 * fed to the agent as markdown text, so "step 3" is resolved by the reader against the numeral
 * it reads — never against what a renderer would have renumbered it to.
 */
type ActStep = { ordinal: number; title: string; body: string }

const actSteps = (section: string): ActStep[] => {
  const steps: ActStep[] = []
  for (const line of section.split('\n')) {
    const head = /^(\d+)\.\s+\*\*(.+?)\*\*/.exec(line)
    if (head) {
      steps.push({ ordinal: Number(head[1]), title: head[2] as string, body: line })
      continue
    }
    const current = steps[steps.length - 1]
    if (current) current.body += `\n${line}`
  }
  return steps
}

const onlyStep = (steps: ActStep[], marker: string, label: string): ActStep => {
  const found = steps.filter(step => step.title.includes(marker))
  if (found.length !== 1) {
    throw new Error(
      `${label}: expected exactly one act-step titled "${marker}", found ${found.length} — ` +
        `the cross-reference this guard resolves has nothing unambiguous to point at.`,
    )
  }
  return found[0] as ActStep
}

/**
 * Resolves the `## Assignment` act-step's "step N" back-reference against the list it is written
 * in. FAILS CLOSED on every way the reference could go missing — no `## Git Workflow` step, no
 * `## Assignment` step, no citation at all, or an ambiguous second citation — because deleting
 * the sentence must never be a way to make this guard green.
 */
const citedBackReference = (
  step4: string,
  label: string,
): { cited: number; gitWorkflow: number; citedStep: ActStep } => {
  const steps = actSteps(step4)
  const gitWorkflow = onlyStep(steps, '## Git Workflow', label)
  const assignment = onlyStep(steps, '## Assignment', label)
  const citations = [...assignment.body.matchAll(/\bstep (\d+)\b/gi)]
  if (citations.length !== 1) {
    throw new Error(
      `${label}: the ## Assignment act-step carries ${citations.length} "step N" back-references, ` +
        `expected exactly 1 — the separate-code-host condition must cite the step that declares it.`,
    )
  }
  const cited = Number(citations[0]?.[1])
  const citedStep = steps.find(step => step.ordinal === cited)
  if (!citedStep) {
    throw new Error(
      `${label}: the ## Assignment act-step cites step ${cited}, which does not exist.`,
    )
  }
  return { cited, gitWorkflow: gitWorkflow.ordinal, citedStep }
}

describe('setup-pm SKILL.md — Step 4 back-references resolve to the act-step they mean (#321)', () => {
  const step4Of = (skillText: string): string =>
    sectionBetween(skillText, '### Step 4: Update Way-of-Working', '### Step 5:')

  it.each(skillCases)(
    '$corpus — the ## Assignment step cites the ordinal `## Git Workflow` actually has',
    ({ corpus, skillText }) => {
      const { cited, gitWorkflow } = citedBackReference(step4Of(skillText), corpus)
      // Renumbering Step 4 without re-reading its own cross-references is what broke this:
      // two act-steps were inserted at 3 and 4, `## Git Workflow` moved 3 -> 5, and the
      // condition kept naming 3 — which is now `## State Mapping` and declares no code-host.
      expect(cited).toBe(gitWorkflow)
    },
  )

  it.each(skillCases)(
    '$corpus — the cited step is the one that declares `code-host`',
    ({ corpus, skillText }) => {
      // The MEANING, not just the position: for every hosts-no-code tool (Linear, Jira,
      // filesystem) the `code-host-assignee` question is asked only if this condition fires,
      // so the step it points at has to be the step that writes `code-host`.
      const { citedStep } = citedBackReference(step4Of(skillText), corpus)
      expect(normalize(citedStep.body)).toContain('code-host')
    },
  )

  /**
   * Guard strength, on synthetic lists rather than the real corpus — these are the states the
   * artifact must NOT be allowed to reach, and the only way to exercise them without editing
   * the shipped skill into a broken shape.
   */
  const list = (steps: string[]): string =>
    ['### Step 4: Update Way-of-Working', '', ...steps, ''].join('\n')

  const GIT_WORKFLOW_STEP = '**Act — `## Git Workflow` (only when needed)**: write `code-host`.'
  const assignmentStep = (citation: string): string =>
    `**Act — \`## Assignment\` (always ask)**: ${citation}`

  it('a renumbering that moves `## Git Workflow` reddens the back-reference', () => {
    // Both ordinals exist, so the ONLY thing that separates them is the renumbering itself.
    const moved = list([
      '1. **Act — `## State Mapping`**: write the canonical macrostate mapping.',
      `2. ${GIT_WORKFLOW_STEP}`,
      `3. ${assignmentStep('When step 1 just declared a separate `code-host`, also ask.')}`,
    ])
    const { cited, gitWorkflow } = citedBackReference(moved, 'renumbered')
    expect(cited).not.toBe(gitWorkflow)
  })

  it('deleting the `## Git Workflow` act-step throws instead of passing', () => {
    const deleted = list([
      `1. ${assignmentStep('When step 1 just declared a separate `code-host`, also ask.')}`,
    ])
    expect(() => citedBackReference(deleted, 'deleted')).toThrow(/exactly one act-step/)
  })

  it('deleting the citation throws instead of passing', () => {
    const silent = list([
      `1. ${GIT_WORKFLOW_STEP}`,
      `2. ${assignmentStep('Ask who items default to and write `default-assignee`.')}`,
    ])
    expect(() => citedBackReference(silent, 'silent')).toThrow(
      /back-references, expected exactly 1/,
    )
  })

  it('a second `step N` citation throws instead of passing', () => {
    // The other side of the SAME fail-closed branch: zero citations and two citations reach it
    // from opposite directions. Two is the one this repair can introduce — the fixer edits this
    // very sentence, and mentioning a second ordinal while editing makes the reference ambiguous,
    // at which point "the first match" would silently decide which step the condition means.
    const ambiguous = list([
      `1. ${GIT_WORKFLOW_STEP}`,
      `2. ${assignmentStep(
        'When step 1 just declared a separate `code-host` (see step 1 above), also ask.',
      )}`,
    ])
    expect(() => citedBackReference(ambiguous, 'ambiguous')).toThrow(
      /carries 2 "step N" back-references, expected exactly 1/,
    )
  })

  it('a citation naming an ordinal the list does not contain throws instead of passing', () => {
    // Out of range, not merely stale: both referent and citation exist as text, but the numeral
    // resolves to nothing. Returning here instead of throwing would let `cited` compare against a
    // `gitWorkflow` ordinal it was never read from, and an off-by-one in the ordinal lookup would
    // downgrade this guard from fail-closed to fail-open on the whole class.
    const outOfRange = list([
      `1. ${GIT_WORKFLOW_STEP}`,
      `2. ${assignmentStep('When step 7 just declared a separate `code-host`, also ask.')}`,
    ])
    expect(() => citedBackReference(outOfRange, 'out of range')).toThrow(
      /cites step 7, which does not exist/,
    )
  })
})

/**
 * Guard strength for the Step 2 enrolment verdict, on synthetic rows rather than the real corpus
 * — the states the shipped table must NOT be allowed to reach, exercised without editing it into
 * a broken shape. Same construction as the back-reference fail-closed block above.
 *
 * Two classes live here. (a) Substring containment: every negation of `Available` CONTAINS the
 * token it negates, so the assertion that read the cell by containment accepted the exact edit it
 * existed to catch. (b) Column drift: a verdict located by position shifts onto a neighbouring
 * cell the moment the row gains or loses a column, which is the same failure reached from the
 * other side. Marking a tool unselectable while its adapter file stays on disk is the natural
 * deprecation order, and adding a column to a comparison table is ordinary editing — which is
 * what makes both reachable rather than contrived.
 */
describe('setup-pm SKILL.md — the Step 2 enrolment verdict is read exactly (#321 AC-1/AC-8)', () => {
  const row = (verdict: string): string =>
    `   > | **Azure DevOps** | Microsoft ecosystem, enterprise boards + repos | ${verdict} |`

  it.each([
    ['Not Available', 'not available'],
    ['Unavailable', 'unavailable'],
    ['NOT AVAILABLE', 'not available'],
    ['No implementation guide yet', 'no implementation guide yet'],
    ['TBD', 'tbd'],
    ['', ''],
  ])('a "%s" verdict is not the enrolment vocabulary', (verdict, expected) => {
    const read = guideVerdict(row(verdict), 'synthetic')
    expect(read).toBe(expected)
    // The assertion the real case makes — stated here against the value that must fail it.
    expect(read).not.toBe(AVAILABLE)
  })

  it.each([
    ['Available', 'the shipped vocabulary'],
    ['**Available**', 'emphasised'],
    ['  Available  ', 'padded'],
    ['`Available`', 'in a code span'],
  ])('"%s" (%s) still enrolls the tool', verdict => {
    // The other half: tightening the read must not reject the formatting the table legitimately
    // uses, or the guard would redden on a prettier reflow rather than on a real regression.
    expect(guideVerdict(row(verdict), 'synthetic')).toBe(AVAILABLE)
  })

  it('a line that is not a table row throws instead of yielding a verdict', () => {
    expect(() =>
      guideVerdict('   > Which tool does your team use or want to adopt? | Available', 'prose'),
    ).toThrow(/is not a \| Tool \| Best For \| Implementation Guide \| table row/)
  })

  it('a row missing its trailing pipe throws instead of yielding a verdict', () => {
    // Fail closed on truncation too: `split` on an unterminated row would hand back the LAST
    // cell as if it were the one before it, silently reading the Best For column as the verdict.
    expect(() =>
      guideVerdict('   > | **Azure DevOps** | Microsoft ecosystem | Available', 'truncated'),
    ).toThrow(/is not a \| Tool \| Best For \| Implementation Guide \| table row/)
  })

  it('a terminated row carrying one EXTRA column throws instead of shifting the read', () => {
    // The counterexample that a position-from-the-right read passes: the row is bounded, throws
    // nothing, and its last-but-one cell is the appended column — so `Not Available` in the real
    // Implementation Guide column would have been laundered into `available`.
    const widened = '   > | **Azure DevOps** | Microsoft ecosystem | Not Available | Available |'
    expect(rowCells(widened, 'widened')).toEqual([
      'azure devops',
      'microsoft ecosystem',
      'not available',
      'available',
    ])
    expect(() => guideVerdict(widened, 'synthetic')).toThrow(
      /carries 4 cells but the Step 2 table declares 3/,
    )
  })

  it('a row MISSING a column throws instead of reading its neighbour', () => {
    // The same arity check from the other direction: dropping `Best For` would put the tool name
    // itself one cell from the end, and a positional read would compare a tool name to a verdict.
    expect(() => guideVerdict('   > | **Azure DevOps** | Available |', 'narrowed')).toThrow(
      /carries 2 cells but the Step 2 table declares 3/,
    )
  })

  it('an embedded pipe in the Best For cell throws instead of being absorbed', () => {
    // Extra cells to the LEFT are a column drift too. A positional read absorbs them silently;
    // exact arity rejects them, so an author who writes a pipe into prose is told, not ignored.
    expect(() =>
      guideVerdict('   > | **Azure DevOps** | boards | repos | Available |', 'embedded pipe'),
    ).toThrow(/carries 4 cells but the Step 2 table declares 3/)
  })

  it('the HALT vocabulary outside the verdict cell is caught by the row-scoped guard', () => {
    // Why the real case keeps TWO assertions. The cell-exact read is strictly stronger than the
    // old containment check WITHIN the verdict cell — and blind everywhere else. This row reads
    // `Available` in the declared column and still files a shipped adapter under the Step 2.4
    // HALT vocabulary; only the row-scoped AC-8 assertion rejects it.
    const laundered =
      '   > | **Azure DevOps** | Microsoft ecosystem; no implementation guide yet | Available |'
    expect(guideVerdict(laundered, 'synthetic')).toBe(AVAILABLE)
    expect(normalize(laundered)).toContain(HALT_VERDICT)
  })

  it('the verdict is located by the declared column, not by a position', () => {
    // The header decides which cell is read: with the verdict column declared FIRST, the first
    // cell is the verdict — a read counted from the end would answer `azure devops`.
    const reordered = ['implementation guide', 'tool', 'best for']
    expect(
      guideVerdict(
        '   > | Available | **Azure DevOps** | Microsoft ecosystem |',
        'reordered',
        reordered,
      ),
    ).toBe(AVAILABLE)
  })

  it('a Step 2 table whose header drops the verdict column throws', () => {
    const headerless = [
      '### Step 2: Select PM Tool',
      '',
      '> | Tool | Best For |',
      '> |---|---|',
      '',
    ].join('\n')
    expect(() => step2Columns(headerless, 'no verdict column')).toThrow(
      /no "implementation guide" column/,
    )
  })

  it('a Step 2 section with no table header at all throws', () => {
    expect(() => step2Columns('### Step 2: Select PM Tool\n\n> Pick one.\n', 'no header')).toThrow(
      /no header row starting with a "Tool" column/,
    )
  })
})
