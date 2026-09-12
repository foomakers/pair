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

  it.each(adapterCases)(
    '$corpus — Step 2 offers $tool as Available (AC-1/AC-8)',
    ({ tool, skillText }) => {
      const step2 = sectionBetween(skillText, '### Step 2: Select PM Tool', '### Step 3:')
      const row = step2.split('\n').find(line => line.includes('|') && line.includes(`**${tool}**`))
      expect(row, `Step 2 selection table has no row for ${tool}`).toBeDefined()
      expect(normalize(row as string)).toContain('available')
      // AC-8: an adapter that ships must not be filed under the no-guide HALT row.
      expect(normalize(row as string)).not.toContain('no implementation guide')
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
      expect(normalize(claim as string)).toContain(tool.toLowerCase())
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
