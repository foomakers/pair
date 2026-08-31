import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'

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

// Exhaustive page collection, shared by the two scanning guards at the bottom of
// this file. A hand-kept list rots: the page that acquires the banned shape is by
// definition a page nobody added to the list.
const collect = (dir: string, ext: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory()
      ? collect(join(dir, e.name), ext)
      : e.name.endsWith(ext)
        ? [join(dir, e.name)]
        : [],
  )

const under = (root: string, label: string, ext: string): Array<[string, string]> =>
  collect(root, ext).map(
    f => [`${label}/${f.slice(root.length + 1)}`, readFileSync(f, 'utf-8')] as [string, string],
  )

// EVERY published docs page (79 at time of writing), not the 3 curated ones above.
const docsPages: Array<[string, string]> = under(DOCS, 'docs', '.mdx')

// A boolean operator applied TO A LABEL — `risk:green AND team:ui`. Deliberately
// NOT a bare / (AND|OR|NOT) / grep: prose legitimately contains "What is NOT
// optional" (quality-gates-configuration.mdx §30), and a guard that trips on
// English would be disabled the first time it cried wolf. What must not exist is
// an example FILTER carrying an operator, since `--filter` cannot express one.
const LABEL_BOOLEAN_OPERATOR =
  /(?:[a-z][a-z-]*:[a-z]+\s+(?:AND|OR|NOT)\s|\s(?:AND|OR|NOT)\s+[a-z][a-z-]*:[a-z]+)/

// The same shape in ANY case, plus the comma-separated list form. Applied only to
// the surfaces that carry NO negative examples (see the split at the bottom of
// this file).
const LABEL_BOOLEAN_OPERATOR_ANY_CASE =
  /(?:[a-z][a-z-]*:[a-z]+\s+(?:AND|OR|NOT)\s|\s(?:AND|OR|NOT)\s+[a-z][a-z-]*:[a-z]+)/i
