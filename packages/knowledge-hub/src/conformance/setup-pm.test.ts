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
 * Every assertion in this file was injection-tested — per the vacuous-assertion lesson recorded
 * in `pm-tool-adapter-contract.test.ts`. TWO injections, not one: the claim DELETED from the
 * artifact, and the claim REWORDED with the prose around it left alone. Deletion alone is not
 * enough. The AC-4 field declaration passed the deletion sweep and still went green on a reworded
 * normative clause, because `team` and `area path` also occur in the rationale sentence that
 * follows it — rewording is how a prose document is actually maintained, so a scoped assertion
 * must be anchored on the DECLARATION, never on a substring its own justification repeats.
 *
 * AND THE SCOPE'S OWN BOUNDARY IS PART OF THE CLAIM. The first anchoring cut the declaration at
 * "the next colon", which is only as narrow as the punctuation the rationale happens to use: a
 * clause reworded to end in a period, with a colon left anywhere in the sentence after it, put
 * the justification back inside the slice and the suite back to all-green. A boundary asserted
 * only for the punctuation the artifact ships today is not asserted at all.
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

/**
 * The phrase that introduces the exclusion sentence of the `## Notes` supported-tools claim.
 * LOAD-BEARING PROSE: the claim line carries both halves of ONE contract — the tools that ship
 * an adapter, then an `Anything else (…)` sentence naming the tools that take the Step 2.4 HALT
 * — and this phrase is the only thing that tells the two halves apart.
 */
const EXCLUSION_MARKER = 'anything else'

/**
 * The `## Notes` supported-tools claim line. FAILS CLOSED on both ways it can go missing.
 *
 * `indexOf` returns -1 on a miss and `slice(-1)` WIDENS to the file's last character instead of
 * narrowing to nothing — so the `notes.length > 0` guard this replaces could never fire: it
 * asserted the length of a 1-character string. The claim assertion below it did fail closed, but
 * on a coincidence (a 1-character haystack holds no claim line), not on the missing section.
 */
const notesClaim = (skillText: string, label: string): string => {
  const at = skillText.indexOf('## Notes')
  if (at === -1) throw new Error(`${label}: no ## Notes section`)
  const claim = skillText
    .slice(at)
    .split('\n')
    .find(line => normalize(line).includes('supported tools with implementation guides'))
  if (!claim) throw new Error(`${label}: no supported-tools claim line in ## Notes`)
  return claim
}

/**
 * Splits the claim into its supported half and its excluded half, and FAILS CLOSED when the
 * exclusion sentence is not there to split on.
 *
 * Falling back to "the whole line is the supported half" is the vacuity this guard exists to
 * prevent, one level up: the tool name would again match anywhere on the line, INCLUDING the
 * exclusion half, so a shipped GitLab adapter would be enforced in Step 2 and Step 3 while this
 * case went green on a Notes line saying GitLab halts. A prose reword of the phrase is exactly
 * what the enrolment recipe in this file's header invites, and nothing in SKILL.md marks the
 * phrase as load-bearing — so the guard says so itself, here, instead of silently widening.
 */
