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
      expect(normalize(content)).toContain('priority, type, status, assignee')
    },
  )

  it.each(writeIssueCases)(
    '$corpus: states the assignee is ignored in comment mode',
    ({ content }) => {
      // Comment mode is the non-destructive path: it must stay byte-identical on the
      // item's body, labels AND assignee.
      const body = normalize(content)
      expect(body).toMatch(/in comment mode only \$id and \$comment are read/)
      expect(body).toContain('$assignee')
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
      // One rule here, six adapters there — the field/flag that actually sets the
      // assignee is the implementation guide's, never invented in the skill.
      expect(cascadeSection(content)).toContain('never invent')
    },
  )
})

describe('/write-issue — membership precedes state, confirmed by a read (#403 AC4, AC5)', () => {
  const boardSection = (content: string): string =>
    normalize(section(content, 'Step 7b: Write the Board State'))

  it.each(writeIssueCases)('$corpus: has a dedicated board-write step', ({ content }) => {
    expect(content).toMatch(/^### Step 7b: Write the Board State/m)
  })

  it.each(writeIssueCases)(
    '$corpus: states the invariant once, tool-agnostically',
    ({ content }) => {
      // Stated in the SKILL (this story's half); the per-tool mechanics stay in the
      // adapters (#402's half) — one invariant, six adapters, no restatement.
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
      const body = normalize(section(content, 'Step 7b: Write the Board State'))
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
