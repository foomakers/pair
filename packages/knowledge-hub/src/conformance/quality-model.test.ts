import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const QUALITY_ASSURANCE_DIR = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/quality-assurance',
)

const QUALITY_MODEL = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/guidelines/quality-assurance/quality-model.md'),
  'utf-8',
)
const QUALITY_MODEL_MIRROR = readFileSync(
  join(__dirname, '../../../../.pair/knowledge/guidelines/quality-assurance/quality-model.md'),
  'utf-8',
)
const RISK_MATRIX_EXAMPLE = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/assets/risk-matrix-example.md'),
  'utf-8',
)
const QA_README = readFileSync(
  join(__dirname, '../../dataset/.pair/knowledge/guidelines/quality-assurance/README.md'),
  'utf-8',
)
const CLASSIFY_SKILL = readFileSync(
  join(__dirname, '../../dataset/.skills/capability/classify/SKILL.md'),
  'utf-8',
)
const RISK_MATRIX_ADOPTION = readFileSync(
  join(__dirname, '../../../../.pair/adoption/tech/risk-matrix.md'),
  'utf-8',
)

describe('quality-model.md — structure', () => {
  it('has the expected title', () => {
    expect(QUALITY_MODEL).toMatch(/^# Quality Model/m)
  })

  it('documents the 3-layer principle', () => {
    expect(QUALITY_MODEL).toMatch(/Three-Layer Principle/)
    expect(QUALITY_MODEL).toMatch(/\*\*Doc\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Skill\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Automation\*\*/)
  })

  it('documents the 3 pillars', () => {
    expect(QUALITY_MODEL).toMatch(/\*\*Cost\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Security\*\*/)
    expect(QUALITY_MODEL).toMatch(/\*\*Delivery\*\*/)
  })

  it('documents all 5 risk dimensions with tier = max', () => {
    for (const dim of [
      'Service/domain criticality',
      'Change/diff risk',
      'Business impact',
      'Security relevance',
      'Coupling balance',
    ]) {
      expect(QUALITY_MODEL).toContain(dim)
    }
    expect(QUALITY_MODEL).toMatch(/max\(assessed dimensions/i)
  })

  it('matches the D10 SLA table exactly — 1 reviewer even at red tier', () => {
    expect(QUALITY_MODEL).toMatch(/🟢[^\n]*Self-merge/)
    expect(QUALITY_MODEL).toMatch(/🟡[^\n]*\|\s*1 reviewer\s*\|\s*1 working day/)
    expect(QUALITY_MODEL).toMatch(/🔴[^\n]*\|\s*1 reviewer\s*\|\s*2 working days/)
  })

  it('states reviewer counts and SLAs are adoption-overridable KB defaults, not fixed', () => {
    expect(QUALITY_MODEL).toMatch(
      /Reviewer counts and SLAs are \*\*KB defaults\*\*[\s\S]{0,300}Argument > Adoption > KB default/,
    )
    expect(QUALITY_MODEL).toContain('tier.red.reviewers: 2')
  })

  // Two claims that must not collapse into each other: WHAT the tiers require is
  // overridable, THAT the review runs is not, and whether any of it BLOCKS is a separate
  // opt-in. The previous assertion pinned a single sentence saying only reviewer count and
  // SLA were overridable — true before the enforcement flag existed, and it would now hide
  // a revert of the default back to blocking.
  it('separates the un-overridable part from the requirements and from enforcement', () => {
    expect(QUALITY_MODEL).toMatch(
      /Review always runs and tests are always green[\s\S]{0,120}\*\*that\*\* part is not overridable/i,
    )
    expect(QUALITY_MODEL).toMatch(/whether any of it BLOCKS is opt-in/i)
    expect(QUALITY_MODEL).toMatch(/`Review enforcement`[\s\S]{0,120}`disabled` by default/)
    // The consequence that makes the default non-negotiable, so a future edit cannot drop
    // it as decoration: enabling it on a single-maintainer repo cannot be satisfied.
    expect(QUALITY_MODEL).toMatch(/single-maintainer[\s\S]{0,140}cannot be obtained/i)
  })

  it('defines the chromatic tag projection', () => {
    expect(QUALITY_MODEL).toContain('risk:green|yellow|red')
    expect(QUALITY_MODEL).toContain('cost:green|yellow|orange|red')
  })

  it('states risk is the only KB-named/proposed tag family and does not special-case cost as a second default', () => {
    expect(QUALITY_MODEL).toMatch(
      /`risk:green\|yellow\|red` \(§3\.2\) is the only tag family the KB names and proposes by default/,
    )
    expect(QUALITY_MODEL).toMatch(/Only `risk` is a KB default/)
    expect(QUALITY_MODEL).toMatch(
      /the KB does not pre-select which, if any: that choice belongs entirely to the project/,
    )
  })

  it("documents classify's propose-then-write Tag Projection flow", () => {
    expect(QUALITY_MODEL).toMatch(/does `tech\/risk-matrix\.md` have a `## Tag Projection` section/)
    expect(QUALITY_MODEL).toMatch(
      /No Tag Projection declared yet\. Activate `risk:green\|yellow\|red`/,
    )
    expect(QUALITY_MODEL).toMatch(/records the opt-out so this isn't asked again/)
    expect(QUALITY_MODEL).toMatch(
      /the compiled matrix is written to the story\/PR body \*\*regardless of the answer\*\*/,
    )
  })

  it('shows the Tag Projection declaration schema (default, multi-family, opt-out)', () => {
    expect(QUALITY_MODEL).toMatch(/## Tag Projection\n\nActive: risk\n/)
    expect(QUALITY_MODEL).toContain('Active: risk, cost')
    expect(QUALITY_MODEL).toContain('Active: none')
  })

  it('states there is no dedicated eligibility tag', () => {
    expect(QUALITY_MODEL).toMatch(/No dedicated eligibility tag/)
  })

  it('states the Argument > Adoption > KB default resolution order', () => {
    expect(QUALITY_MODEL).toContain('Argument > Adoption > KB default')
  })

  it('states tech/risk-matrix.md holds 3 independent sections that do not imply each other', () => {
    expect(QUALITY_MODEL).toMatch(/up to three independent sections/)
    expect(QUALITY_MODEL).toMatch(/the presence of one never implies the others/)
  })

  it('walks through the resolution cascade with and without the delta file', () => {
    expect(QUALITY_MODEL).toMatch(/No file[^|]*\|\s*absent/)
    expect(QUALITY_MODEL).toMatch(/Tag Projection declared, `risk` active/)
    expect(QUALITY_MODEL).toMatch(/Tag Projection explicitly opted out/)
    expect(QUALITY_MODEL).toMatch(/File present, service listed/)
    expect(QUALITY_MODEL).toMatch(/File present, service \*\*not\*\* listed/)
    expect(QUALITY_MODEL).toMatch(/File present but malformed/)
  })

  it('does not create dead hyperlinks for guidelines that do not exist yet', () => {
    expect(QUALITY_MODEL).not.toMatch(/\]\([^)]*coupling-balance\.md\)/)
    expect(QUALITY_MODEL).toContain('`architecture/design-patterns/coupling-balance.md`')
  })

  it('resolves every §7 nested-taxonomy pointer link to a file on disk', () => {
    const section = QUALITY_MODEL.split('## 7. Nested Taxonomy')[1]
    const links = [...section.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1])
    expect(links.length).toBeGreaterThanOrEqual(9)
    for (const link of links) {
      expect(existsSync(join(QUALITY_ASSURANCE_DIR, link))).toBe(true)
    }
  })

  it('nests every listed theme under a pillar with a pointer', () => {
    for (const theme of [
      'Performance',
      'Accessibility',
      'Observability',
      'Documentation',
      'Planning',
      'Code design / code quality',
      'Architecture / modularity',
      'Release',
      'AI metrics / retro',
      'Vulnerabilities / compliance',
      'Cost signals',
    ]) {
      expect(QUALITY_MODEL).toContain(theme)
    }
  })
})

describe('quality-model.md — cost monitoring pointer (#281, R6.3/R6.4)', () => {
  // §3.3 covers the cost CLASS (R6.2). Monitoring the predicted class against the real
  // one (R6.3) and surfacing drift periodically (R6.4) is assess-cost's report mode:
  // without this pointer the skill's R6.3/R6.4 citation dangles — an installed
  // project's KB (what an agent reads at Step 0) would carry no doc-layer rule for it.
  for (const [label, content] of [
    ['dataset', QUALITY_MODEL],
    ['mirror', QUALITY_MODEL_MIRROR],
  ] as const) {
    it(`${label} names R6.3/R6.4 and points at assess-cost report mode`, () => {
      expect(content).toContain('R6.3')
      expect(content).toContain('R6.4')
      expect(content).toMatch(/R6\.3\/R6\.4[^\n]*report mode/)
    })

    it(`${label} links the report-panel convention and names the current-catalog caveat`, () => {
      expect(content).toMatch(/working-area\.md#report-panels/)
      expect(content.toLowerCase()).toMatch(/current at run time|confounder/)
    })
  }
})

// #438 — Business impact may resolve green for an objectively trivial change (docs-only,
// comment/whitespace/formatter-only) regardless of the touched subdomain, but ONLY for a
// project that declares the key. The KB default stays "subdomain class, full stop" (D21):
// these assertions pin both halves, because the failure mode of an opt-in override is a
// later edit quietly promoting it to a default and re-tiering every other project's work.
describe('quality-model.md — business-impact.trivial-diff override (#438)', () => {
  /**
   * §6's `business-impact.trivial-diff` subsection ONLY — from its heading to the next
   * one. Assertions about the key's own rules must not be satisfiable by text elsewhere
   * in the document (notably §3.1's dimension table, which names the key too).
   */
  const section = (content: string): string => {
    const [, after] = content.split('### `business-impact.trivial-diff`')
    expect(after, "§6's business-impact.trivial-diff subsection is missing").toBeDefined()
    return after.split(/^### /m)[0]
  }

  for (const [label, content] of [
    ['dataset', QUALITY_MODEL],
    ['mirror', QUALITY_MODEL_MIRROR],
  ] as const) {
    // AC1 regression guard: the three subdomain→color mappings must survive verbatim, so
    // the override cannot be introduced by rewriting the default it is meant to sit beside.
    it(`${label} keeps §3.1's KB default — subdomain class alone — unchanged`, () => {
      const row = content.split('\n').find(l => l.startsWith('| Business impact |'))
      expect(row).toBeDefined()
      expect(row).toMatch(/`generic` subdomain/)
      expect(row).toMatch(/`supporting` subdomain/)
      expect(row).toMatch(/`core` subdomain/)
    })

    // AC7 — §3.1's row points at the override rather than silently absorbing it.
    it(`${label} §3.1 Business impact row points at the opt-in override`, () => {
      const row = content.split('\n').find(l => l.startsWith('| Business impact |'))
      expect(row).toContain('business-impact.trivial-diff')
    })

    // §3.1 is a row an agent resolves CELL BY CELL, and after this story the green cell
    // ("any subdomain, when the change is trivial and the project opted in") and the red
    // cell ("`core` subdomain") both match the same input: an all-`.md` diff in a `core`
    // subdomain of a project that declared the key. The precedence exists (§6 + the
    // walkthrough row), but two sections away — the row has to close on itself.
    it(`${label} §3.1's yellow and red cells resolve the tie against the green cell in-row`, () => {
      const cells = (
        content.split('\n').find(l => l.startsWith('| Business impact |')) as string
      ).split('|')
      const [, , , , green, yellow, red] = cells.map(c => c.trim())
      expect(green).toContain('business-impact.trivial-diff')
      expect(yellow, 'yellow cell must name the override that outranks it').toMatch(
        /trivial-diff override|§6/,
      )
      expect(red, 'red cell must name the override that outranks it').toMatch(
        /trivial-diff override|§6/,
      )
    })

    // AC7/AC8(a) — the key and the BR2 definition of "trivial" live in §6's schema.
    it(`${label} §6 documents the key with the definition of trivial spelled out`, () => {
      const s = section(content)
      expect(s).toContain('business-impact.trivial-diff: green')
      expect(s).toMatch(/`\.md`\/`\.mdx`/)
      expect(s).toMatch(/comment-only/)
      expect(s).toMatch(/whitespace-only/)
      expect(s).toMatch(/formatter-output-only/)
      expect(s).toMatch(/no changed line alters an executable or declarative statement/)
    })

    // The story's boundary condition, which branch (a) as written does not carry: branch
    // (a) is the FIRST arm of an OR, so "every changed file is `.md`" short-circuits before
    // branch (b) is ever consulted. In pair a skill file IS the executable procedure, so a
    // PR editing only `.claude/skills/**/SKILL.md` + its dataset source — say, flipping the
    // merge rule from "explicit approval required" to "none" — is all-`.md`, hence trivial,
    // hence Business impact green, on the diff that rewrites the review gate itself. The
    // Change/diff-risk yellow that is supposed to hold it off green is a judgement (and this
    // repo's `change-risk.dataset-mirror-pairs` override collapses source+mirror to ONE
    // module), so the carve-out has to be mechanical and live inside branch (a).
    it(`${label} puts executable markdown out of branch (a) so branch (b) decides`, () => {
      const s = section(content)
      const bullets = s.split('\n').filter(l => /^\s*-\s/.test(l))
      const carveOut = bullets.find(l => /executable/i.test(l) && /skill|workflow/i.test(l))
      expect(carveOut, 'no bullet takes executable markdown out of branch (a)').toBeDefined()
      expect(carveOut, 'the carve-out must hand the decision to branch (b)').toMatch(/branch \(b\)/)
      expect(carveOut, 'the carve-out must state the consequence: not trivial').toMatch(
        /not\*{0,2} trivial/i,
      )
      // Branch (a) is evaluated first, so the exclusion has to be visible ON it — a
      // carve-out stated only further down is one an agent short-circuits past.
      const branchA = bullets.find(l => /\*\*\(a\)/.test(l))
      expect(branchA, 'branch (a) bullet missing').toBeDefined()
      expect(branchA, 'branch (a) must name its own exclusion').toMatch(/executable/i)
    })

    // BR2's exclusion list — the cases that look cosmetic and are not. Without them the
    // definition reads as "small diff", which is exactly the subjectivity it exists to kill.
    // Bounded to §6's own subsection ON PURPOSE: anchoring on the first occurrence of the
    // key lands in §3.1's row, and the resulting slice (§3.1 → EOF) is satisfied by §3.1's
    // unrelated Security-relevance prose ("new external dependency", ...) — the guard then
    // passes with the exclusion clause deleted from §6, i.e. it guards nothing.
    it(`${label} lists what is NOT trivial even when it looks cosmetic`, () => {
      const notTrivial = section(content)
      for (const excluded of [
        'rename',
        'string-literal',
        'dependency',
        'test expectation',
        'build artifact',
      ]) {
        expect(notTrivial.toLowerCase()).toContain(excluded.toLowerCase())
      }
    })

    // BR1/AC1 — opt-in wording, stated as such, not merely implied by the example.
    it(`${label} states the override is opt-in and absent ⇒ today's KB default`, () => {
      const s = section(content)
      expect(s).toMatch(/opt-in/i)
      expect(s).toMatch(
        /business-impact\.trivial-diff[\s\S]{0,2000}?(absent|not declared|undeclared)[\s\S]{0,200}?subdomain class/i,
      )
    })

    // BR3 — one non-trivial file or hunk disables the override for the whole item.
    it(`${label} states the all-or-nothing rule (no per-file granularity)`, () => {
      const s = section(content)
      expect(s).toMatch(/all-or-nothing/i)
      expect(s).toMatch(/one non-trivial (file or hunk|hunk or file)/i)
    })

    // BR5/AC6 — single supported value; anything else warns and is treated as absent.
    it(`${label} states green is the only accepted value, any other warns and is ignored`, () => {
      expect(section(content)).toMatch(
        /only accepted value[\s\S]{0,300}(warn|treated as absent)|warn[\s\S]{0,200}treat(ed)? (it )?as absent/i,
      )
    })

    // BR5, second half: "green is the only accepted value" must not disqualify the inline
    // rationale every `## Overrides` key in this repo (and in the example asset) is written
    // with — read strictly, `green — a change that is trivial per §6 (...)` is not `green`,
    // so a classifying agent warns and treats a live declaration as absent. §6 has to say
    // where the value ends.
    it(`${label} scopes the value to the first token, so an inline rationale may follow`, () => {
      expect(section(content)).toMatch(
        /first token|rationale[^.]{0,120}(may|can) follow|value ends at/i,
      )
    })

    // BR4/AC5 — raises Business impact only; never lowers another dimension or the max.
    it(`${label} states the override raises green and never lowers the tier`, () => {
      const s = section(content)
      expect(s).toMatch(
        /never lowers[\s\S]{0,300}(red|another dimension)|only ever raises[\s\S]{0,200}green/i,
      )
      expect(s).toMatch(/refinement floor|confirm-or-raise|never lower/i)
    })

    // AC4 — the refinement-time fail-safe. Without code to read, only an UNAMBIGUOUSLY
    // trivial declared scope may pre-green the dimension; ambiguity or any named behaviour
    // change falls back to the subdomain rule, and review re-resolves from the real diff.
    it(`${label} makes refinement-time application conditional on unambiguous scope`, () => {
      expect(section(content)).toMatch(/refinement[\s\S]{0,300}unambiguously trivial/i)
    })

    // Fail-safe branches: an unreadable diff cannot prove triviality, so the override
    // must not apply — the opposite default would let a binary/huge diff buy a green.
    it(`${label} makes an unverifiable diff fail safe (override does not apply)`, () => {
      expect(section(content)).toMatch(/unreadable|cannot be verified|binary/i)
    })

    // Story-internal BR-numbering (BR1..BR7 exist only in issue #438's body) must not leak
    // into shipped adopter-facing prose: nothing in the distributed KB defines it, so a
    // reader who hits "(BR3)" has nothing to resolve it against. Rules are cited by their
    // in-document name instead.
    it(`${label} cites no story-internal BR-numbering`, () => {
      expect(content).not.toMatch(/\bBR\d\b/)
    })

    // AC8(b) — the §6 resolution-cascade walkthrough gains its rows. Anchored on each row's
    // FIRST CELL and asserting that row's resolution, because the loose form
    // (/\|[^\n|]*[Tt]rivial diff[^\n|]*declared[^\n|]*\|/ + an unbounded search for
    // "Overrides: business-impact.trivial-diff") was satisfiable WITHOUT the row it exists
    // to protect: the negative row "Trivial diff, override **not** declared" carries both
    // "Trivial diff" and "declared", and the worked-examples table carries the Overrides
    // string. Measured: deleting the positive row from both trees left the suite at 60/60.
    it(`${label} walkthrough table carries the trivial-diff rows`, () => {
      const lines = content.split('\n')
      const row = (firstCell: string): string | undefined =>
        lines.find(l => l.startsWith(`| ${firstCell} |`))

      const declared = row('Trivial diff, override declared')
      expect(declared, 'the override-declared walkthrough row is missing').toBeDefined()
      expect(declared).toContain('green')
      expect(declared).toContain('Overrides: business-impact.trivial-diff')

      const notDeclared = row('Trivial diff, override **not** declared')
      expect(notDeclared, 'the KB-default (undeclared) walkthrough row is missing').toBeDefined()
      expect(notDeclared).toMatch(/subdomain class/)

      const mixed = row('Mixed diff (one non-trivial file or hunk), override declared')
      expect(mixed, 'the mixed-diff walkthrough row is missing').toBeDefined()
      expect(mixed).toMatch(/does not apply/)
      expect(mixed).toMatch(/subdomain class/)

      const badValue = row('Trivial diff, override declared with a value other than `green`')
      expect(badValue, 'the bad-value walkthrough row is missing').toBeDefined()
      expect(badValue).toMatch(/absent/)
      expect(badValue).toMatch(/never a HALT/)
    })

    // AC2/AC3/AC5 asserted, not merely documented: hand-traced matrices in the
    // Worked-Examples style, since BR6 means there is no parser to unit-test.
    it(`${label} carries worked examples for the trivial, mixed and other-red cases`, () => {
      const section = content.split(/### Worked examples — the trivial-diff override/)[1]
      expect(section, 'the worked-example subsection is missing').toBeDefined()
      const rows = section
        .split('\n')
        .filter(l => /^\| [ABC] /.test(l))
        .map(l => l.split('|').map(c => c.trim()))
      expect(rows.length, 'expected three hand-traced example rows (A, B, C)').toBe(3)

      // Columns: '', id, criticality, change-risk, business impact, security, coupling, tier, ''
      const [trivial, mixed, otherRed] = rows
      // AC2 — all-`.md` diff in a core subdomain: Business impact green, tier green.
      expect(trivial[4]).toMatch(/green/)
      expect(trivial[4]).toContain('Overrides: business-impact.trivial-diff')
      expect(trivial[7]).toContain('risk:green')
      // A is the ONLY fixture reaching risk:green, so its Change/diff-risk green has to be
      // self-evidently justified: the ADL and this repo's own declaration both defend the
      // mechanical BR2 definition by asserting a NORMATIVE guideline edit still reads yellow
      // there (shared rule surface) and so cannot reach green. An unlabelled "`.md` guideline
      // edit" row hand-traced to green is a fixture for exactly the outcome that argument
      // calls unreachable — the row must say on its face that no rule changed.
      expect(trivial[1], 'example A must state that it changes no rule').toMatch(
        /no rule changed|non-normative|typo/i,
      )
      // AC3 — one non-trivial hunk mixed in: back to the subdomain class (core ⇒ red).
      expect(mixed[4]).toMatch(/red/)
      expect(mixed[4]).toMatch(/core subdomain/)
      expect(mixed[7]).toContain('risk:red')
      // B spans a doc and a request handler — "multiple modules" per §3.1, so yellow. The
      // tier is red either way (Business impact red), which is precisely why the cell can
      // drift unnoticed and mis-calibrate an agent tracing a mixed doc+code diff.
      expect(mixed[3], 'example B spans two modules ⇒ Change/diff risk yellow').toMatch(/yellow/)
      // AC5/BR4 — the override greens Business impact but another dimension's red stands.
      expect(otherRed[4]).toMatch(/green/)
      expect(otherRed[7]).toContain('risk:red')
    })
  }

  // BR7/D18 — `classify` stays a model-applier: the triviality criteria live in the
  // quality model, never in the skill. Grep-verifiable, per the story's DoD.
  it('classify SKILL.md carries no triviality threshold of its own (D18)', () => {
    for (const criterion of ['comment-only', 'whitespace-only', 'formatter-output', '.mdx']) {
      expect(CLASSIFY_SKILL, `classify must not own the criterion "${criterion}"`).not.toContain(
        criterion,
      )
    }
  })

  // AC2's second half lives in the APPLIER, not only in the model: the matrix `classify`
  // emits must be able to name the override as Business impact's source. Every sibling row
  // of the output template offers an alternation of sources; a single-valued
  // `[subdomain class]` leaves the agent no cell to fill but the one that is false — a
  // core-subdomain diff greened FROM the subdomain class — and the audit trail then loses
  // the only provenance explaining the green. Naming the KEY is not a D18 threshold: it
  // trips none of the triviality vocabulary the guard above pins.
  it('classify SKILL.md matrix template offers the override as a Business impact source', () => {
    const row = CLASSIFY_SKILL.split('\n').find(l => l.startsWith('| Business impact |'))
    expect(row, "classify's matrix template has no Business impact row").toBeDefined()
    expect(row).toContain('subdomain class')
    expect(row).toContain('Overrides: business-impact.trivial-diff')
  })
})

describe('this repo declares the trivial-diff override (#438, AC9)', () => {
  it('.pair/adoption/tech/risk-matrix.md carries the key under ## Overrides', () => {
    // Split on the HEADING, not the string: the file's own preamble names
    // `## Overrides` inline, and splitting on that lands in the preamble.
    const overrides = RISK_MATRIX_ADOPTION.split(/^## Overrides$/m)[1]
    expect(overrides, '## Overrides section missing').toBeDefined()
    expect(overrides).toContain('business-impact.trivial-diff: green')
  })

  it('states a rationale, in the rule-for-the-classifying-agent style of the siblings', () => {
    const entry = RISK_MATRIX_ADOPTION.split('- business-impact.trivial-diff: green')[1] ?? ''
    const paragraph = entry.split(/\n- /)[0]
    expect(paragraph.length, 'the key is declared with no rationale').toBeGreaterThan(300)
    expect(paragraph).toMatch(/subdomain/i)
  })

  // This repo carries the rationale INLINE after the value, like both sibling keys. Read
  // under §6's "green is the only accepted value" that reads as `green — a change that is
  // trivial per...`, i.e. NOT `green` ⇒ warn ⇒ key treated as absent ⇒ AC9's declaration
  // inert and every docs PR here back on the subdomain floor. §6 now scopes the value to
  // the first token; this resolves the declaration the way §6 prescribes and pins `green`.
  it("resolves to `green` under §6's first-token rule despite the inline rationale", () => {
    const line = RISK_MATRIX_ADOPTION.split('\n').find(l =>
      l.startsWith('- business-impact.trivial-diff:'),
    )
    expect(line, 'the declaration line is missing').toBeDefined()
    const value = (line as string).split(':').slice(1).join(':').trim().split(/\s+/)[0]
    expect(value).toBe('green')
  })
})

describe('risk-matrix-example.md', () => {
  it('provides a criticality table with at least one High entry', () => {
    expect(RISK_MATRIX_EXAMPLE).toMatch(/## Criticality Table/)
    expect(RISK_MATRIX_EXAMPLE).toMatch(/\|\s*payments\s*\|\s*High\s*\|/)
  })

  it('documents the unknown-service default separately from the file-absent default', () => {
    expect(RISK_MATRIX_EXAMPLE).toMatch(/resolves to High/)
  })

  // The example asset is the documented adoption starting point, so an override key a
  // project can only discover by reading §6 is a key most projects never learn exists.
  it('shows the business-impact.trivial-diff override in its ## Overrides section', () => {
    const overrides = RISK_MATRIX_EXAMPLE.split(/^## Overrides$/m)[1]
    expect(overrides).toBeDefined()
    expect(overrides).toContain('business-impact.trivial-diff')
  })

  // One section, one syntax: this asset is what a project copies to start its own
  // risk-matrix.md, so a key/value written `key: value`-inside-one-span next to a sibling
  // written `key`: `value` hands adopters two forms for the same construct.
  it('writes every ## Overrides key in the same key-span / value-span form', () => {
    const overrides = RISK_MATRIX_EXAMPLE.split(/^## Overrides$/m)[1] ?? ''
    const keys = overrides.split('\n').filter(l => l.startsWith('- '))
    expect(keys.length, 'no override entries in the example asset').toBeGreaterThan(1)
    for (const line of keys) {
      expect(line, 'override entry must read: `key`: `value` — rationale').toMatch(
        /^- `[a-z-]+\.[a-z-]+`: `/,
      )
    }
  })
})

describe('quality-assurance README — index', () => {
  it('lists quality-model.md in the core quality framework section', () => {
    expect(QA_README).toMatch(/quality-model\.md/)
  })
})
