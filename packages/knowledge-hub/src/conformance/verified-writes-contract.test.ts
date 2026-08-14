import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Conformance guard for the **verified-write contract** (story #403) — the
 * skill-side half of #402's adapter work.
 *
 * #402 fixed the MECHANICS in the PM-tool adapters (membership branch, assignee
 * recipes). What it left open is the CONTRACT in the skills that reach them:
 * `assignee` appeared zero times in `/write-issue`'s SKILL.md, so a caller had no
 * way to pass one; the board write assumed a field existed to write; and
 * `/publish-pr` opened PRs (#404, #405, #406, #408 — verified live) with no
 * assignee at all, #406 also without its story's `risk:*` labels.
 *
 * THE GOVERNING FACT, verified three times on the real tracker (2026-08-04):
 * `gh project item-add` exits 0 WITHOUT creating the item — a second, identical
 * invocation created it. So the invariant this file guards is not "call the add
 * before the state write"; it is:
 *
 *   NO WRITE IS ASSUMED — EVERY WRITE IS RE-READ BACK.
 *
 * A write whose effect cannot be confirmed by a read is a failure or a finding,
 * never a silent success. That rule is what stops the defect CLASS (#384 and
 * #372 sat off the board while looking green); the individual ordering fix only
 * stops one instance of it.
 *
 * CROSS-CUTTING BY CONSTRUCTION, hence its own file rather than an extension of
 * an existing per-artifact one — the explicit exception in
 * `decision-log/2026-07-18-conformance-test-per-file-not-per-story.md`. The
 * invariant spans four artifacts that must agree: two skills (`/write-issue`,
 * `/publish-pr`), the resolution convention that owns the schema, and the
 * way-of-working files that declare the field. A cascade implemented in one
 * skill and not the other reproduces exactly the half-applied state this story
 * exists to remove, so the two are asserted side by side.
 *
 * BOTH CORPORA. Every skill/KB claim is asserted on the dataset (the authoring
 * source of truth) AND on the generated root mirror an installed project
 * actually reads. Byte-equality of the two is a separate guard (#352); here we
 * only assert the claim survived the copy.
 */

const DATASET = join(__dirname, '../../dataset')
const REPO_ROOT = join(__dirname, '../../../..')

const read = (path: string): string => readFileSync(path, 'utf-8')

/**
 * The same normalization the sibling adapter-contract guard uses: strip markdown
 * emphasis and code spans, collapse whitespace, lowercase.
 *
 * Without it, an assertion requiring two adjacent words goes vacuously green the
 * moment prose puts a `code span` or **bold** marker between them. Every claim
 * below is matched against normalized text, and every one was injection-tested
 * by deleting the claim from BOTH corpora and confirming the assertion reddens.
 */
function normalize(markdown: string): string {
  return markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
}

/**
 * A skill's two on-disk copies: the dataset source and the installed mirror.
 *
 * The mirror renames the skill (`write-issue` → `pair-capability-write-issue`)
 * and rewrites every `/command` reference, so NO assertion here may spell a
 * skill name — the claims are pinned on prose that is identical in both copies.
 * That constraint is deliberate: it also keeps the guard from going green on a
 * mere name mention instead of the rule.
 */
function skillCorpora(
  category: string,
  name: string,
): { skill: string; corpus: string; content: string }[] {
  return [
    {
      skill: name,
      corpus: 'dataset',
      content: read(join(DATASET, `.skills/${category}/${name}/SKILL.md`)),
    },
    {
      skill: name,
      corpus: 'generated root',
      content: read(join(REPO_ROOT, `.claude/skills/pair-${category}-${name}/SKILL.md`)),
    },
  ]
}

const writeIssueCases = skillCorpora('capability', 'write-issue')
const publishPrCases = skillCorpora('capability', 'publish-pr')
const setupPmCases = skillCorpora('capability', 'setup-pm')
const implementCases = skillCorpora('process', 'implement')

const ROUTING_CONVENTION =
  '.pair/knowledge/guidelines/technical-standards/ai-development/skill-conventions/way-of-working-pm-resolution.md'
const WOW = '.pair/adoption/tech/way-of-working.md'
/**
 * The KB authority on state writes — the document `/write-issue` Step 6 and Step 7b point
 * at for state resolution, i.e. the file an agent reaches when it needs to know HOW a
 * transition is written. It is in the corpora for the same reason the two skills are: a
 * rule stated in the skills and contradicted here is not one rule, and the contradiction
 * wins wherever the reader lands first.
 */
const CANONICAL_STATES =
  '.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md'
/**
 * The ADL is the decision of record for this contract — the artifact a maintainer reads to
 * reconstruct WHY the skills are shaped this way. Root-only by construction:
 * `.pair/adoption/**` is user-owned (registry behavior `add`), so there is no dataset copy
 * to mirror.
 */
const NO_WRITE_IS_ASSUMED_ADL = '.pair/adoption/decision-log/2026-08-11-no-write-is-assumed.md'

/**
 * ROUND 5. The PM-tool **adapter guides** — the tool-specific documents every skill in this
 * contract sends an agent to for the actual calls. Rounds 2-4 walked the rule down the
 * reference chain (skills → convention → canonical-states) and stopped one level short: the
 * adapter is the last document a reader lands on before typing a command, so a routing
 * instruction contradicted here wins over every file above it.
 */
const PM_TOOL_GUIDES = '.pair/knowledge/guidelines/collaboration/project-management-tool'
const GITHUB_ADAPTER = `${PM_TOOL_GUIDES}/github-implementation.md`
const ADAPTER_GUIDES = [
  GITHUB_ADAPTER,
  `${PM_TOOL_GUIDES}/azure-devops-implementation.md`,
  `${PM_TOOL_GUIDES}/filesystem-implementation.md`,
  `${PM_TOOL_GUIDES}/linear-implementation.md`,
]

/** A KB file's two copies — the dataset source and the installed root mirror. */
const kbCorpora = (rel: string): { corpus: string; content: string }[] => [
  { corpus: 'dataset', content: read(join(DATASET, rel)) },
  { corpus: 'generated root', content: read(join(REPO_ROOT, rel)) },
]

const conventionCases = kbCorpora(ROUTING_CONVENTION)
const canonicalStatesCases = kbCorpora(CANONICAL_STATES)
const githubAdapterCases = kbCorpora(GITHUB_ADAPTER)
const adapterCases = ADAPTER_GUIDES.flatMap(rel =>
  kbCorpora(rel).map(one => ({ guide: rel.slice(rel.lastIndexOf('/') + 1), ...one })),
)

/**
 * The `/review` merge path's executing file. Its twin on the `/implement` side
 * (`post-review-merge.md` Step 4.4) already carries the invariant; both are asserted here so
 * the two merge paths cannot drift apart again.
 */
const reviewMergeCases = [
  {
    corpus: 'dataset',
    content: read(join(DATASET, '.skills/process/review/merge-and-cascade.md')),
  },
  {
    corpus: 'generated root',
    content: read(join(REPO_ROOT, '.claude/skills/pair-process-review/merge-and-cascade.md')),
  },
]

/**
 * The body of the section whose heading starts with `headingPrefix` at `level`,
 * up to the next heading of the same level or shallower.
 *
 * Scoped rather than whole-file on purpose: a claim asserted against the whole
 * document goes green when the sentence lands anywhere, including a section
 * where it means something else. Returns '' when the heading is absent, which
 * reddens every assertion built on it (no vacuous pass on a renamed heading).
 */
function section(markdown: string, headingPrefix: string, level = 3): string {
  const lines = markdown.split('\n')
  const hashes = '#'.repeat(level)
  const start = lines.findIndex(line => line.trimEnd().startsWith(`${hashes} ${headingPrefix}`))
  if (start === -1) return ''
  const stop = new RegExp(`^#{1,${level}} `)
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (stop.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

/** The normalized table rows of a section, header/separator rows included. */
const tableRows = (markdown: string, headingPrefix: string, level = 2): string[] =>
  section(markdown, headingPrefix, level)
    .split('\n')
    .filter(line => line.trimStart().startsWith('|'))
    .map(normalize)

/**
 * `canonical-states.md`'s `Integration with Skills` rows. Located by the macrostate each row
 * PRODUCES, never by skill name: the root mirror rewrites every name (`/implement` →
 * `/pair-process-implement`), so a name-anchored probe would only ever hold in one corpus.
 */
const integrationRows = (content: string): string[] => tableRows(content, 'Integration with Skills')

describe('/write-issue — $assignee is part of the parameter contract (#403 AC1)', () => {
  it.each(writeIssueCases)('$corpus: declares $$assignee in the Arguments table', ({ content }) => {
    // The literal defect: `assignee` appeared ZERO times in this file, so the
    // adoption's Assignment rule was unenforceable at the contract level.
    expect(content).toMatch(/^\|\s*`\$assignee`\s*\|/m)
  })

  it.each(writeIssueCases)(
    '$corpus: writes the assignee on the create AND the update path',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('as part of the create and of the update, never as a follow-up step')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: names the assignee in the field-configuration enumeration',
    ({ content }) => {
      // Step 7.2 delegated "project field settings (priority, type, status)" — an
      // enumeration that EXCLUDED the assignee, which is how the delegation to the
      // adapters (#402) never reached the assignee mechanic they document.
      //
      // `status` is NOT in the enumeration: the create call configures the item's own
      // fields, and the board state goes through Step 7b (membership → confirm →
      // state). Listing it here would contradict the two lines below it and license an
      // agent to write the state field on the create call — the exact defect.
      expect(normalize(content)).toContain('priority, type, assignee (status via step 7b)')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: states the assignee is ignored in comment mode',
    ({ content }) => {
      // Comment mode is the non-destructive path: it must stay byte-identical on the
      // item's body, labels AND assignee. Pinned on the exclusion SENTENCE, not on the
      // `$assignee` token: the token also appears in the Arguments table row, so a
      // token-level assertion stays green when the exclusion itself is deleted.
      const body = normalize(content)
      expect(body).toMatch(/in comment mode only \$id and \$comment are read/)
      expect(body).toContain('$labels, $assignee and $parent are ignored')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: routes comment mode past the two write-mode-only steps',
    ({ content }) => {
      // The routing enumeration an agent actually reads in Step 1.2. Steps 6b and 7b are
      // write-mode-only, so a stale enumeration here is how the original defect was born
      // (Step 7.2's enumeration excluded the assignee).
      expect(normalize(content)).toContain('steps 3, 4, 6, 6b and 7b do not run')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an update never reassigns an item away from its current assignee',
    ({ content }) => {
      // The adoption default must not overwrite a deliberate assignment on every
      // unrelated body update: that silently pulls the item out of the assignee-filtered
      // view of whoever owns it — this story's failure mode, inverted. Only an explicit
      // `$assignee`, or an item with no assignee at all, may be written.
      const body = normalize(content)
      expect(body).toContain('leave the existing assignee untouched')
      expect(body).toContain('never clear one')
      // …and add-vs-replace stays the adapter's concern: exactly one of the four
      // documented adapters adds without replacing, so the skill may not generalize it.
      expect(body).toContain("is the adapter's concern")
    },
  )
})

describe('/write-issue — the assignee resolution cascade (#403 AC2, AC3)', () => {
  const cascadeSection = (content: string): string =>
    normalize(section(content, 'Step 6b: Resolve the Assignee'))

  it.each(writeIssueCases)('$corpus: has a dedicated assignee-resolution step', ({ content }) => {
    expect(content).toMatch(/^### Step 6b: Resolve the Assignee/m)
  })

  it.each(writeIssueCases)('$corpus: states the cascade in one order (AC2)', ({ content }) => {
    expect(cascadeSection(content)).toContain(
      'the argument first, then the adoption default, then none',
    )
  })

  it.each(writeIssueCases)(
    '$corpus: resolves the default from the adoption field',
    ({ content }) => {
      const body = cascadeSection(content)
      expect(body).toContain('default-assignee')
      expect(body).toContain('assignment')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an unresolvable assignee warns and still writes the item (AC3)',
    ({ content }) => {
      const body = cascadeSection(content)
      expect(body).toContain('write the item without an assignee and warn')
      // The failure mode is invisibility, and refusing to file the item would be a
      // WORSE outcome than filing it unassigned — so this branch must never HALT.
      expect(body).toContain('never a halt')
      expect(body).toContain('invisible in an assignee-filtered view')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: never defaults the assignee to the authenticated user',
    ({ content }) => {
      // The bot-token case: "whoever is running the command" is right only for a solo
      // maintainer, and assigns every item to the bot the moment an agent runs under
      // one — satisfying the letter of the Assignment rule while defeating its purpose.
      const body = cascadeSection(content)
      expect(body).toContain('never the authenticated user')
      expect(body).toContain('bot token')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an empty adoption field is treated as absent',
    ({ content }) => {
      expect(cascadeSection(content)).toContain(
        'an empty value is absent, not an empty-string assignee',
      )
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an assignee the tool rejects is reported, never silently dropped',
    ({ content }) => {
      const body = cascadeSection(content)
      // Same wording as the adapters (#402), so the skill and the guides read as one rule.
      expect(body).toContain('never drop it silently')
      // …and a bookkeeping field must not sink the item.
      expect(body).toContain('never sinks the item')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: leaves the per-tool mechanic to the adapter',
    ({ content }) => {
      // One rule here, every mechanic in its adapter — the field/flag that actually
      // sets the assignee is the implementation guide's, never invented in the skill.
      // No adapter COUNT is asserted (or stated in the prose): a number goes stale the
      // moment a tracker is added, and the PM-tool README rejects counting for that
      // reason.
      expect(cascadeSection(content)).toContain('never invent')
    },
  )
})

describe('/write-issue — membership precedes state, confirmed by a read (#403 AC4, AC5)', () => {
  const boardSection = (content: string): string =>
    normalize(section(content, 'Step 7b: Board Membership'))

  it.each(writeIssueCases)('$corpus: has a dedicated board-write step', ({ content }) => {
    expect(content).toMatch(/^### Step 7b: Board Membership/m)
  })

  it.each(writeIssueCases)(
    '$corpus: membership is established on every write-mode write — create AND update',
    ({ content }) => {
      // Gating membership behind `$status` leaves the MOST COMMON path uncovered: an
      // item filed with no requested transition (a follow-up task, a promoted tech-debt
      // finding, a story planned ahead of its sprint) is created on an
      // explicit-membership tool as an issue that is not a board item — open, assigned,
      // green and absent from the board. That is #384/#372 verbatim, so the membership
      // beats must not depend on a macrostate having been requested.
      //
      // ROUND 5: scoping them to CREATES leaves the same hole one door down. The defect
      // reproduces on an UPDATE — `/refine-story` writes Draft→Ready on an issue that
      // already exists and may never have been added to the tracked view, and an update
      // with no `$status` (the #384/#372 repair path itself) never establishes membership
      // either. AC4/AC5's Given is not create-scoped, so neither is the rule.
      const body = boardSection(content)
      expect(body).toContain('membership is not a consequence of $status')
      expect(body).toContain('run on every write-mode write')
      expect(body).toContain('always on a create')
      expect(body).toContain('equally on an update')
      // …and the state field stays gated on Step 6, which is the half that IS conditional.
      expect(body).toContain('only when step 6 resolved a board state')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: the update path itself sends the reader to the membership step',
    ({ content }) => {
      // The preamble above is only reached by someone who already opened Step 7b. An
      // agent following the UPDATE path in Step 7 reads its bullets and stops there, so
      // the update bullet — which said only "if `$status` was provided, the board field
      // is written in Step 7b" — is where membership went missing in practice.
      const body = normalize(section(content, 'Step 7: Create or Update Issue'))
      expect(body).toContain('step 7b runs on every update too')
      expect(body).toContain('not only when $status was provided')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: reports confirmed membership even when no state was written',
    ({ content }) => {
      // Without its own value on the `Board:` row, membership has nowhere to be
      // reported when no state is written, and the row conflates presence with state —
      // the create path would render `n-a` on an item that WAS put on the board.
      expect(normalize(content)).toContain('no state written (no $status)')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: states the invariant once, tool-agnostically',
    ({ content }) => {
      // Stated in the SKILL (this story's half); the per-tool mechanics stay in the
      // adapters (#402's half) — one invariant, every mechanic in its adapter, no
      // restatement and no adapter count.
      const body = normalize(content)
      expect(body).toContain('membership precedes state')
      expect(body).toContain('the mechanics stay in the adapters')
    },
  )

  it.each(writeIssueCases)('$corpus: pins the three-beat order (AC4)', ({ content }) => {
    expect(boardSection(content)).toContain(
      'membership, then a read that confirms it, then the state field',
    )
  })

  it.each(writeIssueCases)(
    '$corpus: the membership beat precedes the state-field beat structurally',
    ({ content }) => {
      // Prose that merely MENTIONS both in one section would satisfy the phrase pin
      // above. This asserts the actual ordering inside the step, the same structural
      // discipline the adapter guard applies to github's Step 2b vs Step 3.
      const body = normalize(section(content, 'Step 7b: Board Membership'))
      const addMembership = body.indexOf('add the membership')
      const writeState = body.indexOf('write the state field')
      expect(addMembership).toBeGreaterThan(-1)
      expect(writeState).toBeGreaterThan(addMembership)
    },
  )

  it.each(writeIssueCases)(
    '$corpus: the add re-reads because exit 0 is not evidence (AC4)',
    ({ content }) => {
      // THE observed defect, three times on the real tracker: `gh project item-add`
      // exited 0 and produced no item; a second identical invocation created it.
      const body = boardSection(content)
      expect(body).toContain('exit status is not evidence')
      expect(body).toContain('re-read')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: an unconfirmable membership HALTs with the reason (AC5)',
    ({ content }) => {
      const body = boardSection(content)
      expect(body).toContain('halt')
      // The specific reason, not a generic failure — and never laundered into success.
      expect(body).toContain('could not be confirmed')
      expect(body).toContain('never reported as success')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: the state field is read back and the observed value reported',
    ({ content }) => {
      const body = boardSection(content)
      expect(body).toContain('read the field back')
      expect(body).toContain('a read-back that does not match the target is a failure')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: lists the membership HALT in HALT Conditions',
    ({ content }) => {
      expect(normalize(section(content, 'HALT Conditions', 2))).toContain(
        'membership could not be confirmed',
      )
    },
  )
})

describe('/write-issue — a board that cannot express the macrostate (#403 AC6)', () => {
  it.each(writeIssueCases)(
    '$corpus: distinguishes the documented skip from the HALT',
    ({ content }) => {
      // AC6 vs the pre-existing Step 6 HALT: an explicitly requested `$status` that no
      // board state can express still HALTs (route (c) in canonical-states.md — doing
      // nothing quietly is the silent success this story removes), while a board that
      // simply has no such state is the D4 minimal-board path where the caller omits
      // `$status`. Conflating the two is what makes one of them wrong, so the skill
      // must say which is which.
      const body = normalize(content)
      expect(body).toContain('two different outcomes, deliberately')
      expect(body).toContain('skipped as documented behaviour, not an error')
      expect(body).toContain('readiness falls back to the item body')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: puts the omit-$$status duty on the caller, where it is honourable',
    ({ content }) => {
      // The skip is only reachable if the CALLER omits `$status`: once it arrives here it
      // has been requested, and an unmappable request can only HALT. Stated in the
      // Composition Interface because the composing caller is the one that must act.
      expect(normalize(content)).toContain("omitting is the caller's job, not this skill's")
    },
  )
})

describe('/write-issue — the report is what a read observed (#403 AC8)', () => {
  it.each(writeIssueCases)(
    '$corpus: reports the labels and the assignee a read confirmed',
    ({ content }) => {
      // Steps 7.2/7.4 re-read the labels; without a row for them an observed divergence
      // (a label the tracker dropped) has nowhere to be reported, and "report what the
      // read observed" is unfulfillable for labels. `/publish-pr` carries the twin row
      // (`Tags:`) — the two writers stay symmetric on one invariant.
      expect(content).toMatch(/├── Labels:/)
      expect(content).toMatch(/├── Assignee:/)
      expect(normalize(content)).toContain('dropped by tracker: label — finding')
    },
  )

  it.each(writeIssueCases)('$corpus: the board row is a read, not a claim', ({ content }) => {
    expect(content).toMatch(/├── Board:.*confirmed by read/)
  })

  it.each(writeIssueCases)(
    '$corpus: the worked example renders the mandatory rows',
    ({ content }) => {
      // An agent pattern-matches the concrete example far more readily than it
      // reconstructs the schema, so an example missing the rows teaches the old shape.
      const example = normalize(section(content, 'Example: Creating a Task Issue', 2))
      expect(example).toContain('├── labels:')
      expect(example).toContain('├── assignee:')
      expect(example).toContain('├── board:')
      // The example is a create with no `$status` on an explicit-membership tool, i.e.
      // exactly the path that used to end `n-a` on an off-board item. It must now show
      // the membership the create established.
      expect(example).toContain('no state written (no $status)')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: the posted comment is confirmed by a read too (AC8 is universal)',
    ({ content }) => {
      // Comment mode is a write path like any other: `gh issue comment` exiting 0 is not
      // evidence a comment exists, and the skill would otherwise report `Commented` on a
      // call that posted nothing — the same claim the invariant forbids everywhere else.
      const body = normalize(section(content, 'Step 7c: Post a Comment', 3))
      expect(body).toContain("read the item's comments back")
      expect(body).toContain('never as commented')
    },
  )
})

describe('post-review-merge Step 4.4 — the terminal state writes obey the same two rules', () => {
  // Step 4.4 writes THREE states directly (story, parent epic, parent initiative) and its
  // Verify used to read "Story and parent hierarchy updated recursively" — i.e. it trusted
  // the calls. The same `gh project item-*` class of call reproduced three times exiting 0
  // with no effect, so a merged story could be reported Done while the board still showed
  // In Progress. Worse than Step 0.1b: nobody re-runs the merge phase, so it is terminal.
  // skillCorpora reads a skill's SKILL.md; this rule lives in a SUB-DOCUMENT, so the pair
  // is built explicitly. Reading SKILL.md instead would have passed vacuously — Step 0.1b
  // carries the same by-reference sentence, so the assertion would have been satisfied by
  // the wrong file.
  const mergeCases = [
    {
      corpus: 'dataset',
      content: read(join(DATASET, '.skills/process/implement/post-review-merge.md')),
    },
    {
      corpus: 'generated root',
      content: read(join(REPO_ROOT, '.claude/skills/pair-process-implement/post-review-merge.md')),
    },
  ]

  it.each(mergeCases)(
    '$corpus: applies membership -> confirming read -> state by reference',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('membership, then a read that confirms it, then the state field')
      expect(body).toContain('by reference')
    },
  )

  it.each(mergeCases)(
    '$corpus: verifies by READING, and says why it is terminal',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('what the read observed')
      expect(body).toContain('nobody re-runs the merge phase')
      // The trusting wording must be gone, not merely accompanied.
      expect(body).not.toContain('story and parent hierarchy updated recursively')
    },
  )
})

describe('/publish-pr — the board state is written directly, never by composing write mode', () => {
  // Maintainer decision, 2026-08-12. This PR shipped two contracts for one operation:
  // step 7 said the board state was written by composing the item writer in DEFAULT WRITE
  // MODE, while /implement Step 0.1b and ADL decision 11 — in the same diff — said that is
  // never the route for a state-only change, because write mode is a full-body overwrite
  // and would replace the story's AC/DoD/task breakdown. An agent following step 7 either
  // HALTed on the missing $type (rendering `Board: not updated` on every publish, a
  // permanent failure dressed as a documented skip) or destroyed the body.
  //
  // Resolved in favour of the rule the PR already stated twice: publish-pr writes the state
  // directly, applying membership -> confirming read -> state field BY REFERENCE.
  it.each(publishPrCases)(
    '$corpus: step 7 applies the invariant by reference and does not compose write mode',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('by reference')
      expect(body).toContain('membership, then a read that confirms it, then the state field')
      // The losing shape must be gone, not merely outnumbered. (The negative probes
      // themselves live in the cross-file guard below — one shape, both files.)
      // ...and gone from the WHOLE step, not merely from its lead sentence. The first
      // version of this guard checked only the two phrases above and passed while the
      // bullets underneath still read "compose with $status: Review", "the composed
      // skill's documented skip" and "The composition carries its invariant with it" —
      // certifying a half-fix as complete. A guard that reads one sentence of a step
      // cannot speak for the step.
      expect(body).not.toContain('compose with $status: review')
      // The direct write takes no `$status` at all, so no instruction in this file may
      // tell its reader to omit one — an omitted parameter only makes sense to a caller
      // that is composing, which this skill no longer is for the board field.
      expect(body).not.toContain('omit $status')
      // NOTE: two further probes were drafted here — "the composed skill's documented
      // skip" and "the composition carries" — and REMOVED after checking that neither can
      // ever match the normalized text (normalize strips ` * _, so the on-disk phrasing
      // does not survive as written). An assertion that cannot fail is worse than none: it
      // is counted as coverage. The probes that survived live in the cross-file guard
      // below and were verified RED by injection.
    },
  )

  // ONE RULE, BOTH CALLERS. The negative probes above were applied to the PR publisher
  // only, so the losing shape survived in the OTHER file: the item writer's Composition
  // Interface still told its reader that "the board write (default write mode) is the
  // second composition" — the exact route this same change classifies as body-destroying.
  // A rule policed in one of the two files that state it is not policed at all, which is
  // the divergence this story exists to remove. Every probe therefore runs on BOTH.
  it.each([...writeIssueCases, ...publishPrCases])(
    '$skill ($corpus): never describes the board state as a write-mode composition',
    ({ content }) => {
      const body = normalize(content)
      expect(body).not.toContain('default write mode for the board state')
      // Backticks do not survive normalize(), so the pattern must not spell them — the
      // first draft of this regex did, and could never match anything.
      expect(body).not.toMatch(/board state[^.]{0,80}using \/[a-z-]*write-issue/)
      expect(body).not.toMatch(/board write[^.]{0,40}\(default write mode\)/)
      expect(body).not.toContain('is the second composition')
      expect(body).not.toContain('compose with $status: review')
      // No caller "omits `$status`" on the board path any more: the direct write has no
      // such parameter to omit, and telling a reader to omit one points back at the
      // composition route.
      expect(body).not.toContain('omit $status from the step-7 composition')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: the composition interface states the PR publisher writes the board field itself',
    ({ content }) => {
      // Not merely "the losing sentence is gone": the interface must say what the caller
      // ACTUALLY does, or the next reader re-derives the composition from its absence.
      const body = normalize(section(content, 'Composition Interface', 2))
      expect(body).toContain('writes the board field directly')
      expect(body).toContain('applying step 7b by reference')
      // The still-valid $status caller keeps the rationale (refinement passes $status and
      // renders a full body in the same call, so write mode is the right route for it).
      expect(body).toContain("omitting is the caller's job, not this skill's")
    },
  )

  it.each(publishPrCases)(
    '$corpus: the degradation section does not resurrect the skipped board write',
    ({ content }) => {
      // The step and the Composed Skills table were corrected first; the GRACEFUL
      // DEGRADATION section was not, and still read "not installed: skip the board-state
      // update, warn, leave the PR ready". That section is precisely what an agent reads
      // when something is missing, so on any project without the item writer installed the
      // board write was skipped whole — no membership beat, no confirming read, no state
      // field — and the story shipped green, PR-ready and OFF the board: #384/#372
      // verbatim, re-introduced by the skill's own degradation contract.
      //
      // The absence of the item writer can only affect the ONE composition that remains
      // (the Phase 4 step 5 back-link comment). The board write is direct.
      const body = normalize(section(content, 'Graceful Degradation', 2))
      expect(body).not.toContain('not installed: skip the board-state update')
      expect(body).toContain('the board write in step 7 is unaffected')
      expect(body).toContain('still runs in full')
      // The board write cannot HALT "as a composition" either — the reason belongs to this
      // skill's own direct write, applying the item writer's beats by reference.
      expect(body).toContain('the direct board write cannot complete')
    },
  )
})

describe('/publish-pr — BOTH back-link mechanisms confirm the post by a read (#403 AC8)', () => {
  // ROUND 8. Phase 4 step 5 documents TWO mechanisms for the same write, and only one was
  // inside AC8's invariant (every write a tool can report as successful without effect is
  // re-read). The composed path (`$mode: comment`) confirms by reading the item's comments
  // back and degrades to `Comment warned` (item writer, Step 7c Verify). The fallback —
  // "not installed → write the comment directly through the PM tool's implementation guide"
  // — declared no read at all.
  //
  // Reachable, not theoretical: a split-tool project (Linear backlog + GitHub code host)
  // that does not install the item writer publishes the PR, posts the back-link with a
  // comment API that exits 0 having created nothing, and reports
  // `Cross-link: Refs: <id> + PR URL posted on <item>` — an unconfirmed claim about the ONLY
  // link from the board to the PR, i.e. the "reported as done, never confirmed" class this
  // whole story exists to close.
  //
  // Scoped to the step, so the assertions cannot be satisfied by the read-back sentences
  // that live elsewhere in this file (the PR re-read in step 3, ready-for-review in step 6,
  // the status/label reads in Phase 5).
  const backLinkStep = (content: string): string => {
    const phase = section(content, 'Phase 4', 3).split('\n')
    const start = phase.findIndex(line => /^5\. /.test(line))
    if (start === -1) return ''
    const body: string[] = []
    for (const line of phase.slice(start + 1)) {
      if (/^6\. /.test(line)) break
      body.push(line)
    }
    return body.join('\n')
  }

  /**
   * The fallback bullet alone. Asserting against the whole step would go green on the
   * COMPOSED branch's read-back — which is the divergence, not the fix.
   */
  const directBranch = (content: string): string => {
    const lines = backLinkStep(content).split('\n')
    const start = lines.findIndex(line => /^\s*- \*\*not installed\*\*/.test(line))
    if (start === -1) return ''
    const body: string[] = [lines[start]]
    for (const line of lines.slice(start + 1)) {
      if (line.trim() === '' || /^\s*- \*\*/.test(line)) break
      body.push(line)
    }
    return normalize(body.join('\n'))
  }

  it.each(publishPrCases)(
    '$corpus: the direct back-link post is read back, in the same words as the composed path',
    ({ content }) => {
      const branch = directBranch(content)
      // Non-vacuity: the bullet must exist at all, or every assertion below is empty-string
      // theatre.
      expect(branch).toContain('not installed')
      expect(branch).toContain("read the item's comments back")
      // The `filesystem` tool's comments ARE a body section, so the read has to name it —
      // otherwise "read the comments back" has no referent on the one tool where the item
      // is a file.
      expect(branch).toContain('activity log')
    },
  )

  it.each(publishPrCases)(
    '$corpus: an unconfirmed direct post is reported failed, never as posted',
    ({ content }) => {
      const branch = directBranch(content)
      // The exact string the output shape already offers on the `Cross-link:` row — so the
      // failure has a rendering and does not degrade into prose.
      expect(branch).toContain('back-link failed — manual link needed')
      expect(branch).toContain('never as posted')
    },
  )

  it.each(publishPrCases)(
    '$corpus: both mechanisms of the step declare their confirming read (anti-divergence)',
    ({ content }) => {
      // One assertion reading BOTH branches, so the two cannot drift apart again: whichever
      // branch loses its read-back reddens this.
      const step = backLinkStep(content)
      expect(step).not.toBe('')
      const body = normalize(step)
      expect(body).toContain("confirms the post by reading the item's comments back")
      expect(body).toContain("read the item's comments back")
    },
  )

  it.each(publishPrCases)(
    '$corpus: the degradation bullet for a missing item writer says the same',
    ({ content }) => {
      // The degradation section is what an agent reads when the composition is absent —
      // i.e. exactly the run that takes the direct branch. Silent here = silent where it
      // matters most.
      const body = normalize(section(content, 'Graceful Degradation', 2))
      expect(body).toMatch(/not installed:[^.]*comment-mode back-link/)
      expect(body).toContain("read the item's comments back to confirm it")
      expect(body).toContain('never as posted')
    },
  )

  it.each(publishPrCases)(
    '$corpus: the Composed Skills row states the direct back-link is read back too',
    ({ content }) => {
      // Third place a reader lands on the fallback (the composition table is read BEFORE
      // the phase that uses it). Rounds 3-5 were all one rule left standing in the file the
      // fix did not open; the row is cheap to align and cheaper to probe.
      const row = tableRows(content, 'Composed Skills').find(line =>
        line.includes('back-link written directly'),
      )
      expect(row).toBeDefined()
      expect(row).toContain('and read back to confirm it')
    },
  )
})

describe('canonical-states.md — the KB authority agrees with the skills that write state', () => {
  // ROUND 4. Rounds 2 and 3 removed the write-mode composition from the two SKILLS, and
  // every probe was scoped to skill corpora plus the resolution convention. The losing
  // shape therefore survived in the file the skills DEFER TO: this document's `Integration
  // with Skills` table still said `/implement` "writes through /write-issue" for
  // `In Progress`/`Review` and `/review` the same for `Done` on merge.
  //
  // Reachable, not theoretical: Step 6 and Step 7b point an agent HERE to resolve a state,
  // so an agent following this table for a state-only change composes write mode with no
  // `$content`/`$type` and either HALTs on the missing `$type` (rendering `Board: not
  // updated` on every transition — a permanent failure dressed as a documented skip) or
  // overwrites the story body, destroying AC/DoD/task breakdown. That is the exact route
  // the rest of this file forbids, reproduced in the KB.
  //
  // The rows are located by the macrostate they PRODUCE, never by skill name (see
  // `integrationRows` at the top of this file).
  it.each(canonicalStatesCases)(
    '$corpus: the state-only writers write the board field directly, applying Step 7b by reference',
    ({ content }) => {
      const rows = integrationRows(content)
      const directWriters = rows.filter(
        row =>
          row.includes('produces in progress / review') || row.includes('produces done on merge'),
      )
      // Both rows must be FOUND — otherwise a renamed/removed row would let the negative
      // assertions below pass over an empty list.
      expect(directWriters).toHaveLength(2)
      for (const row of directWriters) {
        expect(row).toContain('writes the board field directly')
        expect(row).toContain('by reference')
        // No routing through the item writer for a state-only change. Matched on
        // `through /` rather than a skill name so it holds in both corpora and catches
        // any writer being put in front of the board field.
        expect(row).not.toContain('through /')
      }
    },
  )

  it.each(canonicalStatesCases)(
    '$corpus: the refinement row still routes through the item writer (the valid composition)',
    ({ content }) => {
      // The one row that must NOT change: refinement does pass `$status` and does render a
      // full body in the same call, so write mode is the right route for it. A fix that
      // flattened all three rows to "direct" would be a different defect.
      const refinement = integrationRows(content).filter(row => row.includes('produces ready'))
      expect(refinement).toHaveLength(1)
      expect(refinement[0]).toContain('writes it through /')
    },
  )
})

describe('the PM-tool adapter guides — the last document before the command agrees too', () => {
  // ROUND 5. Rounds 2-4 fixed the two skills, then the resolution convention, then
  // canonical-states.md — the reference chain, one link per round. The chain has one more
  // link: the TOOL-SPECIFIC ADAPTER, which is where `/implement` Step 0.1b and
  // `/write-issue` Step 7b send an agent for the actual call. github-implementation.md's
  // `Common Transitions` table still said `Refined → In Progress` is triggered "via
  // `/write-issue $status: In Progress`" — i.e. the write-mode route for a STATE-ONLY
  // change, which either HALTs on the missing `$type` or overwrites the story body
  // (AC/DoD/task breakdown). The adapter is the last thing read before a command is typed,
  // so it wins over every corrected file above it.
  //
  // Rows are matched by the transition they describe, never by skill name — the root mirror
  // rewrites every name, so a name-anchored probe would hold in one corpus only.
  const transitionRows = (content: string): string[] =>
    tableRows(content, 'Common Transitions', 4).filter(row => row.includes('→'))

  /** Every table row in a guide that reads like a transition, wherever it lives. */
  const transitionLikeRows = (content: string): string[] =>
    content
      .split('\n')
      .filter(line => line.trimStart().startsWith('|'))
      .map(normalize)
      .filter(row => row.includes('→'))

  it.each(githubAdapterCases)(
    '$corpus: the state-only transitions do not route through the item writer',
    ({ content }) => {
      const stateOnly = transitionRows(content).filter(
        row => row.includes('→ in progress') || row.includes('→ done'),
      )
      // Both rows must be FOUND, or a renamed heading would let the negatives below pass
      // over an empty list — the vacuous-green failure this file rejects everywhere else.
      expect(stateOnly).toHaveLength(2)
      for (const row of stateOnly) {
        // A state-only change carries no body to render, so no `$status` argument may
        // appear on its route: `$status` only exists on the item writer's write mode.
        expect(row).not.toContain('$status')
      }
    },
  )

  it.each(githubAdapterCases)(
    '$corpus: the implementation transition states the direct write and applies Step 7b by reference',
    ({ content }) => {
      // Not merely "the losing route is gone": the row must say what the writer ACTUALLY
      // does, or the next reader re-derives the composition from its absence.
      const implementation = transitionRows(content).filter(row =>
        row.includes('refined → in progress'),
      )
      expect(implementation).toHaveLength(1)
      expect(implementation[0]).toContain('writes the board field directly')
      expect(implementation[0]).toContain('by reference')
    },
  )

  it.each(githubAdapterCases)(
    '$corpus: the refinement transition still routes through the item writer (the valid composition)',
    ({ content }) => {
      // The row that must NOT change. Refinement passes `$status` AND renders a full body
      // in the same call, so write mode is the right route for it — a fix that flattened
      // every row to "direct" would be a different defect, and this pins it as one.
      const refinement = transitionRows(content).filter(row => row.includes('todo → refined'))
      expect(refinement).toHaveLength(1)
      expect(refinement[0]).toContain('$status: ready')
    },
  )

  it.each(adapterCases)(
    '$guide ($corpus): no transition row routes a state-only change through the item writer',
    ({ content }) => {
      // The CLASS probe, over every adapter rather than the one that had the defect: the
      // next tracker's guide is written by copying this table, and the round-5 finding is
      // exactly what a copy of the old one would reintroduce.
      for (const row of transitionLikeRows(content)) {
        if (/→ (in progress|review|done)\b/.test(row)) expect(row).not.toContain('$status')
      }
    },
  )

  it('the class probe is not vacuous — some adapter still documents its transition routing', () => {
    // A `for` loop over an empty list passes. If the tables are renamed or removed, this is
    // the assertion that reddens instead of the guard silently covering nothing.
    const rows = adapterCases.reduce((n, one) => n + transitionLikeRows(one.content).length, 0)
    expect(rows).toBeGreaterThan(0)
  })
})

describe('merge-and-cascade Step 6.4 — the review merge path carries the invariant it claims', () => {
  // ROUND 5, third finding, and the one this PR introduced itself: round 4 rewrote
  // canonical-states.md's `/review` row to "produces Done on merge — writes the board field
  // directly, same application of Step 7b by reference", but the file that EXECUTES that row
  // (merge-and-cascade.md Step 6.4) only closed the issue and cascaded the parents — no board
  // field, no membership → confirming read → state order, no read-back in its Verify.
  //
  // Closing an issue is not a board transition: on GitHub Projects the item keeps whatever
  // column it had, so the story reported Done sat in `In Progress` on the board. The twin
  // path (`/implement`'s post-review-merge.md Step 4.4) was already brought under the rule,
  // so the two merge paths had diverged — and terminal writes are the worst place for it:
  // nobody re-runs the merge phase.
  it.each(reviewMergeCases)(
    '$corpus: applies membership -> confirming read -> state by reference',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('membership, then a read that confirms it, then the state field')
      expect(body).toContain('by reference')
    },
  )

  it.each(reviewMergeCases)(
    '$corpus: the closure and the board state are two writes, not one',
    ({ content }) => {
      // The defect's root assumption. Both merge paths must say it, or an agent reads the
      // close call as the state transition and skips the board write entirely.
      const body = normalize(content)
      expect(body).toContain('closing the issue does not move the board column')
    },
  )

  it.each(reviewMergeCases)(
    '$corpus: verifies by READING the story and each transitioned parent',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('what the read observed')
      expect(body).toContain('nobody re-runs the merge phase')
      expect(body).toContain('each parent this run transitioned')
      // The trusting wording must be gone, not merely accompanied.
      expect(body).not.toContain('story closed. epic and initiative updated if applicable.')
    },
  )

  it.each(canonicalStatesCases)(
    '$corpus: the KB row and the file that executes it cannot diverge',
    ({ content }) => {
      // The anti-divergence probe the previous four rounds lacked: a claim in the KB is
      // asserted AGAINST the executing file, not on its own. If the Done row keeps claiming
      // a direct board write, merge-and-cascade.md must carry it; if the design ever changes
      // to "closure IS the Done signal", this row has to say so and this probe reddens until
      // it does.
      const doneRow = integrationRows(content).find(row => row.includes('produces done on merge'))
      expect(doneRow).toBeDefined()
      expect(doneRow).toContain('writes the board field directly')
      for (const { content: executor } of reviewMergeCases) {
        const body = normalize(executor)
        expect(body).toContain('membership, then a read that confirms it, then the state field')
        expect(body).toContain('by reference')
        expect(body).toContain('what the read observed')
      }
    },
  )
})

describe('the ADL — the decision of record describes the contract that shipped', () => {
  // ROUND 4, second half. The ADL is NEW in this PR, so it is not an append-only historical
  // record: decision 7 still described the composition rounds 2/3 removed ("resolves
  // `## State Mapping` before composing the board write and omits `$status`"), which the
  // shipped contract contradicts twice — the publisher writes the field directly, and there
  // is no `$status` parameter on the direct path to omit (this file even asserts
  // `not.toContain('omit $status from the step-7 composition')` for that reason). It also
  // contradicted its OWN decision 11 two paragraphs later. The highest-authority document
  // was the last place the losing shape survived.
  const adl = read(join(REPO_ROOT, NO_WRITE_IS_ASSUMED_ADL))

  /** One numbered decision item from `## Decision`, normalized; '' when absent (reddens). */
  const decision = (n: number): string => {
    const lines = section(adl, 'Decision', 2).split('\n')
    const start = lines.findIndex(line => line.startsWith(`${n}. `))
    if (start === -1) return ''
    const after = lines.slice(start + 1)
    const stop = after.findIndex(line => /^\d+\. /.test(line))
    return normalize(
      (stop === -1 ? [lines[start], ...after] : [lines[start], ...after.slice(0, stop)]).join('\n'),
    )
  }

  it('decision 7 states the publisher resolves the mapping itself and writes no state field', () => {
    const seven = decision(7)
    expect(seven).toContain('resolves ## state mapping')
    expect(seven).toContain('writes no state field at all')
    // The membership beats are NOT skipped with the state field — the whole point of the
    // separation established in decision 8.
    expect(seven).toContain('membership is still established and confirmed')
    // The removed route, in the two shapes it was written in.
    expect(seven).not.toContain('before composing the board write')
    expect(seven).not.toContain('omits $status when no board state maps to')
  })

  it('decision 7 keeps the caller-omits-$status rule where it still holds', () => {
    // Deleting the rule would be as wrong as leaving it on the publisher: refinement is a
    // real composing caller, and the item writer's own text pins "omitting is the caller's
    // job, not this skill's".
    const seven = decision(7)
    expect(seven).toContain('refine-story')
    expect(seven).toContain('omitting $status')
  })

  it('decision 8 scopes membership to every write-mode write, not to creates', () => {
    // ROUND 7. Decision 15 widened membership from creates to every write-mode write and
    // Step 7b shipped that wording — but decision 8, eight lines earlier and the item
    // *titled* "Membership does not depend on `$status`", still said the beats run "on
    // every create". A maintainer reconstructing the rule from the record therefore landed
    // on the create-only scoping decision 15 exists to remove, i.e. the #384/#372 hole on
    // the UPDATE path (`/refine-story`'s `Draft → Ready` on a pre-board story, and the
    // no-`$status` off-board repair path). Same "one rule, two statements" defect this
    // round-4 block fixed for decision 7 — positive and negative, so it cannot come back.
    const eight = decision(8)
    expect(eight).toContain('every write-mode write')
    expect(eight).not.toContain('on every create')
    // The widening statement must still be there for the pair to mean anything, and the
    // two must say the same thing.
    expect(decision(15)).toContain('every write-mode write')
  })

  it('decision 17 puts the fallback back-link mechanism under the read-back rule', () => {
    // ROUND 8. Decision 10 claims the invariant is "universal inside these two skills";
    // the record must therefore carry the one place it was not — the fallback branch of
    // the back-link step — or the next reader re-derives "the composed path reads back"
    // as the whole rule, which is how the branch was written unguarded in the first place.
    const seventeen = decision(17)
    expect(seventeen).toContain('not installed')
    expect(seventeen).toContain("read the item's comments back")
    expect(seventeen).toContain('back-link failed — manual link needed')
    // Decision 10 is the statement being widened; it must still be there.
    expect(decision(10)).toContain('comment warned')
  })

  it('no decision in the ADL scopes the membership beats to creates', () => {
    // Whole-section sweep, so the create-only shape cannot move to a neighbouring decision
    // the way the composition shape moved from the caller to the callee to the KB.
    // Decision 15's "always on a create ... equally on an update" is the allowed wording.
    const decisions = normalize(section(adl, 'Decision', 2))
    expect(decisions).not.toContain('on every create')
    expect(decisions).toContain('equally on an update')
  })

  it('no decision in the ADL routes a state-only change through the item writer', () => {
    // Whole-section sweep, so the shape cannot move to a neighbouring decision.
    const decisions = normalize(section(adl, 'Decision', 2))
    expect(decisions).not.toContain('composing the board write')
    // Decision 11 is the statement of the rule; it must still be there for the sweep above
    // to mean anything.
    expect(decisions).toContain('write mode is a full-body overwrite')
  })
})

describe('/publish-pr — the PR carries an assignee and the story tags (#403 AC7)', () => {
  it.each(publishPrCases)('$corpus: declares $$assignee in the Arguments table', ({ content }) => {
    expect(content).toMatch(/^\|\s*`\$assignee`\s*\|/m)
  })

  it.each(publishPrCases)(
    '$corpus: resolves the assignee through the SAME cascade as the item writer',
    ({ content }) => {
      // One rule, two callers. The adoption rule names BOTH skills in one sentence;
      // applying it in one and not the other is exactly how this half went untracked
      // from 2026-07-31 until a review found it (PRs #404, #405, #406, #408 were all
      // born unassigned). A divergent second cascade here would re-create that state.
      const body = normalize(content)
      expect(body).toContain('the same cascade')
      expect(body).toContain('one rule, two callers')
    },
  )

  it.each(publishPrCases)(
    "$corpus: states that a pull request's author is not its assignee",
    ({ content }) => {
      // The precise mechanic that made PRs invisible: `gh pr create` sets the author,
      // and an assignee-filtered view reads `assignees`.
      expect(normalize(content)).toContain("a pull request's author is not its assignee")
    },
  )

  it.each(publishPrCases)(
    '$corpus: names the risk tags the tag propagation must carry',
    ({ content }) => {
      // #406 was published without its story's `risk:*` labels, which this skill's own
      // Phase 5 tier resolution depends on — so the gap cost a fail-safe-red tier, not
      // only board visibility.
      const body = normalize(content)
      expect(body).toContain('risk:')
      expect(body).toContain('fail-safe')
    },
  )

  it.each(publishPrCases)(
    '$corpus: re-reads the PR after writing it and reports the read (AC8)',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('re-read the pull request')
      expect(body).toContain('what the read returned')
    },
  )

  it.each(publishPrCases)(
    '$corpus: an unresolvable assignee never blocks the publish',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('never a halt')
      expect(body).toContain('invisible in an assignee-filtered view')
    },
  )

  it.each(publishPrCases)('$corpus: reports the assignee in its output shape', ({ content }) => {
    // The report is the only place a human sees the difference between "assigned"
    // and "assumed assigned", so the row is part of the contract, not decoration.
    expect(content).toMatch(/├── Assignee:/)
  })

  it.each(publishPrCases)(
    '$corpus: takes the code-host branch of the cascade (`code-host-assignee` first)',
    ({ content }) => {
      // A PR is a code-host write, and on a SPLIT project the same human carries two
      // logins: resolving the PM-tool one here gets it rejected by the host and the PR
      // is published unassigned — the very invisibility this story removes, on the one
      // path the story said the contract must not assume away. Without this branch the
      // schema key has no reader at all.
      const body = normalize(content)
      expect(body).toContain('code-host-assignee when declared, else default-assignee')
    },
  )

  it.each(publishPrCases)(
    '$corpus: an existing PR is never reassigned away from its current assignee',
    ({ content }) => {
      // The twin of the item writer's rule (its Step 7.3). The update path here is the
      // one the documented fix→re-publish loop runs on every round: applying the
      // adoption default unconditionally silently pulls a PR a maintainer reassigned to
      // the colleague who owns its review back to `default-assignee`, out of that
      // person's assignee-filtered view. Same invisibility, inverted — and a divergence
      // between the two callers is what "one rule, two callers" forbids.
      const body = normalize(content)
      expect(body).toContain('leave the existing assignee untouched')
      expect(body).toContain('never clear one')
    },
  )

  it.each([...writeIssueCases, ...publishPrCases])(
    '$skill/$corpus: reports an assignee left untouched as such',
    ({ content }) => {
      // "unchanged" is a distinct observation from "written": without the variant the
      // conditional write has no truthful rendering and the report claims a write that
      // deliberately did not happen.
      expect(normalize(content)).toContain('unchanged: login — confirmed by read')
    },
  )

  it.each(publishPrCases)(
    '$corpus: reads back the review check and the state label it publishes (AC8)',
    ({ content }) => {
      // Phase 5's two writes were exempt from the invariant the same file states as
      // universal: a status API that no-ops leaves `pair-review` claimed-but-absent
      // (merge NOT blocked while the report says it is), and a label API that no-ops
      // renders `pr-state:to-be-reviewed` on a PR carrying no such label.
      const body = normalize(content)
      expect(body).toContain('read the status back')
      expect(body).toContain("read the pr's labels back")
    },
  )

  it.each(publishPrCases)(
    '$corpus: reads the ready-for-review transition back where it is written',
    ({ content }) => {
      // `gh pr ready` is a write like any other under AC8, and the post-write read three
      // steps earlier could only ever show the pre-transition draft state. A PR left in
      // draft is unmergeable however green it looks.
      const body = normalize(content)
      expect(body).toContain('read the pr back and confirm it is no longer a draft')
      expect(body).toContain('ready-for-review not confirmed')
    },
  )
})

describe('/publish-pr — the board write it performs directly (#403 AC6)', () => {
  it.each(publishPrCases)(
    '$corpus: resolves the state mapping FIRST, and writes no state field when Review is unmapped',
    ({ content }) => {
      // The item writer's D4 skip is "no state field is written". A publisher that writes
      // `Review` unconditionally makes the skip unreachable: on a minimal board (this
      // project's own — no column maps to Review) it would either fail or write a wrong
      // column on every publish. AC6's "documented behaviour, not an error" only holds if
      // the direct writer resolves the mapping before it writes anything.
      // Phrased as a WRITE, not as an omitted `$status`: there is no parameter to omit on
      // the direct path, and saying otherwise points the reader back at the composition
      // route this contract removed.
      const body = normalize(content)
      expect(body).toContain('resolve ## state mapping first')
      expect(body).toContain('write no state field')
      expect(body).toContain('n-a — no review state on this board')
    },
  )

  it.each(publishPrCases)(
    '$corpus: surfaces a direct board HALT instead of absorbing it',
    ({ content }) => {
      // Phase 4 and Graceful Degradation covered only the membership HALT; a Step 6
      // macrostate HALT had nowhere to land, so it would have been reported as a green
      // publish — the silent success this whole contract exists to remove.
      const body = normalize(content)
      expect(body).toContain('unmappable requested macrostate')
      expect(body).toContain('never absorbed into a green publish')
    },
  )
})

describe('no write is assumed — every write is re-read back (#403 AC8)', () => {
  it.each([...writeIssueCases, ...publishPrCases])(
    '$skill/$corpus: both writers state the rule (no divergence between them)',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('no write is assumed')
      expect(body).toContain('every write is re-read back')
    },
  )

  it.each(writeIssueCases)('$corpus: states the rule as a general invariant', ({ content }) => {
    const body = normalize(content)
    expect(body).toContain('no write is assumed')
    expect(body).toContain('every write is re-read back')
    // The rule is what stops the defect class; the observed instance is the evidence.
    expect(body).toContain('exits 0 without creating the item')
  })

  it.each(writeIssueCases)(
    '$corpus: a write that cannot be confirmed is never a silent success',
    ({ content }) => {
      expect(normalize(content)).toContain(
        'a write that cannot be confirmed by a read is a failure or a finding, never a silent success',
      )
    },
  )
})

describe('the other PM-tool writers obey the same two rules (#403)', () => {
  it.each(implementCases)(
    '$corpus: story activation resolves the assignee by the cascade, not the current user',
    ({ content }) => {
      // Step 0.1b runs on EVERY story and wrote "assign to the current developer" — the
      // one default the cascade forbids, for the reason the cascade exists: an agent
      // under a bot token assigns every story to the bot and passes its own check.
      const body = normalize(section(content, 'Step 0.1b', 3))
      expect(body).toContain('only when it has no assignee')
      expect(body).toContain('never the authenticated user')
      expect(body).toContain('default-assignee')
    },
  )

  it.each(implementCases)(
    '$corpus: story activation writes the board state in the invariant order',
    ({ content }) => {
      // The same direct board write the invariant governs: an item that is not in the
      // tracked view has no state field to write, and the write is not evidence of
      // itself. Stated by reference (a status-only change cannot compose the item
      // writer, whose write mode overwrites the body).
      const body = normalize(section(content, 'Step 0.1b', 3))
      expect(body).toContain('membership, then a read that confirms it, then the state field')
      expect(body).toContain('what the read observed')
    },
  )

  it.each(setupPmCases)(
    '$corpus: the setup path writes the Assignment section it declares',
    ({ content }) => {
      // `default-assignee` is a declared key with no writer anywhere in setup: this skill
      // backfills `## Git Workflow` but never `## Assignment`, so a project configured
      // through it (or through /bootstrap, which composes it) takes the
      // warn-and-write-unassigned branch on every item and PR — the invisibility failure
      // as the out-of-the-box outcome.
      const body = normalize(content)
      expect(body).toContain('## assignment')
      expect(body).toContain('default-assignee')
      expect(body).toContain('code-host-assignee')
    },
  )
})

describe('adoption schema — the machine-readable half of the Assignment rule (#403)', () => {
  it.each(conventionCases)(
    '$corpus: the resolution convention owns an assignee-resolution section',
    ({ content }) => {
      // The schema lives where the OTHER way-of-working keys are resolved
      // (`code-host`, `base-branch`), not inside either skill: two skills reading a
      // key that each defines for itself is how they drift apart.
      expect(content).toMatch(/^##\s+Assignee resolution\s*$/m)
    },
  )

  it.each(conventionCases)('$corpus: declares the key and its cascade, once', ({ content }) => {
    const body = normalize(section(content, 'Assignee resolution', 2))
    expect(body).toContain('default-assignee')
    // Byte-for-byte the order both skills state — one sentence, three readers.
    expect(body).toContain('the argument first, then the adoption default, then none')
  })

  it.each(conventionCases)(
    '$corpus: the default is never the authenticated user',
    ({ content }) => {
      const body = normalize(section(content, 'Assignee resolution', 2))
      expect(body).toContain('never the authenticated user')
      expect(body).toContain('bot token')
    },
  )

  it.each(conventionCases)('$corpus: an empty declaration is absent, not empty', ({ content }) => {
    expect(normalize(section(content, 'Assignee resolution', 2))).toContain(
      'an empty value is absent',
    )
  })

  it.each(conventionCases)(
    '$corpus: routes the two assignee writes to their own sides',
    ({ content }) => {
      // The story assignee is a PM-tool write, the PR assignee a code-host write. On a
      // single-tool project they coincide; the contract must not assume it, because a
      // split project's two tools rarely share one identifier for the same human.
      const body = normalize(section(content, 'Assignee resolution', 2))
      expect(body).toContain('the item assignee is a pm-tool write')
      expect(body).toContain('the pull request assignee is a code-host write')
    },
  )

  it.each(conventionCases)(
    '$corpus: every declared key has a reader — the code-host branch of the cascade',
    ({ content }) => {
      // `code-host-assignee` was declared in the schema table with no step resolving it:
      // a field with no rule behind it, which on a split project silently degrades to
      // "PR published unassigned". The cascade names WHICH key each side reads.
      const body = normalize(section(content, 'Assignee resolution', 2))
      expect(body).toContain('code-host-assignee')
      expect(body).toContain('code-host-assignee when declared, else default-assignee')
      expect(body).toContain('pm-tool write')
    },
  )

  it.each(conventionCases)('$corpus: the routing table carries the assignee row', ({ content }) => {
    // Skills route by field, never by assumption — so the operation class has to be IN
    // the table a skill reads, not only in the prose above it.
    expect(normalize(content)).toContain('| item / pull request assignee')
  })

  it('the way-of-working TEMPLATE documents the section a project declares it in', () => {
    // Dataset-only: `.pair/adoption/` is user-owned (registry behavior `add`), so the
    // template is the shipped schema and the root file below is this project's own.
    const template = read(join(DATASET, WOW))
    expect(template).toMatch(/^##\s+Assignment\s*$/m)
    expect(template).toContain('`default-assignee`')
    expect(normalize(template)).toContain('invisible in an assignee-filtered view')
    // Both declared keys carry the side that reads them, so the schema a project copies
    // never ships a field nothing resolves.
    expect(normalize(template)).toContain('read for pull request assignment')
  })

  it("this project's adoption declares a resolvable default-assignee", () => {
    // The reason this assertion exists: the Assignment rule sat in this file as PROSE
    // since 2026-07-30 and nothing could resolve it, which is how #384, #372, #404,
    // #405, #406 and #408 were filed unassigned. A declared value is the difference
    // between a rule and an enforceable one.
    const adoption = read(join(REPO_ROOT, WOW))
    expect(adoption).toMatch(/^##\s+Assignment\s*$/m)
    expect(adoption).toMatch(/`default-assignee`:\s*`[^`\s]+`/)
  })
})
