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
 * INTERNAL CROSS-REFERENCES (round-1 finding r0-1).
 *
 * Step 4's act-steps were renumbered — `## Git Workflow` moved from 3 to 5 and `## State
 * Mapping` was inserted as 3 — but the `## Assignment` act-step kept saying "When step 3 just
 * declared a separate `code-host`". Step 3 is now State Mapping, which declares no `code-host`,
 * so on every hosts-no-code path (`linear`, `jira`, `filesystem`) the antecedent is false and
 * `code-host-assignee` is never asked and never written — the assignee cascade then files PRs on
 * the split code host unassigned or under the wrong identifier.
 *
 * Nothing on the gate could see it: the AC-4/AC-6 case slices Step 4 per act-step by NAME, so a
 * renumber is invisible to it. These cases read the numbering itself. Both indices are DERIVED
 * from the document — a future renumber that sweeps its own references stays green, one that
 * does not goes red, and no literal step number is maintained here.
 *
 * Two claims here are about IDENTITY, not existence, and both were rebuilt after the contract
 * validator showed the first attempt asserted less than it claimed:
 *   - the code-host WRITER is counted, not just located — an index the Assignment antecedent is
 *     compared against is only well-defined while exactly one act-step writes `code-host`;
 *   - a `Step <n>.<m>` cross-reference must still name the act-step it was WRITTEN for, so a
 *     renumber that re-points it goes red instead of staying silently green on the index alone.
 */
