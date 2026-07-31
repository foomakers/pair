import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * Conformance guard for the PM-tool **adapter contract** (story #402).
 *
 * Cross-cutting invariant across every `*-implementation.md` adapter, so it
 * lives in its own file per the per-artifact ADL's explicit exception for
 * "a genuinely new cross-cutting invariant spanning many artifacts"
 * (decision-log/2026-07-18-conformance-test-per-file-not-per-story.md) —
 * it is NOT a story-named file.
 *
 * The invariant: an item is only visible when it has BOTH board membership and
 * an assignee, and the two are independent. Membership semantics are per-tool
 * (explicit on GitHub Projects, implicit on Azure Boards and on a filesystem
 * backlog), so the mechanics live in the adapters and the skills stay
 * tool-agnostic. Observed 2026-07-30: #384 and #372 were open, assigned, green,
 * and absent from the board entirely — no gate caught it.
 *
 * DATA-DRIVEN BY CONSTRUCTION, NO COUNT ASSERTED. The adapter set is discovered
 * from disk (`*-implementation.md`) in BOTH corpora — the dataset (authoring
 * source of truth) and the generated root mirror. A new adapter is enrolled in
 * the contract the moment its file lands; nothing here needs editing, and no
 * assertion breaks because the set grew. When `linear-implementation.md` arrives
 * (#389) it is enrolled automatically — supplying its two sections is #403's
 * job, and this guard going red is precisely how that omission stays visible
 * instead of shipping as another invisible-item bug.
 */

const REL = '.pair/knowledge/guidelines/collaboration/project-management-tool'
const CORPORA = [
  { label: 'dataset', dir: join(__dirname, '../../dataset', REL) },
  { label: 'generated root', dir: join(__dirname, '../../../../', REL) },
]

/** The heading every adapter carries, per the README adapter contract. */
const VISIBILITY_HEADING = 'Item Visibility: Membership and Assignee'

/**
 * Strips markdown emphasis and code spans, then collapses whitespace.
 *
 * Without this, an assertion requiring two adjacent words goes vacuously green
 * the moment prose puts a `code span` or **bold** marker between them — the
 * exact way an earlier story shipped guard regexes that could never fail.
 * Every claim below is matched against normalized text, and every one was
 * injection-tested by deleting the claim and confirming the assertion reddens.
 * That sweep found one real vacuous assertion (see the create-recipe test) and
 * confirmed the two degenerate cases fail loudly rather than passing empty:
 * zero adapter files on disk fails at collection, and a discovery filter that
 * stops matching reddens the non-empty guard below.
 */
function normalize(markdown: string): string {
  return markdown.replace(/[*`_]/g, '').replace(/\s+/g, ' ').toLowerCase()
}

/** Adapter files present on disk — discovered, never enumerated. */
function adapterFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => name.endsWith('-implementation.md'))
    .sort()
}

/**
 * The body of a `### <heading>` section: everything up to the next heading of
 * level 3 or shallower, so the adapter's own `####` sub-recipes stay inside.
 *
 * Fence-aware on purpose: these guides are mostly shell recipes, and a `# MCP-first`
 * comment inside a fenced block reads as an h1 to a naive regex — which truncated
 * the section before its own create recipe and made the code-span assertions
 * unsatisfiable.
 */
function section(markdown: string, heading: string): string {
  const lines = markdown.split('\n')
  const start = lines.findIndex(line => line.trimEnd() === `### ${heading}`)
  if (start === -1) return ''

  const body: string[] = []
  let inFence = false
  for (const line of lines.slice(start + 1)) {
    if (/^\s*```/.test(line)) inFence = !inFence
    if (!inFence && /^#{1,3} /.test(line)) break
    body.push(line)
  }
  return body.join('\n')
}

const adapterCases = CORPORA.flatMap(({ label, dir }) =>
  adapterFiles(dir).map(file => ({
    corpus: label,
    file,
    content: readFileSync(join(dir, file), 'utf-8'),
  })),
)

describe('PM-tool adapter contract — every adapter present documents visibility (#402)', () => {
  it('discovers adapters from disk in both corpora', () => {
    // Not a count assertion — a non-empty guard so the data-driven cases below
    // can never pass vacuously by iterating an empty list.
    for (const { label, dir } of CORPORA) {
      expect(adapterFiles(dir).length, `no adapters found in ${label}`).toBeGreaterThan(0)
    }
  })

  it.each(adapterCases)('$corpus/$file has the visibility section', ({ content }) => {
    expect(content).toContain(`### ${VISIBILITY_HEADING}`)
  })

  it.each(adapterCases)(
    '$corpus/$file declares its membership semantics as explicit or implicit (AC4)',
    ({ content }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      expect(body).toMatch(/membership is (explicit|implicit)/)
    },
  )

  // The assertion above accepts either word, by design: it must hold for an
  // adapter this suite has never seen. But for the adapters that DO exist, the
  // loose form lets a regression flip azure/filesystem to "explicit" — or github
  // to "implicit" — and stay green, which is exactly the confusion AC4 exists to
  // prevent ("silence is what makes an agent invent an add-item step"). So pin
  // the known values by name. Still count-free: a sixth adapter is governed by
  // the loose assertion above until someone states its semantics here.
  const KNOWN_SEMANTICS = [
    { file: 'github-implementation.md', word: 'explicit' },
    { file: 'azure-devops-implementation.md', word: 'implicit' },
    { file: 'filesystem-implementation.md', word: 'implicit' },
  ]
  const knownCases = CORPORA.flatMap(({ label, dir }) =>
    KNOWN_SEMANTICS.filter(k => existsSync(join(dir, k.file))).map(k => ({
      corpus: label,
      file: k.file,
      word: k.word,
      content: readFileSync(join(dir, k.file), 'utf-8'),
    })),
  )

  it.each(knownCases)(
    '$corpus/$file pins its membership as $word, so a flip cannot pass (AC4)',
    ({ content, word }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      const other = word === 'explicit' ? 'implicit' : 'explicit'
      // Pin the adapter's OWN declaration — the `board membership is …` sentence.
      // A bare `membership is <word>` negative was wrong: github's section legitimately
      // says "on tools where membership is implicit, the guide says so", a pointer to
      // the other adapters, not a claim about GitHub. Caught by this test failing.
      expect(body).toContain(`board membership is ${word}`)
      expect(body).not.toContain(`board membership is ${other}`)
    },
  )

  it.each(adapterCases)(
    '$corpus/$file sets the assignee as part of the create, not as a follow-up (AC3)',
    ({ content }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      expect(body).toContain('as part of the create, never as a follow-up step')
    },
  )

  it.each(adapterCases)(
    '$corpus/$file reports an unresolvable assignee instead of dropping it',
    ({ content }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      expect(body).toContain('if the assignee cannot be resolved')
      expect(body).toContain('never drop it silently')
    },
  )
})

const readmeCases = CORPORA.map(({ label, dir }) => ({
  corpus: label,
  content: readFileSync(join(dir, 'README.md'), 'utf-8'),
}))

describe('PM-tool README — the adapter contract is a stated requirement (#402 AC5)', () => {
  it.each(readmeCases)('$corpus: states the required-coverage contract', ({ content }) => {
    expect(content).toMatch(/^#+ Adapter Contract — Required Coverage$/m)
  })

  it.each(readmeCases)(
    '$corpus: states membership and assignee are independent and both required',
    ({ content }) => {
      expect(normalize(content)).toContain(
        'membership and assignee are independent, and both are required for visibility',
      )
    },
  )

  it.each(readmeCases)('$corpus: names the section every adapter must carry', ({ content }) => {
    expect(normalize(content)).toContain(normalize(VISIBILITY_HEADING))
  })

  it.each(readmeCases)(
    '$corpus: requires the membership/assignee/status-write claims of a new adapter',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('membership is explicit / membership is implicit')
      expect(body).toContain('as part of the create, never as a follow-up step')
      expect(body).toContain('if the assignee cannot be resolved')
      expect(body).toContain('never drop it silently')
    },
  )

  it.each(readmeCases)(
    '$corpus: declares the coverage data-driven and count-free',
    ({ content }) => {
      const body = normalize(content)
      // Expected literals go through the same normalization as the corpus, so an
      // emphasis marker in the prose can neither satisfy nor defeat the claim.
      expect(body).toContain(normalize('data-driven over the `*-implementation.md` files present'))
      expect(body).toContain(normalize('**no adapter count is asserted anywhere**'))
    },
  )
})

const githubCases = CORPORA.map(({ label, dir }) => ({
  corpus: label,
  content: readFileSync(join(dir, 'github-implementation.md'), 'utf-8'),
}))

describe('github-implementation.md — explicit membership precedes the status write (#402 AC1)', () => {
  it.each(githubCases)('$corpus: membership is explicit and a separate call', ({ content }) => {
    const body = normalize(section(content, VISIBILITY_HEADING))
    expect(body).toContain('membership is explicit')
    expect(body).toContain('distinct objects')
    expect(body).toContain('addprojectv2itembyid')
  })

  it.each(githubCases)(
    '$corpus: has an add-the-item step before the status write',
    ({ content }) => {
      expect(content).toMatch(/^#### Step 2b: Add the Issue as a Project Item/m)
      expect(normalize(content)).toContain(
        'membership must exist before the status field can be written',
      )
      const addItem = content.indexOf('#### Step 2b:')
      const statusWrite = content.indexOf('#### Step 3: Update the Status Field')
      expect(addItem).toBeGreaterThan(-1)
      expect(statusWrite).toBeGreaterThan(addItem)
    },
  )

  it.each(githubCases)('$corpus: the status write requires an id from 2 or 2b', ({ content }) => {
    expect(normalize(section(content, 'Project Board Status Transitions'))).toContain(
      'requires an item id from step 2 or step 2b',
    )
  })

  it.each(githubCases)('$corpus: documents the add-item call as idempotent', ({ content }) => {
    expect(normalize(content)).toContain('returns that existing item instead of duplicating it')
  })

  it.each(githubCases)('$corpus: no-ops when no project is configured (D4)', ({ content }) => {
    const body = normalize(content)
    expect(body).toContain('the membership step no-ops')
    expect(body).toContain('never a halt')
  })

  it.each(githubCases)('$corpus: targets the adopted project, never the first', ({ content }) => {
    expect(normalize(content)).toContain('never take the first project found')
  })
})

describe('github-implementation.md — the empty item id is an explicit branch (#402 AC2)', () => {
  it.each(githubCases)(
    '$corpus: names not-a-project-item-yet as a lookup outcome',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('branch on the result')
      expect(body).toContain('not a project item yet')
    },
  )

  it.each(githubCases)(
    '$corpus: forbids carrying an empty id into the status write',
    ({ content }) => {
      expect(normalize(content)).toContain('never carry an empty id into step 3')
    },
  )

  it.each(githubCases)(
    '$corpus: forbids reporting success on a skipped board write',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('never treat the empty id as "board write skipped" and report success')
      expect(body).toContain('paginate to the last page before concluding "not an item"')
    },
  )
})

describe('github-implementation.md — assignee is part of the write (#402 AC3)', () => {
  it.each(githubCases)('$corpus: the create recipe carries the assignee', ({ content }) => {
    const body = section(content, VISIBILITY_HEADING)
    expect(body).toContain('assignees: ["[login]"]')
    // Pinned as a whole command: a bare `--assignee "[login]"` check was VACUOUS —
    // the sibling `gh pr create --assignee` line satisfied it even with the flag
    // deleted from `gh issue create` (found by injection-testing this guard).
    expect(body).toMatch(/gh issue create\b[^\n]*--assignee "\[login\]"/)
  })

  it.each(githubCases)('$corpus: adding an assignee is safe to re-run', ({ content }) => {
    expect(normalize(section(content, VISIBILITY_HEADING))).toContain(
      'adds without replacing, so it is safe to run unconditionally',
    )
  })

  it.each(githubCases)('$corpus: states a PR author is not a PR assignee', ({ content }) => {
    expect(normalize(section(content, VISIBILITY_HEADING))).toContain(
      "a pr's author is not its assignees",
    )
  })

  // Review finding M1 on PR #404. The create recipe used to write the assignee and
  // NOT the membership, so `/write-issue` called without `$status` — the follow-up
  // path, which is how #384 and #372 were actually filed — produced the exact
  // defect this story exists to remove: open, assigned, green, off the board.
  // AC1 only closes the status-write path; these pin the create path.
  it.each(githubCases)(
    '$corpus: the create recipe states that creating does not imply membership',
    ({ content }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      expect(body).toContain('creating does not imply membership')
    },
  )

  it.each(githubCases)('$corpus: the create recipe carries the membership write', ({ content }) => {
    const body = section(content, VISIBILITY_HEADING)
    // Same whole-command discipline as the assignee pin above: a bare `--project`
    // check would be satisfied by the `gh pr create` line alone.
    expect(body).toMatch(/gh issue create\b[^\n]*--project "\[project title\]"/)
    // MCP has no project field, so Step 2b is mandatory after it — not optional.
    expect(normalize(body)).toContain('step 2b is required after it, not optional')
  })

  it.each(githubCases)(
    '$corpus: --project is documented as a title, never a node id',
    ({ content }) => {
      // The Advanced Features snippet passed [PROJECT_ID], contradicting this file's
      // own visibility section AND being wrong about the flag's argument type.
      // Asserted on RAW content, not normalize()d: normalize strips `_`, so
      // `[PROJECT_ID]` becomes `[projectid]` and a check written with the underscore
      // could never match. That exact vacuity was caught by injection-testing this
      // guard — the regression was reinstated and the suite stayed green.
      expect(content).not.toMatch(/gh (issue|pr) create --project \[PROJECT_ID\]/i)
      expect(normalize(content)).toContain("takes the project's title (or number), never its node")
    },
  )
})
