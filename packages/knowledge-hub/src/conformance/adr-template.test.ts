import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for the ADR template's **amended-Status** convention
// (dataset x root mirror), plus the two KB documents that normatively enumerate
// ADR Status and must therefore carry the same enum.
//
// Why this file exists: #388 round 4 decided that an ADR whose normative
// contract later changes keeps its identity and says so above the fold
// (`Accepted (amended YYYY-MM-DD — <what changed>)`) instead of being
// superseded, and registered it in the template. Round 5 found the convention
// pinned nowhere — unlike every other doc-layer rule this PR introduced — so a
// later template edit could silently revert it while the whole suite stayed
// green. It also found the enum registered in the template ONLY, while
// `decision-records.md` and `adr-process.md` still enumerated the old four
// values; those two are asserted here so the three copies cannot drift apart.
//
// One file per target artifact, per ADL 2026-07-18-conformance-test-per-file-not-per-story.

const DATASET_KB = join(__dirname, '../../dataset/.pair/knowledge')
const MIRROR_KB = join(__dirname, '../../../../.pair/knowledge')

const ADR_TEMPLATE_REL = 'guidelines/collaboration/templates/adr-template.md'
const DECISION_RECORDS_REL = 'guidelines/collaboration/decision-records.md'
const ADR_PROCESS_REL = 'guidelines/architecture/decision-frameworks/adr-process.md'

const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf-8')

/** dataset + root mirror, so a fix applied to one side only fails here. */
const bothCopies = (rel: string): Array<[string, string]> => [
  ['dataset', read(DATASET_KB, rel)],
  ['root mirror', read(MIRROR_KB, rel)],
]

describe('ADR template — amended-Status convention (#281 round 4, pinned round 5)', () => {
  for (const [label, template] of bothCopies(ADR_TEMPLATE_REL)) {
    it(`${label} offers the amended form in the Status enum`, () => {
      // The amendment date and "what changed" are both part of the form: a bare
      // `Accepted (amended)` would not tell a reader which decision moved.
      expect(template).toMatch(/Accepted \(amended YYYY-MM-DD[^)]*<what changed>\)/)
    })

    it(`${label} keeps the four original Status values alongside it`, () => {
      // The amended form is additive — it must not have replaced an existing value.
      for (const value of [/Proposed/, /Accepted/, /Deprecated/, /Superseded by ADR-/]) {
        expect(template).toMatch(value)
      }
    })

    it(`${label} states that an amended ADR keeps its identity rather than being superseded`, () => {
      expect(template).toMatch(/keeps its identity[\s\S]{0,80}not superseded/i)
    })

    it(`${label} requires the amendment above the fold and inline where the contract lives`, () => {
      expect(template).toMatch(/above the fold/i)
      expect(template).toMatch(/amendment[\s\S]{0,120}inline in the body/i)
    })

    it(`${label} forbids reading a pre-amendment contract the amendment contradicts`, () => {
      // The load-bearing half: without the pointer, a reader can still take the
      // superseded contract from a section the amendment silently narrowed.
      expect(template).toMatch(/never take the pre-amendment contract[\s\S]{0,200}pointer to it/i)
    })

    it(`${label} carries the optional amended date beside the original Date`, () => {
      expect(template).toMatch(/YYYY-MM-DD \[\(amended YYYY-MM-DD\)\]/)
    })
  }
})

describe('ADR Status enum is consistent across every document that enumerates it', () => {
  for (const [label, doc] of bothCopies(DECISION_RECORDS_REL)) {
    it(`decision-records.md (${label}) enumerates the amended form`, () => {
      expect(doc).toMatch(/Accepted \(amended YYYY-MM-DD[^)]*<what changed>\)/)
    })

    it(`decision-records.md (${label}) says an amended ADR keeps its original Date`, () => {
      expect(doc).toMatch(/keeps its original \*\*Date\*\*/i)
    })
  }

  for (const [label, doc] of bothCopies(ADR_PROCESS_REL)) {
    it(`adr-process.md (${label}) enumerates the amended form in its Status line`, () => {
      expect(doc).toMatch(/Accepted \(amended YYYY-MM-DD\)/)
    })
  }
})