const supportedClaimHalves = (
  claimLine: string,
  label: string,
): { supported: string; excluded: string } => {
  const claimText = normalize(claimLine)
  const cut = claimText.indexOf(EXCLUSION_MARKER)
  if (cut === -1) {
    throw new Error(
      `${label}: the Notes supported-tools claim has no "${EXCLUSION_MARKER}" exclusion sentence ` +
        `to split on — the supported and excluded halves cannot be told apart, and matching the ` +
        `tool name against the whole line would pass on a line that EXCLUDES the tool. Restore ` +
        `the phrase, or teach this guard the new one.`,
    )
  }
  return { supported: claimText.slice(0, cut), excluded: claimText.slice(cut) }
}

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
    ({ corpus, tool, skillText }) => {
      // Both halves of the contract are held: named among the supported, absent from the excluded.
      // The split itself fails closed in `supportedClaimHalves` — see the synthetic rows below.
      const { supported, excluded } = supportedClaimHalves(notesClaim(skillText, corpus), corpus)
      expect(supported, `${tool} is not named among the supported tools`).toContain(
        tool.toLowerCase(),
      )
      expect(
        excluded,
        `${tool} ships an adapter but the Notes line still excludes it`,
      ).not.toContain(tool.toLowerCase())
    },
  )

  /**
   * Guard strength for the claim-line split, on synthetic lines rather than the real corpus —
   * the states the artifact must NOT be allowed to reach, exercised without editing the shipped
   * skill into a broken shape (the technique the Step 4 back-reference block below already uses).
   */
  const claimLine = (supported: string, exclusion: string): string =>
    `- Supported tools with implementation guides: ${supported} — the same tools the Step 2 table ` +
    `offers, and exactly the adapters shipped in [project-management-tool/](../README.md). ` +
    exclusion

  const SUPPORTED = '**GitHub Projects**, **Filesystem**'
  const EXCLUSION = 'Anything else (Jira, GitLab) takes the Step 2.4 HALT.'

  it('a reworded exclusion sentence throws instead of matching the whole line', () => {
    // The precise edit this file's own enrolment recipe invites. Falling back to the whole line
    // reports a tool named ONLY in the exclusion half as supported: with a gitlab adapter on
    // disk, the two Notes cases go green on a claim line that says GitLab halts.
    const reworded = claimLine(SUPPORTED, 'Everything else (Jira, GitLab) takes the Step 2.4 HALT.')
    expect(() => supportedClaimHalves(reworded, 'reworded')).toThrow(
      /no "anything else" exclusion sentence/,
    )
  })

  it('a claim line with no exclusion sentence at all throws instead of matching the whole line', () => {
    // The other direction into the same branch: deleted rather than reworded.
    expect(() => supportedClaimHalves(claimLine(SUPPORTED, ''), 'no exclusion')).toThrow(
      /supported and excluded halves cannot be told apart/,
    )
  })

  it('a tool named only in the excluded half never reaches the supported half', () => {
    const { supported, excluded } = supportedClaimHalves(
      claimLine(SUPPORTED, EXCLUSION),
      'excluded only',
    )
    expect(supported).not.toContain('gitlab')
    expect(excluded).toContain('gitlab')
  })

  it('a tool named in both halves is still held excluded', () => {
    // Half-enrolled: the Step 2 row, the Step 3 link and the supported list all landed, but the
    // exclusion sentence was never cleaned up. Holding only the supported half would go green.
    const { supported, excluded } = supportedClaimHalves(
      claimLine(`${SUPPORTED}, **GitLab**`, EXCLUSION),
      'both halves',
    )
    expect(supported).toContain('gitlab')
    expect(excluded).toContain('gitlab')
  })

  it('a missing ## Notes section throws instead of passing', () => {
    expect(() => notesClaim('# Skill\n\n## Arguments\n\nno notes at all.\n', 'no notes')).toThrow(
      /no ## Notes section/,
    )
  })

  it('a ## Notes section carrying no supported-tools claim throws instead of passing', () => {
    expect(() =>
      notesClaim('# Skill\n\n## Notes\n\n- something else entirely.\n', 'no claim'),
    ).toThrow(/no supported-tools claim line/)
  })
})

/** The lead-in of the per-tool field declaration inside Step 4's field list. */
const AZURE_FIELD_LEAD = 'for azure devops'

/**
 * Where the normative clause ENDS: the first sentence-or-separator boundary after the lead.
 *
 * Deliberately NOT "the next colon". `indexOf(':', from)` finds the first colon ANYWHERE after
 * the lead, and nothing about that colon says it is the declaration's own separator — so on a
 * bullet whose clause ends in a period and whose rationale carries a colon later on, the slice
 * silently absorbs the rationale and the guard reads the justification again. See the two
 * synthetic rows below for the exact prose that restores the defect.
 */
const AZURE_DECLARATION_END = /[.:]/

/**
 * The Azure DevOps field DECLARATION inside Step 4's field list — the `<fields>` half of the
 * bullet's `For Azure DevOps <fields>: <why>` form, with everything from the clause's own
 * terminator onwards cut off — and FAILING CLOSED on every way those two halves could stop
 * being tellable apart.
 *
 * Asserting over the whole bullet is vacuous: its rationale repeats both field names ("an item
 * outside the area paths the team's board is configured for"), so `toContain('area path')` and
 * `toContain('team')` were answered by the justification and stayed green — 49/49 — after the
 * normative clause was reworded to "For Azure DevOps nothing extra is needed", on a Step 4 that
 * no longer tells the skill to write anything. Deleting the bullet did redden; rewording it did
 * not, and rewording is the maintenance mode of a prose skill document.
 *
 * CUTTING AT THE CLAUSE'S TERMINATOR, NOT AT THE NEXT COLON, is the second half of the same
 * lesson: a boundary defined as "the next colon" is only as narrow as the punctuation the
 * rationale happens to use. Reword the clause to "For Azure DevOps nothing extra is needed."
 * and put a colon anywhere in the sentence that follows, and a colon-seeking cut hands back
 * the rationale — 56/56 green on a Step 4 that again tells the skill to write nothing.
 */