const LABEL_LIST_COMMA = /[a-z][a-z-]*:[a-z]+\s*,\s*[a-z][a-z-]*:[a-z]+/i

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
    // link rewriter — skill-reference-rewriter.ts:204, `if (!isRegistryEntryPath(
    // originalSubDir, transformOpts.flattenDepth)) continue`, whose depth gate skips a
    // top-level path — so a relative `../.skills/next/SKILL.md` would dangle in the
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

    it('says WHICH `## Eligibility` heading is the declaration when the file carries two', () => {
      // "Everything after the heading up to the next heading" is ambiguous the
      // moment the file carries two `## Eligibility` headings — a shape #250 makes
      // plausible, since it adds sibling sections to the same file.
      const body = content.toLowerCase()
      expect(body).toMatch(/more than one `## eligibility` heading/)
    })

    it('says the whole trimmed line is the label, and that labels may contain spaces', () => {
      expect(content.toLowerCase()).toMatch(/entire trimmed line is the label/)
      expect(content.toLowerCase()).toMatch(/may contain spaces/)
      expect(content).toContain('good first issue')
      // No tokenisation: a consumer that splits on whitespace is explicitly wrong.
      expect(content.toLowerCase()).toMatch(/splits on whitespace is wrong|no whitespace split/)
    })

    it('scopes the HALT list to BOTH inputs — the section body and the value extracted from it', () => {
      // Triggers 1 and 2 are properties of the SECTION BODY, not of the extracted
      // value: by the extraction rule the value is exactly one trimmed line, so
      // against it trigger 1 can never fire (a value exists ⇒ non-empty) and
      // trigger 2 can never fire (one line has no second line). A preamble that
      // says only "against the extracted value" therefore sends an implementer of
      // #217/#250 down a path where the present-but-empty section — the
      // half-written declaration the fail-safe above deliberately routes to HALT —
      // falls through to a "no value" arm the contract never defines.
      const preamble = content
        .split('\n')
        .filter(line => /MUST HALT\*\* when any of these holds/.test(line))
      expect(preamble).toHaveLength(1)
      expect(preamble[0]).toMatch(/section body/)
      expect(preamble[0]).toMatch(/extracted/)
      // Trigger 7 is a property of NEITHER of those two: the body of a section
      // starts AFTER its heading, so a single extracted body contains zero
      // `## Eligibility` headings by construction and the duplicate-heading HALT
      // can never fire from it. An implementer of #217 who codes exactly the
      // inputs the preamble names would ship that trigger as dead code.
      expect(preamble[0]).toMatch(/file/)
      expect(preamble[0]).toMatch(/trigger 7 is a property of the file/i)
    })

    it('enumerates the seven HALT triggers — empty, several lines, comma or operator, markdown marker, over the label cap, several labels on one line, duplicate heading', () => {
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
      // 5 — the value has to be able to BE a label on the host. The bound is the
      // HOST's label-name cap, not GitHub's number: pair resolves the tracker from
      // way-of-working (Jira / Linear / Azure DevOps are all supported), and a
      // Jira-tracked project declaring `automation-eligible-supporting-domain-green`
      // (54 chars) is declaring a label its host accepts. Hardcoding 50 turns that
      // correct declaration into a HALT, switching unattended development off and
      // telling the maintainer to shorten a label that was never too long. GitHub's
      // 50 stays in the sentence as the stated default.
      expect(content.toLowerCase()).toMatch(/host's label-name cap|label-name cap on the host/)
      expect(content).toMatch(/50 characters/)
      expect(content).toMatch(/GitHub/)
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
      // 7 — more than one `## Eligibility` heading in the file. #250 adds sibling
      // sections to this same file, so a maintainer merging two snippets can end up
      // with two Eligibility headings — one `risk:green`, one `risk:yellow`. The
      // extraction contract said "everything after the heading up to the next
      // heading" without saying WHICH heading, so a first-wins consumer (#217) and a
      // last-wins consumer (#250) legitimately disagree, and the last-wins one
      // auto-develops business-critical-adjacent cards from a file its owner reads
      // as green. HALT is the fail-safe reading and matches "not exactly one
      // declaration".
      expect(content.toLowerCase()).toMatch(/more than one `## eligibility` heading/)
      expect(content).toMatch(/Validation is exactly the seven checks/)
      expect(content).not.toMatch(/exactly the (five|six) checks/)
    })

    it('counts `## Eligibility` headings as RENDERED markdown — a fenced occurrence is not one', () => {
      // Every surface that documents the declaration renders it inside a fence,
      // so a fenced `## Eligibility` is the shape a maintainer has at hand — e.g.
      // a ```markdown block holding "what we would switch to next quarter" above
      // the live declaration. A consumer implementing trigger 7 as a line scan
      // (`grep -c '^## Eligibility'`) counts 2 and HALTs a file that renders with
      // exactly one heading; one using a markdown parser counts 1 and runs. Two
      // conforming consumers, same file, opposite outcomes — the divergence
      // trigger 7 exists to close.
      expect(content.toLowerCase()).toMatch(/rendered markdown/)
      expect(content.toLowerCase()).toMatch(/fenced code block is not a heading/)
    })

    it('bounds the commented-out-alternative example to OUTSIDE the `## Eligibility` section', () => {
      // The worked example above ("a consumer using a parser would run it") holds
      // only when the fenced alternative sits outside the section. Put it in its
      // NATURAL place — directly under the live heading:
      //
      //   ## Eligibility
      //   ```markdown
      //   ## Eligibility
      //   risk:yellow
      //   ```
      //   risk:green
      //
      // A parser-based consumer counts exactly ONE rendered heading, so trigger 7
      // does not fire, exactly as the paragraph promises — then HALTs anyway: the
      // section body's first non-empty line is '```markdown' (trigger 4) and the
      // body carries more than one non-empty line (trigger 2). The document
      // predicts "runs" for a file its own triggers reject, and an implementer of
      // #217/#250 reading it builds the wrong expectation for the one shape the
      // paragraph was written to cover.
      expect(content).toMatch(
        /kept \*\*elsewhere in the file, outside the `## Eligibility` section\*\*/,
      )
      expect(content).toMatch(/inside the section it is a trigger 2 \/ trigger 4 HALT/)
    })

    it('matches the heading at level 2 exactly — `### Eligibility` is not the declaration', () => {
      // Without this the contract silently routes a half-written declaration to
      // the silent arm: a maintainer nesting `### Eligibility` / `risk:green`
      // under their own `## Automation` section has no `## Eligibility` heading,
      // so a consumer takes the ABSENT-section arm — eligibility set empty,
      // automation off, no message anywhere — while the file visibly carries a
      // declaration its author believes is live. That is exactly the collapse the
      // "absent section ≠ empty section" clause forbids for the empty body.
      expect(content.toLowerCase()).toMatch(/level 2 exactly/)
      expect(content).toMatch(/### Eligibility/)
    })

    it('states the residual the seven checks do NOT catch — juxtaposed colon-free labels', () => {
      // `bug enhancement` is 15 chars, one line, comma-free, operator-free,
      // marker-free, zero colons: it passes all seven triggers, reaches
      // `pair-next --filter` verbatim, matches zero cards and switches automation
      // off silently. The residual is genuinely undecidable — `good first issue` is
      // one real label with spaces — so it is deliberately NOT an eighth trigger.
      // What the contract must not do is leave a reader believing the checks are
      // exhaustive of "not exactly one label", because then nobody routes this case
      // to the 0-match diagnostic that does cover it.
      expect(content.toLowerCase()).toMatch(/colon-free/)
      expect(content.toLowerCase()).toMatch(/deliberately not a halt|not a halt/)
      expect(content).toMatch(/SHOULD report/)
    })

    it('admits the OVER-inclusive residual too — triggers 3 and 4 reject some legitimate labels', () => {
      // The under-inclusive residual is admitted; the over-inclusive one was not.
      // A project whose Tag Projection emits tag-style labels declares
      // `#tech-debt` — one line, comma-free, operator-free, 10 characters, one
      // colon-free token, one heading — and trigger 4 HALTs it for "beginning
      // with a markdown block marker". The consumer then emits an adoption-fix
      // message saying "the declaration takes exactly one label" against a file
      // declaring exactly one label the host accepts, and unattended development
      // is off until the maintainer works out that the schema, not the label, is
      // the problem. Same shape for a label carrying a comma. Fail-safe, so a
      // foot-gun rather than a breach — but it must be written down.
      expect(content).toMatch(/#tech-debt/)
      expect(content.toLowerCase()).toMatch(/legitimate label/)
      expect(content.toLowerCase()).toMatch(/rename or re-project/)
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

  it('names the MECHANISM that produces the forbidden fall-back, not just the outcome', () => {
    // The `MUST NOT ... all cards` sentence above states an OUTCOME. The natural
    // implementation of an empty eligibility set — `filter = eligibility ?? undefined`,
    // then `pair-next` with no `--filter` — produces that outcome while violating no
    // sentence a reviewer can point at: per next/SKILL.md Step 0 item 3, an omitted
    // `--filter` defaults the candidate set to the FULL BACKLOG, every `risk:red` and
    // untagged card, handed to an unattended loop (#217/#250 are the first consumers
    // and the story ships no runtime code, so an unstated mechanism is an unbuilt
    // safeguard). What must be normative is: do not run the selection query AT ALL.
    expect(content).toMatch(/MUST NOT invoke `pair-next` at all/)
    expect(content).toMatch(/omitted `--filter`/)
    expect(content).toMatch(/full backlog/)
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

  it('adoption-files.mdx does not promise that anything PROPOSES the Eligibility section', () => {
    // Nothing scaffolds `tech/automation.md` — by design (A3/A4: no dataset stub, no
    // self-write, no consumer yet). `classify` DOES propose `## Tag Projection` in
    // `risk-matrix.md`, so a sentence attributing propose-and-confirm to both optional
    // files leaves a reader waiting for a prompt that never comes: they never create
    // `tech/automation.md`, their automation stays off, and nothing anywhere errors.
    const content = read(join(DOCS, 'concepts/adoption-files.mdx'))
    const exception = content.split('\n').filter(line => /nothing scaffolds them/.test(line))
    expect(exception).toHaveLength(1)
    expect(exception[0]).toMatch(/`automation\.md` is never proposed|never proposed/)
    // ...and the propose-and-confirm clause must be scoped to risk-matrix.md.
    const proposeClause = /for `risk-matrix\.md`[^;]*\*propose\*/.test(exception[0])
    expect(
      proposeClause,
      `propose-and-confirm is not scoped to risk-matrix.md: ${exception[0]}`,
    ).toBe(true)
  })
})

describe('classify SKILL.md — the schema pointer is navigable (AC6)', () => {
  // Both twins gained a pointer to this schema in this story. A BARE CODE SPAN is
  // not one: a reader in an installed project cannot click through and must guess
  // which root `collaboration/automation/automation-policy.md` hangs off, while the
  // neighbouring bullets in the same list (idempotency convention, quality model)
  // resolve in one click. The install-time link rewriter also only retargets what it
  // sees as a link, so a future guideline move silently strands a bare span.
  const classifySkills: Array<[string, string]> = [
    ['.claude twin', join(REPO_ROOT, '.claude/skills/pair-capability-classify/SKILL.md')],
    ['dataset', join(__dirname, '../../dataset/.skills/capability/classify/SKILL.md')],
  ]

  it.each(classifySkills)('%s links automation-policy.md, and the target exists', (_, path) => {
    const content = read(path)
    const line = content
      .split('\n')
      .filter(l => l.includes('automation-policy.md'))
      .find(l => l.includes('No eligibility tag'))
    expect(line, 'no eligibility-tag bullet naming automation-policy.md').toBeDefined()

    const link = /\[[^\]]*\]\((\.\.?\/[^)]*automation-policy\.md)\)/.exec(line!)
    expect(link, `pointer is not a relative markdown link: ${line}`).not.toBeNull()
    expect(existsSync(join(dirname(path), link![1])), `${link![1]} does not resolve`).toBe(true)
  })
})

describe('no example filter anywhere carries a boolean operator (AC6)', () => {
  // The guard is deliberately NOT uniform across surfaces. The policy file carries
  // the LOWERCASE negative examples trigger 6 is written around (`risk:green or
  // risk:yellow`, `risk:green, risk:yellow`), so on it only a STANDALONE UPPER-CASE
  // operator can be forbidden. The quality model and the three docs pages carry no
  // negative examples at all and are checked strictly — any case, plus the
  // comma-separated list form. Without the split, a later docs edit adding
  // "e.g. `risk:green and team:ui`" or "`risk:green, team:ui`" leaves every case
  // green while the docs site ships an example filter naming a grammar `--filter`
  // never shipped — which a maintainer then copies into `tech/automation.md`, where
  // trigger 3 or 6 HALTs their automation.
  const policySurfaces: Array<[string, string]> = policySources.map(
    ([k, v]) => [`policy:${k}`, v] as [string, string],
  )

  it.each(policySurfaces)('%s — no upper-case operator applied to a label', (_, content) => {
    expect(content).not.toMatch(LABEL_BOOLEAN_OPERATOR)
  })

  // EVERY docs page, not the 3 that happen to mention eligibility today. The
  // 3-page list was the same hand-kept-list rot the `adopted` scan below already
  // rejects: a future `docs/concepts/automation.mdx` or `docs/reference/cli/*.mdx`
  // documenting eligibility as `risk:green, team:ui` or `risk:green AND team:ui`
  // passed this whole suite green, shipped on the docs site, and a maintainer
  // copying it into `tech/automation.md` HALTed their own automation (trigger 3
  // or 6). Widening is verified viable: both regexes over all 79 collected `.mdx`
  // pages match zero times.
  //
  // DIVERGENCE from the `adopted` scan below: the KB corpora are NOT in this list.
  // `automation-policy.md` carries the lower-case negative examples trigger 6 is
  // written around (checked separately, upper-case-only, above), and the two
  // accessibility guidelines carry CSS selector lists (`a:focus, button:focus`)
  // that LABEL_LIST_COMMA cannot distinguish from a label list. The KB stays on
  // the path guard, which has no such false positives.
  const strictSurfaces: Array<[string, string]> = [
    ...qualityModelSources.map(([k, v]) => [`quality-model:${k}`, v] as [string, string]),
    ...docsPages,
  ]

  it('scans every published docs page for the operator/list shapes', () => {
    expect(docsPages.length).toBeGreaterThan(20)
  })

  it.each(strictSurfaces)(
    '%s — no operator in ANY case, and no comma-separated label list',
    (_, content) => {
      expect(content).not.toMatch(LABEL_BOOLEAN_OPERATOR_ANY_CASE)
      expect(content).not.toMatch(LABEL_LIST_COMMA)
    },
  )
})

// One adoption layout, stated once. `.pair/adoption/{product,tech}/` is the real
// on-disk shape; the `adopted/` sub-layer never existed in any shipped dataset.
// A docs page that still scaffolds it hands a KB author an empty
// `.pair/adoption/tech/adopted/` and a `tech-stack.md` that every skill resolving
// `tech/tech-stack.md` reads as absent — a silent fall-back to KB defaults, no
// error anywhere. This scans EVERY docs page rather than a hand-kept list, so the
// next page to acquire the stale path fails here instead of at an adopter.
describe('ONE adoption layout — no `adopted/` sub-layer in docs or the KB', () => {
  // Path-shaped only: `[thing] is adopted/required for [purpose]` is prose about
  // the adoption declaration pattern, not a directory, and must stay legal.
  const ADOPTED_SUBLAYER = /\.pair\/[\w./-]*\badopted\b/

  // The KB is scanned too, and it matters MORE than the docs site: the docs are read
  // on the web, the KB is what `pair install` copies INTO an adopting project. This
  // PR had to fix two KB guidelines (filesystem-issues.md, filesystem-tracking.md,
  // both twins) for exactly this path error, so the class is live here. Concrete
  // failure otherwise: a guideline edit reintroduces `.pair/product/adopted/current-status.md`
  // inside a fenced bash snippet — `check:links` does not resolve paths inside fences,
  // mirror-sync copies it verbatim, every gate stays green, and an adopting project
  // installs a guideline telling an agent to `cat >` into a directory that exists in
  // no shipped dataset.
  const pages: Array<[string, string]> = [
    ...docsPages,
    ...under(DATASET_KB, 'dataset-kb', '.md'),
    ...under(MIRROR_KB, 'mirror-kb', '.md'),
  ]

  it('scans every published docs page and every KB guideline', () => {
    expect(pages.filter(([p]) => p.startsWith('docs/')).length).toBeGreaterThan(20)
    expect(pages.filter(([p]) => p.startsWith('dataset-kb/')).length).toBeGreaterThan(20)
    expect(pages.filter(([p]) => p.startsWith('mirror-kb/')).length).toBeGreaterThan(20)
  })

  it.each(pages)('%s carries no `.pair/**/adopted` path', (_, content) => {
    expect(content).not.toMatch(ADOPTED_SUBLAYER)
  })

  // ADOPTED_SUBLAYER needs `.pair/` and `adopted` on the SAME line (no `s`/`m` flag,
  // and `.` does not cross a newline), so it cannot see an ASCII directory tree: `.pair/`
  // sits at the root line, `adopted/` several lines and one turn of `│`/`├──` later — the
  // exact shape both filesystem-tracking.md and filesystem-issues.md carried (US-216
  // review round 2) and the shape a fenced ```text tree is drawn in. This second guard
  // looks for a bare `adopted` (or `adopted/`) NODE — a tree line with nothing but box-
  // drawing characters and whitespace before it — inside any fenced block that also
  // mentions `.pair/`, independent of which line either one is on.
  it.each(pages)('%s carries no bare `adopted` node in a fenced tree block', (_, content) => {
    const blocks = content.match(/```[a-z]*\n[\s\S]*?```/g) ?? []
    for (const block of blocks) {
      if (!block.includes('.pair/')) continue
      const bareAdoptedNode = block.split('\n').some(line => /^[\s│├└─]*adopted\/?\s*$/.test(line))
      expect(bareAdoptedNode).toBe(false)
    }
  })
})

// Story #450 — a SECOND, independent section of the same `tech/automation.md`
// file: `## Harness` (supported harnesses) and `## Model Policy` (model class
// per risk tier). Disjoint from `## Eligibility` above and from the rest-of-file
// schema #250/ADR-017 §6 will land — asserted here rather than in a new file
// because it is the same target artifact (`automation-policy.md`).
describe('automation-policy.md — Harness and Model Policy section (story #450)', () => {
  it.each(policySources)(
    '%s: declares the zero-configuration path before `## Harness`',
    (_, content) => {
      const sectionStart = content.indexOf('## Harness and Model Policy')
      const zeroConfigIdx = content.indexOf('Zero-configuration path', sectionStart)
      const harnessHeadingIdx = content.indexOf('### `## Harness`', sectionStart)
      expect(zeroConfigIdx).toBeGreaterThan(sectionStart)
      expect(harnessHeadingIdx).toBeGreaterThan(zeroConfigIdx)
      expect(content.slice(zeroConfigIdx, harnessHeadingIdx)).toMatch(
        /every harness in the framework is presumed supported/,
      )
    },
  )

  it.each(policySources)(
    '%s: `## Harness` is a comma-separated list, never a pinned harness',
    (_, content) => {
      const section = content.slice(
        content.indexOf('### `## Harness`'),
        content.indexOf('### `## Model Policy`'),
      )
      expect(section).toContain('never what to use')
      expect(section).toContain('pi, opencode, claude-code')
    },
  )

  it.each(policySources)(
    '%s: `## Model Policy` declares classes, never concrete model names',
    (_, content) => {
      const section = content.slice(content.indexOf('### `## Model Policy`'))
      expect(section).toContain('cheap')
      expect(section).toContain('balanced')
      expect(section).toContain('frontier')
      expect(section).toContain('never concrete model names')
    },
  )

  it.each(policySources)('%s: cross-links the agent-harness framework', (_, content) => {
    expect(content).toContain('agent-harness/README.md')
  })
})

// Story #250 T1 — the four remaining knobs ADR-017 §6 names: the auto-advance
// switch, the stop predicate + max-iterations backstop, the max_parallelism
// ceiling, and the audit location. Same file, same fail-closed discipline as
// `## Eligibility` above: each knob names its own default (Assumption 6: the
// shipped default keeps unattended merge OFF) and its own HALT triggers.
describe('automation-policy.md — Auto-Advance section (story #250 T1)', () => {
  it.each(policySources)('%s: names the switch and its scope — risk:* tiers only', (_, content) => {
    expect(content).toContain('## Auto-Advance')
    expect(content.toLowerCase()).toMatch(/never a gate list/)
    expect(content).toContain('quality-model.md')
  })

  it.each(policySources)('%s: fail-closed default is `(none)` — auto-advance off', (_, content) => {
    const section = content.slice(
      content.indexOf('## Auto-Advance — which tiers'),
      content.indexOf('## Stop Predicate — when an unattended run stops'),
    )
    expect(section).toMatch(/\(none\)/)
    expect(section.toLowerCase()).toMatch(/shipped default/)
    expect(section.toLowerCase()).toMatch(/fail-closed/)
  })

  it.each(policySources)(
    '%s: yellow/red can never be named here — HALT triggers listed',
    (_, content) => {
      const section = content.slice(
        content.indexOf('## Auto-Advance — which tiers'),
        content.indexOf('## Stop Predicate — when an unattended run stops'),
      )
      expect(section).toMatch(/MUST HALT/)
      expect(section).toContain('risk:yellow')
      expect(section).toContain('risk:red')
    },
  )
})

describe('automation-policy.md — Stop Predicate section (story #250 T1)', () => {
  it.each(policySources)(
    '%s: grammar is `<selector> ⇒ <condition>` plus max-iterations',
    (_, content) => {
      const section = content.slice(
        content.indexOf('## Stop Predicate — when an unattended run stops'),
        content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
      )
      expect(section).toMatch(/<selector>/)
      expect(section).toMatch(/<condition>/)
      expect(section).toContain('max-iterations')
      expect(section.toLowerCase()).toMatch(/canonical macrostate/)
    },
  )

  it.each(policySources)('%s: fail-safe default is one iteration, no predicate', (_, content) => {
    const section = content.slice(
      content.indexOf('## Stop Predicate — when an unattended run stops'),
      content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
    )
    expect(section).toMatch(/max-iterations: 1/)
  })

  it.each(policySources)(
    '%s: rejects issue-body content and HALTs on malformed grammar',
    (_, content) => {
      const section = content.slice(
        content.indexOf('## Stop Predicate — when an unattended run stops'),
        content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
      )
      expect(section).toMatch(/MUST HALT/)
      expect(section.toLowerCase()).toMatch(/issue-body content/)
      expect(section).toContain('D18')
    },
  )
})

describe('automation-policy.md — Max Parallelism section (story #250 T1)', () => {
  it.each(policySources)(
    '%s: global integer ceiling with optional per-tier override',
    (_, content) => {
      const section = content.slice(
        content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
        content.indexOf('## Audit Location — where the unattended trail is written'),
      )
      expect(section.toLowerCase()).toMatch(/single positive integer/)
      expect(section.toLowerCase()).toMatch(/per-tier override/)
      expect(section.toLowerCase()).toMatch(/ceiling, never a target/)
    },
  )

  it.each(policySources)('%s: fail-safe default is 1 (fully sequential)', (_, content) => {
    const section = content.slice(
      content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
      content.indexOf('## Audit Location — where the unattended trail is written'),
    )
    expect(section).toMatch(/Absent file or absent section ⇒ `1`/)
  })

  it.each(policySources)('%s: malformed cap HALTs before any card is touched', (_, content) => {
    const section = content.slice(
      content.indexOf('## Max Parallelism — the parallel-batch ceiling'),
      content.indexOf('## Audit Location — where the unattended trail is written'),
    )
    expect(section).toMatch(/MUST HALT/)
    expect(section.toLowerCase()).toMatch(/before any card is touched/)
  })
})

describe('automation-policy.md — Audit Location section (story #250 T1)', () => {
  it.each(policySources)(
    '%s: a project-relative path resolved under working_path',
    (_, content) => {
      const auditIdx = content.indexOf('## Audit Location — where the unattended trail is written')
      const section = content.slice(
        auditIdx,
        content.indexOf('## Workflows — which workflow each tag routes to', auditIdx),
      )
      expect(section).toContain('working_path')
      expect(section).toContain('pair.config.json')
      expect(section.toLowerCase()).toMatch(/never an absolute path/)
      expect(section.toLowerCase()).toMatch(/appended\*\*, never overwritten/)
    },
  )

  it.each(policySources)(
    '%s: default destination + fail-loud on an unwritable path',
    (_, content) => {
      const auditIdx = content.indexOf('## Audit Location — where the unattended trail is written')
      const section = content.slice(
        auditIdx,
        content.indexOf('## Workflows — which workflow each tag routes to', auditIdx),
      )
      expect(section).toContain('automation/loop-audit.md')
      expect(section).toMatch(/MUST HALT the run/)
      expect(section.toLowerCase()).toMatch(/not an acceptable degraded mode/)
    },
  )
})

// Story #217 — tag-driven workflows. The mapping is ADOPTION data (`## Workflows`), the tag is an
// opaque routing key, and every safety property of the feature — untagged never runs, absent
// section is not an error, eligibility before routing, no silent choice on a multi-tag card, one
// run per card, an audit trail whose on-issue half belongs to the host adapter — is normative
// content pinned here rather than left to a reader's memory.
describe('automation-policy.md — Workflows section (story #217 T1)', () => {
  const workflowsSection = (content: string): string => {
    const start = content.indexOf('## Workflows — which workflow each tag routes to')
    expect(start).toBeGreaterThan(-1)
    return content.slice(start, content.indexOf('## Harness and Model Policy', start))
  }

  it.each(policySources)(
    '%s: the declaration is `<tag> ⇒ <workflow>`, one per line',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toContain('## Workflows\n\nauto-dev ⇒ pair-loop')
      expect(section).toMatch(/One entry per line/)
      expect(section).toMatch(/U\+21D2/)
      expect(section).toMatch(/ASCII `=>`/)
    },
  )

  it.each(policySources)(
    '%s: the tag is an opaque routing key, matched by string equality (D18)',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/OPAQUE routing key/)
      expect(section).toContain('D18')
      expect(section).toMatch(/string equality/)
      expect(section).toMatch(/no classification criteria anywhere in the routing code/i)
    },
  )

  it.each(policySources)(
    '%s: the workflow is a skill name resolved against the installed set',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/workflow is a skill name/)
      expect(section).toMatch(/composition of existing skills/)
      expect(section).toMatch(/installed/)
    },
  )

  it.each(policySources)(
    '%s: untagged ⇒ never, with no default workflow anywhere',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/Untagged ⇒ never/)
      expect(section).toMatch(/no default workflow/)
      expect(section).toMatch(/MUST\*{0,2} skip it and log the skip/)
    },
  )

  it.each(policySources)(
    '%s: absent section is opt-out, not an error — exit cleanly',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/no mapping declared/)
      expect(section).toMatch(/exit cleanly/)
      expect(section).toMatch(/never an error/)
      expect(section).toMatch(/Absent section ≠ empty section/)
    },
  )

  it.each(policySources)(
    '%s: eligibility is applied BEFORE routing, and the skip is logged',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/Eligibility is applied BEFORE routing/)
      expect(section).toMatch(/skipped before its tags are looked at/)
      expect(section).toMatch(/logged/)
    },
  )

  it.each(policySources)(
    '%s: unknown workflow and undecidable multi-tag both HALT',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/workflow is not installed ⇒ HALT/)
      expect(section).toMatch(/Never a silent fall back/)
      expect(section).toMatch(/two or more mapped tags with no `Precedence:` line/)
      expect(section).toMatch(/MUST HALT|⇒ HALT/)
    },
  )

  it.each(policySources)(
    '%s: one run per card — an exclusive lock, never a queue',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/exclusive per-card lock/)
      expect(section).toMatch(/skipped and logged/)
      expect(section).toMatch(/never queued/)
    },
  )

  it.each(policySources)(
    '%s: says what the lock does NOT cover — one working area, and no reaper',
    (_, content) => {
      const section = workflowsSection(content)
      // A reader who takes the lock for a cross-machine guard adds a second trigger outside the
      // host's concurrency group and gets two agents on one branch — the exact race it exists for.
      expect(section).toMatch(/scoped to ONE working area/)
      expect(section).toMatch(/ephemeral/)
      expect(section).toMatch(/concurrency group/)
      // ...and a lock nothing reaps turns automation silently off for one card, forever.
      expect(section).toMatch(/no timeout and nothing reaps it/)
      expect(section).toMatch(/where.*lock is and.*how long/i)
    },
  )

  it.each(policySources)(
    '%s: a mapping naming an uninstalled workflow stops the WHOLE board',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/before\*{0,2} eligibility and routing/)
      expect(section).toMatch(/every\*{0,2} card/)
    },
  )

  it.each(policySources)(
    '%s: the audit trail keeps host credentials out of the core',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/start.*skip.*end|start\*\*, \*\*skip\*\*, \*\*end/)
      expect(section).toContain('## Audit Location')
      expect(section).toMatch(/host adapter/)
      expect(section).toMatch(/never holds a tracker token/)
      // ONLY the start is posted on the card. A skip comment per unmapped label edit is the noise
      // this narrow reading exists to avoid, and leaving it implicit is how a future adapter author
      // re-derives an `end` comment from the job's exit status.
      expect(section).toMatch(/and \*\*only\*\* the start record/)
      expect(section).toMatch(/skip and an end stay in the file/)
    },
  )

  it.each(policySources)('%s: the file index names the seventh section', (_, content) => {
    expect(content).toMatch(/It specifies seven sections/)
    expect(content).toMatch(/`## Workflows` \(#217\)/)
  })

  it.each(policySources)(
    '%s: eligibility selects, the mapping routes — stated as disjoint',
    (_, content) => {
      expect(content).toMatch(/Which workflow runs on an eligible card/)
    },
  )
})

