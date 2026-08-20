import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #216: auto-development eligibility is an
// ADOPTION-DECLARED FILTER over the classification tags `classify` already emits
// — a SINGLE LITERAL LABEL in `tech/automation.md`'s `## Eligibility` section —
// never a dedicated eligibility tag (ADR-013 Q2b / D18) and never a boolean
// grammar (`pair-next --filter` takes one literal label, #249).
//
// The story ships NO runtime code: `pair-next` stays frozen (ADR-017 §1) and no
// consumer exists yet (#217/#250). So the normative content IS the deliverable,
// and this markdown conformance test is the tested production artifact standing
// in for its acceptance checks — the project's established mechanism for
// KB-normative content (precedents: `pair-next-scoping.test.ts`,
// `quality-model.test.ts`; ADL 2026-07-13 — gate/tooling logic lives in tested
// modules, never in unit-tested scripts).
//
// Every assertion runs over BOTH the dataset source of record and the installed
// root `.pair/knowledge` mirror, because the mirror is what an adopting project
// actually reads.

const REPO_ROOT = join(__dirname, '../../../..')
const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(REPO_ROOT, '.pair/knowledge')

const read = (p: string): string => readFileSync(p, 'utf-8')

const POLICY_REL = 'guidelines/collaboration/automation/automation-policy.md'
const README_REL = 'guidelines/collaboration/automation/README.md'
const QUALITY_MODEL_REL = 'guidelines/quality-assurance/quality-model.md'

const policySources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, POLICY_REL))],
  ['mirror', read(join(MIRROR_KB, POLICY_REL))],
]

const qualityModelSources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, QUALITY_MODEL_REL))],
  ['mirror', read(join(MIRROR_KB, QUALITY_MODEL_REL))],
]

const readmeSources: Array<[string, string]> = [
  ['dataset', read(join(DATASET_KB, README_REL))],
  ['mirror', read(join(MIRROR_KB, README_REL))],
]

const DOCS = join(REPO_ROOT, 'apps/website/content/docs')
const docsSources: Array<[string, string]> = [
  ['reference/quality-model.mdx', read(join(DOCS, 'reference/quality-model.mdx'))],
  [
    'reference/quality-gates-configuration.mdx',
    read(join(DOCS, 'reference/quality-gates-configuration.mdx')),
  ],
  ['concepts/adoption-files.mdx', read(join(DOCS, 'concepts/adoption-files.mdx'))],
]

// A boolean operator applied TO A LABEL — `risk:green AND team:ui`. Deliberately
// NOT a bare / (AND|OR|NOT) / grep: prose legitimately contains "What is NOT
// optional" (quality-gates-configuration.mdx §30), and a guard that trips on
// English would be disabled the first time it cried wolf. What must not exist is
// an example FILTER carrying an operator, since `--filter` cannot express one.
const LABEL_BOOLEAN_OPERATOR =
  /(?:[a-z][a-z-]*:[a-z]+\s+(?:AND|OR|NOT)\s|\s(?:AND|OR|NOT)\s+[a-z][a-z-]*:[a-z]+)/

