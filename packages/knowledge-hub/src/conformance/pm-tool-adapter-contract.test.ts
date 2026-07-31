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
 * (explicit on GitHub Projects; implicit on Azure Boards, on Linear, and on a
 * filesystem backlog), so the mechanics live in the adapters and the skills stay
 * tool-agnostic. Observed 2026-07-30: #384 and #372 were open, assigned, green,
 * and absent from the board entirely — no gate caught it.
 *
 * DATA-DRIVEN BY CONSTRUCTION, NO COUNT ASSERTED. The adapter set is discovered
 * from disk (`*-implementation.md`) in BOTH corpora — the dataset (authoring
 * source of truth) and the generated root mirror. A new adapter is enrolled in
 * the contract the moment its file lands; nothing here needs editing, and no
 * assertion breaks because the set grew.
 *
 * `linear-implementation.md` (#389, merged as 2da33a88) is enrolled and COVERED
 * HERE: it landed in this same story, since #389 merging first put the obligation
 * on #402 rather than on #403. Its semantics are implicit — `issueCreate`
 * requires `teamId`, so an issue cannot exist without belonging to a team — and
 * they are pinned by name in KNOWN_SEMANTICS below. #403 retains only the
 * skill-contract half of the original split ($assignee in /write-issue's
 * parameters, plus the tool-agnostic membership-precedes-state invariant).
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

  // Contract clause 5. "Implicit" answers HOW membership happens, not WHETHER the item
  // is visible: on Azure an area path outside the team's configured areas, and on Linear
  // a project-scoped view, both leave a created-and-assigned item out of the view the
  // team reads. So an implicit-membership adapter must also NAME what decides that view.
  // Table-driven rather than a generic regex, and it fails loudly on an adapter it does
  // not know — enrolling a new implicit adapter is a deliberate edit, not a default.
  const IMPLICIT_VIEW_DECIDERS: Record<string, string> = {
    'azure-devops-implementation.md': '--area',
    'linear-implementation.md': 'projectId',
    // No separate field exists here: the file's path IS both membership and view.
    'filesystem-implementation.md': 'location',
  }

  it.each(adapterCases)(
    '$corpus/$file — implicit membership still names what decides the read view (clause 5)',
    ({ file, content }) => {
      const body = normalize(section(content, VISIBILITY_HEADING))
      // The PINNED sentence form (`Board` prefix), not the bare phrase: an adapter
      // legitimately cross-references the other semantics in prose — github's section
      // explains what implicit membership means elsewhere — and matching the bare
      // phrase read that as github declaring itself implicit.
      if (!/board membership is implicit/.test(body)) return
      const decider = IMPLICIT_VIEW_DECIDERS[file]
      expect(
        decider,
        `${file} declares implicit membership but is not enrolled in IMPLICIT_VIEW_DECIDERS — ` +
          `add the field that decides its read view (contract clause 5)`,
      ).toBeDefined()
      expect(body, `${file} must name '${decider}' in its visibility section`).toContain(
        normalize(decider as string),
      )
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
    // Linear is a known adapter with stated semantics as of this story: `issueCreate`
    // requires `teamId`, so membership cannot be a separate call. Unpinned, a flip to
    // "explicit" stays green and tells an agent to invent an `addProjectV2ItemById`
    // equivalent Linear has no concept of — the precise AC4 failure.
    { file: 'linear-implementation.md', word: 'implicit' },
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

  // Round-3 finding: the "implicit membership is not the same as 'cannot be
  // invisible'" caveat was prose-only in both implicit-membership adapters —
  // deleting it from both corpora left the suite green. It is the sentence that
  // stops an agent reading "implicit" as "nothing else can hide the item".
  const IMPLICIT_CAVEAT_FILES = ['azure-devops-implementation.md', 'linear-implementation.md']
  const caveatCases = CORPORA.flatMap(({ label, dir }) =>
    IMPLICIT_CAVEAT_FILES.filter(file => existsSync(join(dir, file))).map(file => ({
      corpus: label,
      file,
      content: readFileSync(join(dir, file), 'utf-8'),
    })),
  )

  it.each(caveatCases)(
    '$corpus/$file states implicit membership still allows an invisible item',
    ({ content }) => {
      expect(normalize(section(content, VISIBILITY_HEADING))).toContain(
        'implicit membership is not the same as',
      )
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
      // Clause 4 — the one that encodes AC1+AC2 for every FUTURE adapter. It was
      // unguarded while the test name already claimed it: deleting the whole clause
      // from both corpora left the suite green.
      expect(body).toContain('membership precedes the state write')
      expect(body).toContain('never a silently skipped board write reported as success')
    },
  )

  it.each(readmeCases)(
    '$corpus: states the heading level and the pinned membership sentence form',
    ({ content }) => {
      const body = normalize(content)
      // The prose used to be looser than the gate: `section()` matches `### <heading>`
      // only, and KNOWN_SEMANTICS pins `board membership is <word>`. An author writing
      // `## Item Visibility…` or `membership is implicit` without the `Board` prefix
      // satisfied the contract as written and reddened CI with a non-obvious message.
      expect(body).toContain(`level-3 section headed ### ${VISIBILITY_HEADING}`.toLowerCase())
      expect(body).toContain('board membership is explicit')
      expect(body).toContain('board membership is implicit')
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
      // "(or number)" was dropped: gh 2.97.0 documents `-p, --project title` (title
      // only, identically for `gh pr create` and `gh issue edit --add-project`); the
      // numeric form belongs to the separate `gh project` commands. The pinned half
      // is the never-a-node-ID one, which is what an agent gets wrong.
      expect(normalize(content)).toContain("takes the project's title, never its node")
      // Scoped to the CLAIM, not to the whole file: "(or number)" is legitimate prose
      // elsewhere, so a bare ban would redden on a sentence that has nothing to do with
      // --project.
      expect(content).not.toMatch(/takes the project's \*?\*?title\*?\*?[^.\n]*\(or number\)/i)
    },
  )

  // The `project` OAuth scope. A default `gh auth login` token does not carry it,
  // and gh resolves projects BEFORE creating the issue — so `--project` on a
  // scope-less token fails the whole command and creates nothing. Undocumented, the
  // obvious agent recovery is to retry without `--project`, which lands exactly on
  // the off-board item this story exists to remove.
  it.each(githubCases)('$corpus: names the project scope and how to grant it', ({ content }) => {
    const body = normalize(section(content, VISIBILITY_HEADING))
    expect(body).toContain('gh auth refresh -s project')
    expect(body).toContain('missing required scopes [project]')
  })

  it.each(githubCases)(
    '$corpus: forbids working around a missing scope by dropping --project',
    ({ content }) => {
      expect(normalize(section(content, VISIBILITY_HEADING))).toContain(
        'never worked around by dropping --project',
      )
    },
  )

  // Round-3 finding: every no-project remediation was prose-only, so a future edit
  // could restore the round-1 defect (a failed board write laundered into a green
  // report) with CI green. The two assertions above pin the PERMISSION to skip; these
  // pin its LIMIT — the failed-discovery branch and the Step 1 outcome that owns it.
  it.each(githubCases)(
    '$corpus: a FAILED discovery is reported, never absorbed as the no-op',
    ({ content }) => {
      const body = normalize(content)
      expect(body).toContain('never absorbed as a no-op')
      expect(body).toContain('not evidence of absence')
      // The no-project branch states its terminal state, not just the membership no-op:
      // Steps 2-3 interpolate a project number/id that does not exist.
      expect(body).toContain('skip steps 2-3')
    },
  )
})

/**
 * The adapter is authoritative, but it is not the only place the KB teaches an
 * issue create. `issue-management/github-issues.md` carried two create recipes with
 * neither `--assignee` nor `--project` — the exact item this story exists to forbid
 * — and an agent reaching them by index or grep saw nothing pointing back at the
 * adapter. Two contradictory recipes per tool is worse than one incomplete one, so
 * the invariant is enforced KB-wide rather than per file.
 *
 * ALL THREE tracker CLIs are guarded, not just gh: the first cut matched
 * `gh issue create` alone while the prose it protects is tool-wide, so azure's
 * `--assigned-to` and Linear's `assigneeId` were pinned by nothing (verified by
 * deleting them from both corpora — the suite stayed green). The adapters' own
 * `### Create` sections are covered too: `section()` stops at the next `###`, so
 * they sit outside the body the per-adapter assertions above read.
 *
 * Whole-command discipline, same as the adapter assertions above: the flag must be
 * on the create invocation itself, not merely somewhere in the file (a neighbouring
 * `gh pr create --assignee` satisfied the naive form).
 */
const KB_ROOTS = [
  { label: 'dataset', dir: join(__dirname, '../../dataset/.pair/knowledge') },
  { label: 'generated root', dir: join(__dirname, '../../../../.pair/knowledge') },
]

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

/**
 * Shell commands inside fenced code blocks, one logical line each.
 *
 * Fenced-only, and command-shaped: a plain-prose sentence mentioning a create verb
 * is NOT a recipe. The earlier substring filter (`line.includes('gh issue create ')`)
 * passed only incidentally — the prose mention in the adapter happens to be written
 * with a code span, so a backtick and not a space followed the phrase. Written
 * without code spans, that sentence would have reddened the guard with a message
 * about a recipe the author never added.
 *
 * Fence tracking is marker-aware (a ```` block is not closed by an inner ```), so a
 * file that quotes fences cannot silently swallow the recipes after it. Two joins,
 * because the KB uses both shapes: trailing-backslash continuations (`az`, `gh`) and
 * a single-quoted argument spanning lines (the `linear_gql` JSON payloads). Comment
 * lines are dropped before joining — an apostrophe in a comment would otherwise
 * unbalance the quote count and hide the command underneath it.
 */
/**
 * Marks a fence boundary in the line stream: no command spans two code blocks.
 *
 * The leading NUL is what makes the sentinel collision-proof — markdown cannot
 * contain one, so no content line can ever equal it. Written ESCAPED on purpose: it
 * used to be a literal NUL byte in this source, invisible in every editor and diff
 * (it renders as a space, and a round-4 reviewer read it as one), so a well-meant
 * "tidy the whitespace" edit would have silently turned it into a value markdown CAN
 * produce. Keep the escape.
 */
const FENCE_BREAK = '\u0000fence'

/** Code-block lines only, shell prompts stripped, blanks and comments dropped. */
function fencedLines(markdown: string): string[] {
  const lines: string[] = []
  let open: string | null = null

  for (const raw of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1]
    if (marker) {
      if (open === null) open = marker
      else if (marker[0] === open[0] && marker.length >= open.length) open = null
      lines.push(FENCE_BREAK)
      continue
    }
    if (open === null) continue
    const line = raw.replace(/^\s*\$\s+/, '').trim()
    if (line !== '' && !line.startsWith('#')) lines.push(line)
  }
  return lines
}

/** Joins trailing-backslash continuations and single-quoted arguments spanning lines. */
function joinContinuations(lines: string[]): string[] {
  const commands: string[] = []
  let pending = ''
  const flush = (): void => {
    if (pending) commands.push(pending)
    pending = ''
  }

  for (const line of lines) {
    if (line === FENCE_BREAK) {
      flush()
      continue
    }
    const body = line.replace(/\\$/, '').trim()
    pending = pending ? `${pending} ${body}` : body
    const unbalancedQuote = (pending.split("'").length - 1) % 2 === 1
    if (!line.endsWith('\\') && !unbalancedQuote) flush()
  }
  flush()
  return commands
}

function fencedCommands(markdown: string): string[] {
  return joinContinuations(fencedLines(markdown))
}

/**
 * One family per tracker CLI. `match` selects the create invocations; `required` is
 * the flag/field without which the created item is invisible in the view the team
 * reads. Each family also carries its own non-empty guard, so a discovery that stops
 * matching one tool reddens instead of going quietly vacuous.
 */
const CREATE_FAMILIES = [
  { tool: 'gh', match: /^gh issue create\b/, required: /--assignee\b/, flag: '--assignee' },
  {
    tool: 'az',
    match: /^az boards work-item create\b/,
    required: /--assigned-to\b/,
    flag: '--assigned-to',
  },
  {
    tool: 'linear',
    match: /^linear_gql\b.*\bissueCreate\b/,
    required: /assigneeId/,
    flag: 'assigneeId',
  },
]

type CreateRecipeCase = {
  corpus: string
  file: string
  tool: string
  family: (typeof CREATE_FAMILIES)[number]
  command: string
  occurrence: number
}

const createRecipeCases = KB_ROOTS.flatMap(
  ({ label, dir }) =>
    markdownFiles(dir)
      .flatMap(path =>
        fencedCommands(readFileSync(path, 'utf-8')).flatMap(command => {
          const family = CREATE_FAMILIES.find(candidate => candidate.match.test(command))
          return family
            ? [
                {
                  corpus: label,
                  file: path.slice(dir.length + 1),
                  tool: family.tool,
                  family,
                  command,
                },
              ]
            : []
        }),
      )
      .reduce<{ perFile: Map<string, number>; out: CreateRecipeCase[] }>(
        // `occurrence` numbers recipes WITHIN a file. It exists to disambiguate two
        // recipes in the same document; numbering across the corpus made a case name
        // depend on how many recipes happened to precede it in unrelated files, so
        // adding a snippet to one adapter renamed the cases of every later one.
        (acc, recipe) => {
          const n = (acc.perFile.get(recipe.file) ?? 0) + 1
          acc.perFile.set(recipe.file, n)
          acc.out.push({ ...recipe, occurrence: n })
          return acc
        },
        { perFile: new Map(), out: [] },
      ).out,
)

describe('KB-wide — no issue-create recipe omits the assignee (gh, az, linear) (#402)', () => {
  it.each(
    KB_ROOTS.flatMap(({ label }) => CREATE_FAMILIES.map(({ tool }) => ({ corpus: label, tool }))),
  )('$corpus: finds the $tool create recipes it means to guard', ({ corpus, tool }) => {
    // Non-empty per family, not a count: if the discovery breaks for one tool, the
    // cases below would pass vacuously over the recipes of the other two.
    expect(
      createRecipeCases.filter(c => c.corpus === corpus && c.tool === tool).length,
    ).toBeGreaterThan(0)
  })

  it.each(createRecipeCases)(
    '$corpus/$file $tool recipe $occurrence sets the assignee on the create itself',
    ({ command, family }) => {
      expect(command, `missing ${family.flag}`).toMatch(family.required)
    },
  )
})

/**
 * The two implicit-membership adapters name a real visibility field in their prose;
 * the create recipe below it must actually carry that field, or copying the recipe
 * still reproduces the story's symptom one layer under the warning.
 */
const VISIBILITY_FIELD_CASES = CORPORA.flatMap(({ label, dir }) =>
  [
    {
      file: 'azure-devops-implementation.md',
      field: '--area',
      match: /^az boards work-item create\b.*--area\b/,
    },
    {
      file: 'linear-implementation.md',
      field: 'projectId',
      match: /^linear_gql\b.*\bissueCreate\b.*projectId/,
    },
  ]
    .filter(({ file }) => existsSync(join(dir, file)))
    .map(entry => ({
      corpus: label,
      ...entry,
      content: readFileSync(join(dir, entry.file), 'utf-8'),
    })),
)

describe('implicit-membership adapters ship the visibility field on a create recipe (#402)', () => {
  it.each(VISIBILITY_FIELD_CASES)(
    '$corpus/$file has a create recipe carrying $field',
    ({ content, match, field }) => {
      const commands = fencedCommands(content)
      expect(
        commands.some(command => match.test(command)),
        `no create recipe with ${field}`,
      ).toBe(true)
    },
  )
})