// Story #217 T4 — what the KB SHIPS around the schema, as opposed to the schema itself.
//
// Two deliverables, and they answer the two questions a maintainer has after reading the grammar:
// *which workflow do I map a tag to* (a catalog of workflows that exist, so nobody invents a skill
// name) and *what fires the dispatch on my host* (the thin per-host adapter, which is where the
// tracker credentials live and where the on-issue comment is actually posted — the half ADR-024
// deliberately kept out of the driver).
describe('automation-policy.md — the workflow catalog (story #217 T4)', () => {
  const workflowsSection = (content: string): string => {
    const start = content.indexOf('## Workflows — which workflow each tag routes to')
    expect(start).toBeGreaterThan(-1)
    return content.slice(start, content.indexOf('## Harness and Model Policy', start))
  }

  /** The workflow named in each row of the catalog TABLE — never prose that merely mentions one. */
  const catalogRows = (content: string): string[] =>
    [...workflowsSection(content).matchAll(/^\| `(pair-[a-z0-9-]+)` \|/gm)].map(match => match[1]!)

  it.each(policySources)('%s: ships example workflows a mapping can name', (_, content) => {
    const section = workflowsSection(content)
    expect(section).toMatch(/### The workflows a mapping can name/)
    // A catalog whose entries are not installable skill names is worse than none: it reads as
    // authoritative and every tag mapped from it HALTs on the uninstalled-workflow rule.
    expect(catalogRows(content)).toEqual(['pair-loop', 'pair-process-plan-tasks'])
  })

  /**
   * A dispatched workflow runs with NOBODY WATCHING — so it may not need anybody.
   *
   * The excluded case, concretely: a team copies the guideline's own example into
   * `tech/automation.md` and labels Draft card 304 `auto-refine` + `risk:green`. The trigger fires
   * `pair run --card 304 --card-tags "auto-refine,risk:green" --autonomous`; the driver takes 304's
   * exclusive lock, appends `event=start`, prints the `DISPATCH-RECORD:` line the adapter posts as a
   * public comment on the card, and spawns the workflow under `bypassPermissions`. If that workflow
   * mandates explicit human alignment, the run either stalls on a question no one answers until the
   * per-iteration timeout — holding the lock, on a card publicly claiming a run started — or the
   * agent answers itself and satisfies the very authorization gate the skill says is never skipped.
   *
   * So the rule is a property of the CATALOGUED SKILLS, checked against their own SKILL.md rather
   * than against the prose that describes them: putting a row back is a failing test here.
   */
  it.each(policySources)(
    '%s: every catalogued workflow can finish with nobody watching',
    (_, content) => {
      for (const workflow of catalogRows(content)) {
        const slug = workflow.replace(/^pair-/, '')
        const file = [
          join(REPO_ROOT, '.claude/skills', workflow, 'SKILL.md'),
          join(REPO_ROOT, '.skills', slug, 'SKILL.md'),
        ].find(candidate => existsSync(candidate))
        expect(file, `${workflow} is catalogued but has no SKILL.md in this repo`).toBeDefined()

        const skill = read(file!)
        for (const marker of [
          /Human-judgment gate/,
          /explicit human "yes"/,
          /explicit human alignment/,
        ]) {
          expect(
            skill,
            `${workflow} requires an explicit human decision (${marker.source}), so a tag must not route an unattended card to it`,
          ).not.toMatch(marker)
        }
      }

      // ...and the rule itself, at the surface a team reads before widening the table.
      const section = workflowsSection(content)
      expect(section).toMatch(/A workflow that needs a human in the room is not mappable/)
      // The exclusion is named, so nobody re-adds the row believing it was an oversight.
      expect(section).toMatch(/`pair-process-refine-story` is the concrete exclusion/)
    },
  )

  /**
   * The catalog is what a team copies from — `auto-plan ⇒ pair-process-plan-tasks` appears
   * verbatim here, in adoption-files.mdx and in the tutorial. A catalogued workflow that the
   * dispatcher cannot hand the card to is worse than an absent one: the `pair-process-*` row
   * selects the highest-priority story on the board when its `$story` is absent, so a card passed
   * under a name it does not declare is never seen, while the audit trail and the
   * `DISPATCH-RECORD:` comment both name the card that WAS tagged.
   */
  it.each(policySources)(
    '%s: names the argument each catalogued workflow receives the card as — the one it declares',
    (_, content) => {
      const section = workflowsSection(content)
      const rows = [
        ...section.matchAll(/^\| `(pair-[a-z0-9-]+)` \|[^\n]*\| `(--[a-z-]+) <card>` \|/gm),
      ]
      // Two rows today; the assertion is that EVERY row carries the column, not how many.
      expect(rows.length).toBe([...section.matchAll(/^\| `pair-[a-z0-9-]+` \|/gm)].length)
      expect(rows.length).toBeGreaterThan(1)

      for (const [, workflow, parameter] of rows) {
        const slug = workflow!.replace(/^pair-/, '')
        const file = [
          join(REPO_ROOT, '.claude/skills', workflow!, 'SKILL.md'),
          join(REPO_ROOT, '.skills', slug, 'SKILL.md'),
        ].find(candidate => existsSync(candidate))
        expect(file, `${workflow} is catalogued but has no SKILL.md in this repo`).toBeDefined()

        // `$story` (documentation form) and `--story` (invocation form) are one argument, per the
        // ADL of 2026-08-28. What must not happen is the catalog naming a third thing.
        const name = parameter!.replace(/^--/, '')
        expect(
          read(file!),
          `${workflow} does not declare \`${parameter}\` — the catalog promises a scope it cannot receive`,
        ).toMatch(new RegExp(`\\|\\s*\`(?:\\$|--)${name}\``))
      }

      // ...and the rule that makes the column load-bearing rather than decorative: the table IS
      // the mappable set, and a workflow outside it HALTs.
      expect(section).toMatch(/MUST HALT\*\* on a mapped workflow this table does not list/)
      // The direction a reader gets wrong on their own: knowing how a skill spells its scope is
      // not what makes a tag allowed to route a card to it (`pair-next` is scopable and unmappable).
      expect(section).toMatch(/Being scopable is not enough to be mappable/)
    },
  )

  /**
   * The schema bullet and the catalog section must state ONE rule, not two.
   *
   * The bullet is where a team writing its first mapping stops reading. Saying only "resolved
   * against the installed skill set" there licensed `auto-review ⇒ pair-process-review` — an
   * installed skill, so legal by that sentence — and the next trigger on ANY card, including
   * untagged and ineligible ones, HALTed the whole board on a mapping the schema had blessed.
   */
  it.each(policySources)(
    '%s: the schema bullet carries the catalog restriction, not just "installed"',
    (_, content) => {
      const section = workflowsSection(content)
      const bullet = /^- \*\*The workflow is a skill name\*\*[^\n]*$/m.exec(section)
      expect(
        bullet,
        'the `## Workflows` schema no longer has a workflow-name bullet',
      ).not.toBeNull()

      const text = bullet![0]
      expect(text).toMatch(/installed/)
      // Both halves, in the bullet itself — a reader who never reaches the catalog section must
      // not come away thinking any installed skill is mappable.
      expect(text).toMatch(/catalog|The workflows a mapping can name/)
      expect(text).toMatch(/refus/i)
      // ...and the claim this replaced, which the same PR's own code made false.
      expect(text).not.toMatch(/no workflow catalog/)
    },
  )

  it.each(policySources)(
    '%s: every workflow the catalog names is a skill this repo actually ships',
    (_, content) => {
      const section = workflowsSection(content)
      // Every `⇒ <workflow>` in the section — the example mappings AND the catalog — resolved
      // against the skills on disk. A renamed skill fails here, on the file that renamed it.
      const named = [...section.matchAll(/⇒ (pair-[a-z0-9-]+)/g)].map(m => m[1]!)
      expect(named.length).toBeGreaterThan(0)
      for (const workflow of new Set(named)) {
        const slug = workflow.replace(/^pair-/, '')
        expect(
          existsSync(join(REPO_ROOT, '.claude/skills', workflow, 'SKILL.md')) ||
            existsSync(join(REPO_ROOT, '.skills', slug, 'SKILL.md')),
          `\`## Workflows\` names ${workflow}, which is not a skill in this repo`,
        ).toBe(true)
      }
    },
  )

  it.each(policySources)(
    '%s: points at the host adapter rather than restating it',
    (_, content) => {
      const section = workflowsSection(content)
      expect(section).toMatch(/github-automation\.md/)
    },
  )
})

describe('automation README — indexes the mapping next to the eligibility filter (story #217 T4)', () => {
  it.each(readmeSources)('%s README: lists the `## Workflows` section', (_, content) => {
    expect(content).toMatch(/## Workflows/)
  })
})

describe('docs site — tag-driven dispatch is documented where an operator looks (story #217 T4)', () => {
  const adoptionDocs = read(join(DOCS, 'concepts/adoption-files.mdx'))
  const cliDocs = read(join(DOCS, 'reference/cli/commands.mdx'))
  const tutorial = read(join(DOCS, 'tutorials/unattended-delivery.mdx'))

  it('adoption-files.mdx documents the `## Workflows` section and its opt-in boundary', () => {
    expect(adoptionDocs).toContain('## Workflows')
    expect(adoptionDocs).toMatch(/no mapped tag/)
    expect(adoptionDocs).toMatch(/no mapping declared/)
  })

  it('commands.mdx documents both dispatch flags in the `run` option table', () => {
    const run = cliDocs.slice(cliDocs.indexOf('## run'), cliDocs.indexOf('## Global Options'))
    expect(run).toMatch(/`--card <id>`/)
    expect(run).toMatch(/`--card-tags <list>`/)
    expect(run).toMatch(/### Tag-driven dispatch/)
    // The three things that make it safe, at the surface an operator reads before wiring a trigger.
    expect(run).toMatch(/untagged/i)
    expect(run).toMatch(/per-card lock/)
    expect(run).toMatch(/DISPATCH-RECORD/)
  })

  it('the unattended-delivery tutorial shows the trigger-driven variant', () => {
    expect(tutorial).toMatch(/## Workflows/)
    expect(tutorial).toMatch(/pair run --card/)
  })

  it('every surface counts the policy file the way the guideline does', () => {
    // A reader who completed Step 1 believing they have six sections, then told to add "a sixth",
    // cannot tell whether they are adding one or editing one — in the tutorial whose whole subject
    // is a fail-closed policy file where a mis-declared section HALTs the run. The concepts page is
    // the OTHER end of the same path (Option D links to it for the mapping), so a reader told seven
    // on one page and six on the other cannot tell which surface is incomplete.
    const [policy] = policySources.map(([, content]) => content)
    const declared = /It specifies (\w+) sections/.exec(policy!)![1]!
    const capitalised = `${declared[0]!.toUpperCase()}${declared.slice(1)}`

    expect(tutorial).toContain(`${capitalised} independent`)
    // ...and the section Option D adds is numbered off that same count, not off Step 1's listing.
    expect(tutorial).toContain(`the ${declared}th`)

    expect(adoptionDocs).toContain(`${declared} independent sections`)
    // Both surfaces omit the same section, so both must say which one and where it is documented —
    // otherwise the count and the listing disagree with no way to tell why.
    for (const surface of [tutorial, adoptionDocs]) {
      expect(surface).toMatch(/`## Harness` \/ `## Model Policy`/)
    }
  })

  it('the tutorial does not sell the per-card lock as the guard on ephemeral runners', () => {
    // Option D is the CI-triggered path, where every job checks out a fresh workspace and the
    // lock cannot see another job's holder — the host concurrency group is the guard there.
    const wrapped = tutorial.replace(/\s+/g, ' ')
    expect(wrapped).toMatch(/lock is scoped to one working area/i)
    expect(wrapped).toMatch(/concurrency group\s*.{0,12}is the guard/)
  })
})