const azureFieldDeclaration = (fieldList: string, label: string): string => {
  const declarations = fieldList
    .split('\n')
    .filter(line => normalize(line).includes(AZURE_FIELD_LEAD))
  if (declarations.length !== 1) {
    throw new Error(
      `${label}: the Step 4 field list carries ${declarations.length} "For Azure DevOps" field ` +
        `declarations, expected exactly 1 — there is no one normative clause for this guard to ` +
        `read, and falling back to the whole field list would pass on prose that merely mentions ` +
        `the fields. Restore the single declaration, or teach this guard the new shape.`,
    )
  }
  const bullet = normalize(declarations[0] as string)
  const from = bullet.indexOf(AZURE_FIELD_LEAD)
  const terminator = AZURE_DECLARATION_END.exec(bullet.slice(from))
  if (!terminator) {
    throw new Error(
      `${label}: the "For Azure DevOps" field declaration has no ":" separating what the skill ` +
        `must write from why, and no "." ending it either — declaration and rationale cannot be ` +
        `told apart, and matching the whole bullet is the exact vacuity this split exists to ` +
        `prevent. Restore the "For Azure DevOps <fields>: <why>" form, or teach this guard the ` +
        `new one.`,
    )
  }
  return bullet.slice(from, from + terminator.index)
}

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
    ({ corpus, skillText }) => {
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

      // AC-4: team + area path are what `--area` on every create is taken from, and the field
      // list DECLARES them as the fields to write — not merely mentions them somewhere in the
      // bullet. Scoped to the declaration half, because the rationale that follows the colon
      // repeats both names and was answering for the claim: see the synthetic rows below.
      const declaration = azureFieldDeclaration(
        sectionBetween(step4, FIELDS, STATE_MAPPING),
        corpus,
      )
      expect(declaration, 'the Azure field declaration does not name the area path').toContain(
        'area path',
      )
      expect(declaration, 'the Azure field declaration does not name the team').toContain('team')

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

  /**
   * Guard strength for the field-declaration split, on synthetic bullets rather than the real
   * corpus — the states the artifact must NOT be allowed to reach, exercised without editing the
   * shipped skill into a broken shape (the technique the claim-halves and back-reference blocks
   * in this file already use).
   */
  const RATIONALE =
    'each work-item create passes `--area`, and an item outside the area paths the ' +
    "team's board is configured for is created, assigned and absent from the view the team " +
    'actually reads.'

  const fieldsStep = (...azureSentences: string[]): string =>
    [
      '2. **Act**: Add or update the PM tool section with:',
      '   - Tool name and version/tier',
      ...azureSentences.map(
        sentence =>
          "   - **Every field the selected tool's adapter reads back from this file** — its " +
          '`### Adoption Configuration` snippet is the schema, so nothing tool-specific is ' +
          `enumerated here. ${sentence}`,
      ),
      '   - Reference to implementation guide',
    ].join('\n')

  it('the shipped declaration shape names both fields', () => {
    // The positive control for the split: the form both corpora ship today still passes.
    const shipped = fieldsStep(
      `For Azure DevOps that is the **team and its area path**: ${RATIONALE}`,
    )
    const declaration = azureFieldDeclaration(shipped, 'shipped')
    expect(declaration).toContain('area path')
    expect(declaration).toContain('team')
  })

  it('a reworded declaration reddens even though the rationale still names both fields', () => {
    // The precise edit that went green at 49/49: the normative clause is gone, its justification
    // is not — and the justification is where `team` and `area path` were being read from.
    const reworded = fieldsStep(`For Azure DevOps nothing extra is needed: ${RATIONALE}`)
    // The bullet as a whole still carries both names, so an unscoped assertion is satisfied...
    expect(normalize(reworded)).toContain('area path')
    expect(normalize(reworded)).toContain('team')
    // ...and the declaration carries neither, which is what makes the real case red.
    const declaration = azureFieldDeclaration(reworded, 'reworded')
    expect(declaration).not.toContain('area path')
    expect(declaration).not.toContain('team')
  })

  it('a sentence-form declaration that does name both fields still passes', () => {
    // The second positive control, for the boundary rather than the split: a clause that ends in
    // a PERIOD and does declare the two fields is conformant prose, not a defect. Tightening the
    // boundary must not turn a correct rewording red — that is how a guard gets relaxed later.
    const sentenceForm = fieldsStep(
      `For Azure DevOps write the **team and its area path**. Each work-item create passes ` +
        '`--area`, and an item outside those area paths is invisible to the board.',
    )
    const declaration = azureFieldDeclaration(sentenceForm, 'sentence form')
    expect(declaration).toBe('for azure devops write the team and its area path')
    expect(declaration).toContain('area path')
    expect(declaration).toContain('team')
  })

  it('a clause ending in a period reddens even when a colon appears later in the rationale', () => {
    // THE COLON-BOUNDARY HOLE, and why "cut at the next colon" was not the fix. `indexOf(':',
    // from)` takes the first colon ANYWHERE after the lead, and nothing about that colon says it
    // is the declaration's own separator — so this bullet (clause terminated by a period, colon
    // parked inside the rationale) handed the whole justification back and reported 56/56 green
    // on the same "nothing extra is needed" wording the deletion-and-reword sweep was built for.
    const periodClause = fieldsStep(
      'For Azure DevOps nothing extra is needed. Each work-item create passes `--area`, and an ' +
        "item outside the area paths the team's board is configured for is created, assigned and " +
        'absent from the view the team actually reads: that is the risk.',
    )
    const bullet = normalize(periodClause)
    // A colon IS present after the lead, so a colon-seeking cut finds one...
    expect(bullet.slice(bullet.indexOf(AZURE_FIELD_LEAD))).toContain(':')
    // ...and what it would hand back names both fields — the whole-bullet vacuity, restored.
    expect(bullet).toContain('area path')
    expect(bullet).toContain('team')
    // The clause's OWN terminator is the period, so the declaration names neither field.
    const declaration = azureFieldDeclaration(periodClause, 'period clause')
    expect(declaration).toBe('for azure devops nothing extra is needed')
    expect(declaration).not.toContain('area path')
    expect(declaration).not.toContain('team')
  })

  it('a second period-terminated clause reddens too — the class, not one sentence', () => {
    // A less minimal instance of the same class, so the row is shown to cover the CLASS and not
    // the one sentence the counterexample happened to use: different rationale, colon in a
    // different place, same defect — a Step 4 that declares nothing to write.
    const variant = fieldsStep(
      'For Azure DevOps nothing extra is needed. An item outside the area paths the ' +
        "team's board is configured for is still perfectly fine: each work-item create passes " +
        '`--area` regardless.',
    )
    const declaration = azureFieldDeclaration(variant, 'period clause, variant')
    expect(declaration).toBe('for azure devops nothing extra is needed')
    expect(declaration).not.toContain('area path')
    expect(declaration).not.toContain('team')
  })

  it('a declaration naming only one of the two fields reddens', () => {
    // Half the contract: `--area` has a value and nothing says whose team's board it belongs to.
    const partial = fieldsStep(`For Azure DevOps that is the **area path**: ${RATIONALE}`)
    const declaration = azureFieldDeclaration(partial, 'area path only')
    expect(declaration).toContain('area path')
    expect(declaration).not.toContain('team')
  })

  it('a declaration with no rationale separator throws instead of matching the bullet', () => {
    // Names BOTH fields and still throws: with no colon the guard cannot tell which half it is
    // reading, and widening to the bullet is how the rationale started answering for the claim.
    const unsplittable = fieldsStep(
      'For Azure DevOps the team and its area path are read back from the adapter snippet',
    )
    expect(() => azureFieldDeclaration(unsplittable, 'no separator')).toThrow(
      /has no ":" separating what the skill must write from why/,
    )
  })

  it('deleting the declaration throws instead of passing', () => {
    expect(() => azureFieldDeclaration(fieldsStep(), 'deleted')).toThrow(
      /carries 0 "For Azure DevOps" field declarations/,
    )
  })

  it('a second declaration throws instead of silently reading the first', () => {
    // Half-finished edit: a new bullet supersedes the old one and neither was removed, so "the
    // first match" would quietly decide which of two contradictory clauses is the normative one.
    const ambiguous = fieldsStep(
      `For Azure DevOps that is the **team and its area path**: ${RATIONALE}`,
      'For Azure DevOps nothing extra is needed: the adapter snippet is the schema.',
    )
    expect(() => azureFieldDeclaration(ambiguous, 'ambiguous')).toThrow(
      /carries 2 "For Azure DevOps" field declarations/,
    )
  })

  it('a Step 4 whose field-list act-step is gone fails closed on the slice', () => {
    // The cheapest way to make this case vacuous is to delete the step it slices. `sectionBetween`
    // throws rather than widening to the whole of Step 4, where both field names also occur.
    const step4 = [
      '### Step 4: Update Way-of-Working',
      '',
      '1. **Check**: read the file.',
      '',
    ].join('\n')
    expect(() =>
      sectionBetween(
        step4,
        '**Act**: Add or update the PM tool section with:',
        '**Act — `## State Mapping`',
      ),
    ).toThrow(/"\*\*Act\*\*: Add or update the PM tool section with:" not found/)
  })
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