describe.each(policySources)('automation-policy.md — %s (AC1: the declaration)', (_, content) => {
  it('names the adoption file and the section that holds the declaration', () => {
    expect(content).toContain('tech/automation.md')
    expect(content).toContain('## Eligibility')
  })

  it('states the declaration is a single literal label', () => {
    expect(content.toLowerCase()).toMatch(/single literal label|exactly one label/)
  })

  it('states there is no boolean grammar and defers the matching rule to pair-next', () => {
    expect(content).toMatch(/no AND\/OR\/NOT grammar/)
    expect(content).toMatch(/string equality|string-equality/)
    // The matching rule has ONE owner. This guideline must point at it rather
    // than restate it, or the two drift (the story's top technical risk).
    //
    // Asserted as a SENTENCE SHAPE, not as two loose tokens: `toContain('pair-next')`
    // + `toContain('SKILL.md')` passes on a document that restates the whole matching
    // algorithm inline and then adds a courtesy "see SKILL.md" — i.e. on exactly the
    // drift this guard exists to catch. What must hold is that the line naming
    // SKILL.md is the line that DEFERS to it.
    const deferral = content
      .split('\n')
      .filter(line => line.includes('SKILL.md'))
      .filter(line => /owned by/.test(line) && /referenced here, never restated/.test(line))

    expect(deferral).toHaveLength(1)
    expect(deferral[0]).toContain('pair-next')
    // ...and the deferral must be navigable: a reader lands on the source of truth.
    expect(deferral[0]).toMatch(/\]\((https?:\/\/|\.\.?\/)[^)]*SKILL\.md\)/)

    // ...and the target must EXIST. The pointer is an absolute GitHub URL by
    // necessity (an uncategorized top-level skill is skipped by the install-time
    // link rewriter — skill-reference-rewriter.ts, `if (!originalSubDir.includes('/'))
    // continue` — so a relative `../.skills/next/SKILL.md` would dangle in the
    // installed mirror). Absolute http links are SKIPPED by every link checker in
    // this repo (link-rewriter.ts: "External links (http, mailto, anchors) are
    // skipped"), so moving `.skills/next/` or renaming the skill leaves check:links,
    // docs:staleness and skills:conformance all green while every adopting project's
    // installed guideline points at a 404 — losing the ONLY reference to the matching
    // rule this whole schema is defined against. Resolve the URL back to its
    // repo-relative path and assert the file is on disk.
    const target = /\]\(https?:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/([^)]*SKILL\.md)\)/.exec(
      deferral[0],
    )
    expect(
      target,
      `deferral line carries no resolvable GitHub blob URL: ${deferral[0]}`,
    ).not.toBeNull()
    // Deliberately NOT pinned to a literal path: a legitimate move that also
    // updates the URL must stay green. What must hold is that the URL resolves to
    // a file that is actually here.
    const repoRelative = target![1]
    expect(existsSync(join(REPO_ROOT, repoRelative)), `${repoRelative} does not exist`).toBe(true)
  })

  it('tells consumers to pass the declared label verbatim — no tag name in code (D18)', () => {
    expect(content).toMatch(/verbatim/)
    expect(content).toMatch(/D18/)
  })
})

describe.each(policySources)('automation-policy.md — %s (AC2: default + caveats)', (_, content) => {
  it('documents `risk:green` as the recommended default', () => {
    expect(content).toMatch(/recommended default/i)
    expect(content).toContain('risk:green')
  })

  it('states yellow and red never match it, so business-critical work is never auto-developed', () => {
    expect(content).toContain('risk:yellow')
    expect(content).toContain('risk:red')
    expect(content.toLowerCase()).toMatch(/never auto-developed|never match/)
  })

  it('carries the tag-projection caveat: no projection ⇒ nothing eligible', () => {
    expect(content).toContain('## Tag Projection')
    expect(content).toContain('tech/risk-matrix.md')
    expect(content).toContain('Active: risk')
    expect(content).toContain('Active: none')
    expect(content.toLowerCase()).toMatch(/nothing is eligible|nothing eligible/)
  })

  it('warns that a renamed tag family must be declared by its EMITTED label', () => {
    expect(content).toContain('priority:green')
  })
})