describe("setup-pm SKILL.md — Step 4's internal cross-references resolve (#321 r0-1)", () => {
  const ASSIGNMENT = '**Act — `## Assignment`'
  const GIT_WORKFLOW = '**Act — `## Git Workflow`'

  /**
   * The act-step that WRITES `code-host`, as opposed to the ones that read it back
   * (`## Assignment`) or verify it (`**Verify**`). The negative lookahead is load-bearing:
   * `## Assignment` says "write code-host-assignee", a different key — without it that act-step
   * would count as a second writer and the uniqueness claim below could never hold.
   */
  const WRITES_CODE_HOST = /\bwrite code-host(?![\w-])/

  /**
   * A `Step <n>.<m>` cross-reference names an act-step by POSITION; what the author meant is the
   * act-step's content. Pinning that content here is what makes a renumber that moves the target
   * visible — an index-only check passes on a re-pointed reference. Fail-closed by construction:
   * a cross-reference the document adds and this map does not pin fails the case below.
   */
  const REF_INTENT: Record<string, string> = {
    // "the tool-specific fields Step 4.2 writes" — Step 4's way-of-working field list.
    'Step 4.2': 'add or update the pm tool section with',
    // "HALT with contribution instructions (Step 2.4)" — Step 2's no-guide HALT.
    'Step 2.4': 'without an implementation guide',
  }

  /** The `### Step <n>:` section, ending at the next step (or at `## Output Format` for the last). */
  const stepSection = (skillText: string, n: number): string => {
    const next = skillText.includes(`### Step ${n + 1}:`) ? `### Step ${n + 1}:` : '## Output Format'
    return sectionBetween(skillText, `### Step ${n}:`, next)
  }

  /** Every act-step of a step section: its ordered index and its full body. Fails CLOSED on none. */
  const actSteps = (section: string): { index: number; body: string }[] => {
    const steps: { index: number; body: string }[] = []
    for (const line of section.split('\n')) {
      const match = /^(\d+)\. /.exec(line)
      if (match) steps.push({ index: Number(match[1]), body: line })
      else if (steps.length > 0) {
        const last = steps[steps.length - 1] as { body: string }
        last.body = `${last.body}\n${line}`
      }
    }
    if (steps.length === 0) throw new Error('actSteps: section carries no ordered act-step')
    return steps
  }

  /** Ordered-list index of the act-step whose line carries `marker`. Fails CLOSED on a miss. */
  const actStepIndex = (section: string, marker: string): number => {
    const lines = section.split('\n').filter(line => line.includes(marker))
    if (lines.length !== 1) {
      throw new Error(`actStepIndex: expected exactly one act-step line for "${marker}", got ${lines.length}`)
    }
    const match = /^(\d+)\. /.exec(lines[0] as string)
    if (!match) throw new Error(`actStepIndex: act-step for "${marker}" is not a numbered list item`)
    return Number(match[1])
  }

  /** Body of the act-step carrying ordered index `index`. Fails CLOSED on absent or duplicate. */
  const actStepBody = (section: string, index: number): string => {
    const hits = actSteps(section).filter(step => step.index === index)
    if (hits.length !== 1) {
      throw new Error(`actStepBody: expected exactly one act-step numbered ${index}, got ${hits.length}`)
    }
    return (hits[0] as { body: string }).body
  }

  it.each(skillCases)(
    '$corpus — the Assignment act-step points its code-host antecedent at the step that writes code-host (r0-1)',
    ({ skillText }) => {
      const step4 = stepSection(skillText, 4)
      const gitIndex = actStepIndex(step4, GIT_WORKFLOW)
      const assignment = sectionBetween(step4, ASSIGNMENT, '**Verify**')

      // A numeric antecedent must name the act-step that actually writes `code-host`. Naming the
      // section instead ("just declared in `## Git Workflow`") is equally correct and leaves no
      // number to drift — hence "every reference agrees", not "a reference exists".
      const referenced = [...assignment.matchAll(/\bstep (\d+)\b/gi)].map(m => Number(m[1]))
      const wrong = referenced.filter(n => n !== gitIndex)
      expect(
        wrong,
        `the Assignment act-step refers to step ${wrong.join(', ')}, but \`code-host\` is written ` +
          `by act-step ${gitIndex} (\`## Git Workflow\`) — the condition is false on every ` +
          `hosts-no-code path and \`code-host-assignee\` is never asked`,
      ).toEqual([])
    },
  )

  it.each(skillCases)(
    '$corpus — the Assignment act-step still carries the code-host-assignee conditional (r0-1)',
    ({ skillText }) => {
      // Non-vacuity guard for the case above: with the clause deleted there is no antecedent to
      // be wrong about, and "every reference agrees" would pass on a skill that stopped asking.
      const assignment = normalize(sectionBetween(stepSection(skillText, 4), ASSIGNMENT, '**Verify**'))
      expect(assignment).toContain('code-host-assignee')
      expect(assignment).toMatch(/different identifier/)
    },
  )

  it.each(skillCases)(
    '$corpus — `## Git Workflow` is the only Step 4 act-step that writes code-host (r0-1)',
    ({ skillText }) => {
      // The index the case above compares against is only well-defined while EXACTLY ONE act-step
      // writes `code-host`. Counting the writers — not just confirming the Git Workflow step is
      // one of them — is what makes that precondition asserted: a second writer elsewhere in
      // Step 4 makes "the step that writes code-host" ambiguous, and "just declared" false for
      // whichever one the reader did not mean.
      const step4 = stepSection(skillText, 4)
      const writers = actSteps(step4)
        .filter(step => WRITES_CODE_HOST.test(normalize(step.body)))
        .map(step => step.index)
      const gitIndex = actStepIndex(step4, GIT_WORKFLOW)
      expect(
        writers,
        `Step 4 act-steps writing \`code-host\`: ${writers.join(', ') || 'none'} — the antecedent ` +
          `in \`## Assignment\` is only well-defined when that is exactly act-step ${gitIndex} ` +
          `(\`## Git Workflow\`)`,
      ).toEqual([gitIndex])
      // `just declared` also requires the writer to PRECEDE the act-step that reads it back.
      expect(gitIndex).toBeLessThan(actStepIndex(step4, ASSIGNMENT))
    },
  )

  it.each(skillCases)(
    '$corpus — every `Step <n>.<m>` cross-reference still names the act-step it was written for (r0-1)',
    ({ skillText }) => {
      // The same renumber that broke the Assignment antecedent can re-point `Step 4.2` and
      // `Step 2.4` in Edge Cases / Graceful Degradation. Index existence is not enough: after a
      // renumber the index usually still exists and names something ELSE. So each reference is
      // resolved to its act-step and that act-step's CONTENT is checked against what the author
      // wrote the reference for — fixing r0-1 by renumbering goes red here instead of silent.
      const refs = [...skillText.matchAll(/\bStep (\d+)\.(\d+)\b/g)].map(m => ({
        ref: `Step ${m[1]}.${m[2]}`,
        step: Number(m[1]),
        item: Number(m[2]),
      }))
      expect(refs.length, 'no `Step <n>.<m>` cross-references found — regex or document drifted').toBeGreaterThan(0)

      const unpinned = [...new Set(refs.map(r => r.ref))].filter(ref => !(ref in REF_INTENT))
      expect(
        unpinned,
        'cross-references with no pinned intent — add what the referenced act-step must say to REF_INTENT',
      ).toEqual([])

      const dangling = refs.filter(r => !actSteps(stepSection(skillText, r.step)).some(s => s.index === r.item))
      expect(dangling.map(r => r.ref), 'cross-references naming an act-step that does not exist').toEqual([])

      const repointed = refs.filter(
        r => !normalize(actStepBody(stepSection(skillText, r.step), r.item)).includes(REF_INTENT[r.ref] as string),
      )
      expect(
        repointed.map(r => `${r.ref} (expected: "${REF_INTENT[r.ref]}")`),
        'cross-references resolving to a DIFFERENT act-step than the one they were written for',
      ).toEqual([])
    },
  )

  it('Step 4 is byte-identical in both corpora (r0-1 — the mirror is re-synced, not hand-edited)', () => {
    // Step 4 carries no skill-name token, so the `pair update` transform leaves it untouched: the
    // dataset fix reaches the generated mirror only by re-running the transform. A hand-edit to
    // one corpus alone shows up here as a diff.
    const [dataset, generated] = skillCases.map(({ skillText }) => stepSection(skillText, 4))
    expect(generated).toBe(dataset)
  })

  it('the cross-reference helpers fail closed when an act-step marker is absent (r0-1)', () => {
    // A renamed act-step must throw, never widen to the whole section and pass vacuously — the
    // fail-open slice this file already paid for once in the AC-4/AC-6 case.
    const section = '### Step 4: Update Way-of-Working\n\n1. **Act — `## Something Else`**: x\n'
    expect(() => actStepIndex(section, GIT_WORKFLOW)).toThrow(/expected exactly one act-step line/)
    expect(() => sectionBetween(section, ASSIGNMENT, '**Verify**')).toThrow(/not found/)
  })

  it('the act-step resolver fails closed on an absent or duplicated index (r0-1)', () => {
    // The identity check above is only as good as its resolver: a missing or duplicated ordered
    // index must throw, never resolve to a neighbour and let a re-pointed reference pass.
    const section = '### Step 4: Update Way-of-Working\n\n1. **Check**: x\n1. **Act**: y\n'
    expect(() => actStepBody(section, 2)).toThrow(/expected exactly one act-step numbered 2/)
    expect(() => actStepBody(section, 1)).toThrow(/expected exactly one act-step numbered 1/)
    expect(() => actSteps('### Step 9: nothing ordered here\n\n- a bullet\n')).toThrow(/no ordered act-step/)
  })
})