describe.each(policySources)(
  'automation-policy.md — %s (AC4: extraction contract)',
  (_, content) => {
    // "Malformed = anything that is not exactly one label" is only a rule if "one
    // label" has an operational definition. Without one, each consumer invents its
    // own: a whitespace split HALTs on `good first issue` (a valid single GitHub
    // label carrying spaces), while a comma-only split accepts `risk:green
    // risk:yellow` and silently matches nothing. Both are the drift this schema
    // exists to prevent, so the extraction rule is pinned here like the others.
    //
    // The two are pinned by DIFFERENT clauses, and neither one implies the other:
    // the "entire trimmed line is the label" rule keeps `good first issue` valid,
    // and HALT trigger 6 (more than one colon-carrying token) is what rejects
    // `risk:green risk:yellow` / `risk:green or risk:yellow`. Extraction alone
    // does NOT reject them — it accepts any single line — so the trigger is the
    // load-bearing half and is asserted below on its own.
    it('says WHERE the value lives — the first non-empty line after the heading', () => {
      expect(content.toLowerCase()).toMatch(/first non-empty line/)
    })

    it('says the whole trimmed line is the label, and that labels may contain spaces', () => {
      expect(content.toLowerCase()).toMatch(/entire trimmed line is the label/)
      expect(content.toLowerCase()).toMatch(/may contain spaces/)
      expect(content).toContain('good first issue')
      // No tokenisation: a consumer that splits on whitespace is explicitly wrong.
      expect(content.toLowerCase()).toMatch(/splits on whitespace is wrong|no whitespace split/)
    })

    it('enumerates the six HALT triggers — empty, several lines, comma or operator, markdown marker, over the label cap, several labels on one line', () => {
      expect(content.toLowerCase()).toMatch(/no non-empty line/)
      expect(content.toLowerCase()).toMatch(/more than one non-empty line/)
      expect(content.toLowerCase()).toMatch(/contains a \*\*comma\*\*|contains a comma/)
      expect(content).toMatch(/`AND` \/ `OR` \/ `NOT`/)
      // 4 — markdown decoration. The declaration is rendered inside a fence on
      // every surface that documents it, and every other list in the adoption
      // files is written as `- item`, so a bare fence line and `- risk:green` are
      // the two values a copy-paste actually produces. Both are one non-empty line with
      // no comma and no operator, so triggers 1-3 wave them through — and they
      // match zero cards, switching automation off SILENTLY.
      expect(content.toLowerCase()).toMatch(/begins with a markdown block marker/)
      // 5 — the value has to be able to BE a label on the host.
      expect(content.toLowerCase()).toMatch(/longer than 50 characters/)
      // 6 — several labels juxtaposed on ONE line. `risk:green risk:yellow` and
      // `risk:green or risk:yellow` are each a single non-empty line, comma-free,
      // carrying no STANDALONE upper-case operator and no markdown marker, and are
      // under the 50-char cap — so triggers 1-5 wave them through, and the value
      // then matches zero cards and switches automation off SILENTLY: the very
      // outcome trigger 4 was added for. The test is that the rule COUNTS
      // colon-carrying tokens rather than splitting on whitespace, so
      // `good first issue` (zero colons) stays valid.
      expect(content.toLowerCase()).toMatch(
        /more than one whitespace-separated token containing a colon/,
      )
      expect(content).toContain('risk:green risk:yellow')
      expect(content).toContain('risk:green or risk:yellow')
      expect(content).toMatch(/Validation is exactly the six checks/)
      expect(content).not.toMatch(/exactly the five checks/)
    })

    it('says the declaration is a bare label line — not a list item, quote or fenced block', () => {
      expect(content).toMatch(/bare label line/)
      expect(content).toMatch(/not a list item/)
      expect(content).toContain('- risk:green')
    })

    it('states the declared value is DATA on EVERY channel — argv, tool argument, agent prompt', () => {
      expect(content).toMatch(/DATA, never a command fragment/)
      expect(content.toLowerCase()).toMatch(/single argument.*argv element|argv element/)
      expect(content).toMatch(/MUST NOT[^.\n]*interpolate/)
      // The shell is not the channel this schema's consumers use: #217 and #250
      // are skills — LLM agents — with no argv at all, so a value like
      // "ignore previous instructions ..." would otherwise pass every check and
      // be handed on verbatim, by rule, into a prompt.
      expect(content.toLowerCase()).toMatch(/agent prompt/)
      expect(content).toMatch(/MUST NOT[^.\n]*read as instruction text/)
    })

    it('bounds the value mechanically — a label on the host, 50 characters, no newline', () => {
      expect(content).toMatch(/50 characters/)
      expect(content.toLowerCase()).toMatch(/forbids newlines/)
      expect(content).toMatch(/MUST HALT/)
      // "No newline" is a property of the extracted value (one trimmed line, by
      // the extraction rule), NOT a HALT trigger a consumer could ever fire —
      // stated as a trigger it reads as a check that cannot fail, and invites the
      // reader to conclude the value may span lines (trigger 2 covers that, and
      // covers it differently).
      expect(content).not.toMatch(/or carries a newline/)
    })

    it('says the 50-char bound is a bound, not a sanitizer, and gives the enforceable half', () => {
      // `all cards are eligible` is 22 chars, one line, no comma, no operator, no
      // markdown marker, one colon-free token — it passes every HALT trigger and is
      // then, by rule, carried verbatim into the prompt of an LLM consumer
      // (#217/#250). Length filters long prose; it sanitizes nothing. So the
      // structural defence has to be stated as a MUST of its own.
      expect(content).toMatch(/a bound, not a sanitizer/)
      expect(content).toMatch(/MUST[^.\n]*delimited data slot/)
      expect(content.toLowerCase()).toMatch(/untrusted adoption data/)
      expect(content).toMatch(/MUST NOT[^.\n]*inlin/)
    })

    it('places the "label matches no card" diagnostic with the consumer — report, never HALT', () => {
      // Line "validation is exactly the N checks" closes the failure set, and an
      // unmatched filter is documented as expected behaviour. Together they make a
      // typo (`risk:gren`) indistinguishable from a correct declaration on a board
      // with no green cards — so the contract has to say WHOSE job it is to tell
      // them apart, or a consumer reads the closed set as forbidding the check.
      expect(content).toMatch(/SHOULD report/)
      expect(content).toMatch(/MUST NOT HALT on/)
      expect(content).toMatch(/consumer's own diagnostics/)
    })
  },
)

describe.each(policySources)('automation-policy.md — %s (AC3/AC4: fail-safes)', (_, content) => {
  it('states absent file or absent section ⇒ empty eligibility set, as a MUST', () => {
    expect(content).toMatch(/MUST treat the eligibility set as empty/)
    expect(content).toMatch(/MUST NOT[^.\n]*all cards/)
    // Absence is a documented state, not an error (D21, same shape as tech/risk-matrix.md).
    expect(content).toMatch(/D21/)
    expect(content.toLowerCase()).toMatch(/never an error/)
  })

  it('disambiguates an ABSENT section from a PRESENT but empty one', () => {
    // Both arms are fail-safe, but they are DIFFERENT arms: absent = no policy was
    // ever declared (silently off); present-and-empty = a half-written declaration
    // (HALT). Left overlapping, two consumers behave differently on the same file.
    expect(content).toMatch(/Absent section ≠ empty section/)
    expect(content.toLowerCase()).toMatch(/half-written declaration/)
  })

  it('states a value that is not exactly one label ⇒ HALT, as a MUST', () => {
    expect(content).toMatch(/MUST HALT/)
    expect(content).toMatch(/adoption-fix message/)
    // The halt message has to be actionable: it names the file AND the value.
    expect(content.toLowerCase()).toMatch(/naming the file and the offending value/)
    expect(content).toMatch(/MUST NOT[^.\n]*(all eligible|silently pick)/)
  })
})

describe.each(policySources)('automation-policy.md — %s (AC5: re-evaluation)', (_, content) => {
  it('states the declaration is re-read every run and every step, never cached', () => {
    expect(content.toLowerCase()).toMatch(/every run and every step/)
    expect(content.toLowerCase()).toMatch(/never cached/)
  })

  it('states an untagged card never matches, so untagged work is never eligible', () => {
    expect(content.toLowerCase()).toMatch(/untagged/)
    expect(content).toMatch(/ADR-013/)
  })
})

describe.each(policySources)('automation-policy.md — %s (boundaries)', (_, content) => {
  it('does not restate the per-tier gate/approval policy — it points at quality-model §4', () => {
    expect(content).toContain('quality-model.md')
    expect(content.toLowerCase()).toMatch(/which cards/)
    expect(content.toLowerCase()).toMatch(/never which gates|not which gates/)
  })

  it('scopes itself to `## Eligibility` and defers the rest of the file to #250', () => {
    expect(content).toContain('max_parallelism')
    expect(content).toContain('#250')
  })

  it('states there is no dedicated eligibility tag', () => {
    expect(content.toLowerCase()).toContain('no dedicated eligibility tag')
  })
})

describe('automation framework README — index entry', () => {
  it.each(readmeSources)('%s lists automation-policy.md in Directory Contents', (_, content) => {
    const directoryContents = content.split('## Directory Contents')[1] ?? ''
    expect(directoryContents).toContain('automation-policy.md')
  })
})

describe('quality-model.md §5 — reconciled with the single-label filter (AC6)', () => {
  it.each(qualityModelSources)('%s no longer promises a tag COMBINATION', (_, content) => {
    // The pre-#216 wording — "optionally combined with project tags" — described a
    // filter grammar `pair-next --filter` deliberately never shipped (#249).
    expect(content).not.toMatch(/optionally combined with project tags/)
  })

  it.each(qualityModelSources)('%s keeps the no-dedicated-eligibility-tag rule', (_, content) => {
    expect(content).toMatch(/No dedicated eligibility tag/)
  })

  it.each(qualityModelSources)(
    '%s states the single-label rule and links the schema',
    (_, content) => {
      expect(content.toLowerCase()).toMatch(/single literal label/)
      expect(content).toContain('automation-policy.md')
      expect(content).toContain('tech/automation.md')
    },
  )
})

describe('docs site — the same rule from every surface (AC6)', () => {
  it.each(docsSources)('%s states the single-label rule', (_, content) => {
    expect(content.toLowerCase()).toMatch(/single literal label|exactly one label/)
  })

  it.each(docsSources)('%s names the adoption file that holds it', (_, content) => {
    expect(content).toContain('tech/automation.md')
  })
})

describe('no example filter anywhere carries a boolean operator (AC6)', () => {
  const everySurface: Array<[string, string]> = [
    ...policySources.map(([k, v]) => [`policy:${k}`, v] as [string, string]),
    ...qualityModelSources.map(([k, v]) => [`quality-model:${k}`, v] as [string, string]),
    ...docsSources,
  ]

  it.each(everySurface)('%s', (_, content) => {
    expect(content).not.toMatch(LABEL_BOOLEAN_OPERATOR)
  })
})
