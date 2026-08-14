import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #351 — guided authoring of the two
// `tech/risk-matrix.md` adoption-delta sections (`## Criticality Table`,
// `## Overrides`) inside `bootstrap`.
//
// The third section, `## Tag Projection`, already has a guided path:
// `/classify` self-proposes it on first run (quality-model §5). The other two
// had none — a project had to hand-copy them from `risk-matrix-example.md`.
// This phase closes that gap WITHOUT making the delta expected: the file is
// optional by design (quality-model §6, D21), so declining stays a fully
// supported outcome and no Definition of Done may come to require it.
//
// Position is load-bearing: the phase runs AFTER Phase 3.5 (Domain Modeling),
// so the Criticality Table's rows are PROPOSED from the subdomains just mapped
// instead of asked from nothing (AC5). At Step 3.1 the domain model does not
// exist yet, which is exactly the friction this story removes.

const ROOT = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')
const DATASET_DIR = join(DATASET, '.skills/process/bootstrap')
const MIRROR_DIR = join(ROOT, '.claude/skills/pair-process-bootstrap')

const read = (p: string): string => readFileSync(p, 'utf-8')
const datasetSkill = (): string => read(join(DATASET_DIR, 'SKILL.md'))
const datasetDefaults = (): string => read(join(DATASET_DIR, 'quick-mode-defaults.md'))
const mirrorSkill = (): string => read(join(MIRROR_DIR, 'SKILL.md'))

const CHECKLIST_REL = '.pair/knowledge/assets/bootstrap-checklist.md'
const QUALITY_MODEL_REL = '.pair/knowledge/guidelines/quality-assurance/quality-model.md'

/** A top-level `## N. …` section of the quality model, heading excluded. */
const qualityModelSection = (base: string, n: number): string => {
  const doc = read(join(base, QUALITY_MODEL_REL))
  const after = doc.split(new RegExp(`^## ${n}\\. .*$`, 'm'))[1] ?? ''
  // stop at the next NUMBERED section: §6 embeds a fenced example whose lines
  // start with `## Tag Projection`, which a bare `^## ` split would cut on.
  return after.split(/^## \d+\. /m)[0]
}

/** The `### Step 3.6.x` body, heading included, up to the next `##`/`###`. */
const stepBody = (skill: string, step: string): string => {
  const lines = skill.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (new RegExp(`^###\\s+Step\\s+${step.replace(/\./g, '\\.')}:`).test(line)) {
      inside = true
      out.push(line)
      continue
    }
    if (inside && /^#{2,3}\s/.test(line)) break
    if (inside) out.push(line)
  }
  return out.join('\n')
}

/** A `## Phase X` body: from its heading to the next `## ` heading. */
const phaseSection = (skill: string, heading: RegExp): string => {
  const lines = skill.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (heading.test(line)) {
      inside = true
      out.push(line)
      continue
    }
    if (inside && /^##\s/.test(line)) break
    if (inside) out.push(line)
  }
  return out.join('\n')
}

/** Phase 3.6's own body: from its heading to the next `## ` heading. */
const phaseBody = (skill: string): string => phaseSection(skill, /^##\s+Phase 3\.6/)

/** Contiguous `>`-blockquote blocks of a body, in order. */
const blockquoteBlocks = (body: string): string[] => {
  const blocks: string[] = []
  let current: string[] = []
  for (const line of body.split('\n')) {
    if (/^\s*>/.test(line)) {
      current.push(line)
    } else if (current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

/** Blockquote blocks that actually ask something (a line ending in `?`). */
const blockquoteQuestions = (body: string): string[] =>
  blockquoteBlocks(body).filter(b => /\?\s*$/m.test(b))

describe('the phase exists and sits after Phase 3.5 (positioning, AC5)', () => {
  it('declares Phase 3.6 between Phase 3.5 and Phase 4', () => {
    const c = datasetSkill()
    const p35 = c.indexOf('## Phase 3.5: Domain Modeling')
    const p36 = c.search(/^## Phase 3\.6/m)
    const p4 = c.indexOf('## Phase 4: Finalization')
    expect(p35).toBeGreaterThan(-1)
    expect(p36, 'Phase 3.6 not found').toBeGreaterThan(-1)
    expect(p36).toBeGreaterThan(p35)
    expect(p4).toBeGreaterThan(p36)
  })

  // Position in the document is NOT reachability. Phase 3.6 was inserted
  // between 3.5 and 4 while every exit path of the immediately preceding step
  // (not installed / already populated / normal completion) still said
  // "proceed to Phase 4" — so an executor following the algorithm's own
  // routing statements jumps straight to Finalization and the phase never runs.
  it('routes INTO Phase 3.6 from the phase it follows — no exit of 3.5 reaches Phase 4', () => {
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const p35 = phaseSection(skill, /^##\s+Phase 3\.5/)
      expect(p35, 'Phase 3.5 section not found').toMatch(/Step 3\.5\.2/)
      expect(p35, 'a step inside Phase 3.5 still routes to Phase 4').not.toMatch(/Phase 4/)
      // the LAST routing target stated by a numbered step of the phase is 3.6
      // (prose outside the algorithm can name the phase for other reasons)
      const targets =
        p35
          .split('\n')
          .filter(l => /^\d+\.\s/.test(l))
          .join('\n')
          .match(/Phase (?:3\.\d|4)/g) ?? []
      expect(targets.at(-1), 'the last routing target of Phase 3.5 must be Phase 3.6').toBe(
        'Phase 3.6',
      )
    }
  })

  // Same defect class one phase earlier: Step 3.2's "already configured" skip
  // jumped to Phase 4, bypassing domain modeling AND the delta on every re-run
  // of a project whose Custom Gate Registry is already populated.
  it('does not let Step 3.2’s already-configured skip bypass Phases 3.5 and 3.6', () => {
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const skip =
        stepBody(skill, '3.2')
          .split('\n')
          .find(l => /^\d+\.\s+\*\*Skip\*\*/.test(l)) ?? ''
      expect(skip, 'no Skip item in Step 3.2').not.toBe('')
      expect(skip, 'Step 3.2 must hand control to Phase 3.5, not past it').toMatch(/Phase 3\.5/)
    }
  })

  it('carries one step per owned section — criticality table and overrides', () => {
    const c = datasetSkill()
    expect(c).toMatch(/^###\s+Step 3\.6\.1:.*Criticality Table/m)
    expect(c).toMatch(/^###\s+Step 3\.6\.2:.*Overrides/m)
  })

  it('proposes the rows from Phase 3.5 output, each with a recommendation and a reason (AC5)', () => {
    const step = stepBody(datasetSkill(), '3.6.1')
    expect(step).toMatch(/Phase 3\.5/)
    expect(step.toLowerCase()).toMatch(/subdomain/)
    expect(step.toLowerCase()).toMatch(/bounded context|boundedcontext/)
    // recommendation-first: candidate rows come pre-filled with a proposed
    // criticality plus WHY, so the developer confirms or edits — never invents.
    expect(step.toLowerCase()).toMatch(/recommend/)
    expect(step.toLowerCase()).toMatch(/reason|rationale|why/)
    expect(step.toLowerCase()).toMatch(/confirm|edit/)
  })

  it('degrades to repository-derived services when 3.5 is absent, empty staying valid (AC6)', () => {
    const step = stepBody(datasetSkill(), '3.6.1').toLowerCase()
    expect(step).toMatch(/skipped|absent|not installed|no domain/)
    expect(step).toMatch(/workspace|deployable|package/)
    expect(step).toMatch(/empty answer is a valid|empty table is a valid/)
  })

  // "an empty table is a valid answer" is only true of an empty ANSWER. A
  // written-but-rowless `## Criticality Table` is an EXISTING table in which
  // every service is unlisted ⇒ conservative High (§6) — the opposite of the
  // reassurance. The write item must therefore refuse to create a rowless one.
  it('says which "empty" is the safe one — no section written, not a rowless section', () => {
    const step = stepBody(datasetSkill(), '3.6.1').toLowerCase()
    expect(step, 'the safe empty must be "no section at all"').toMatch(
      /no section (at all|is written|written)/,
    )
    expect(step, 'a rowless written table must be named as the unsafe one').toMatch(
      /rowless|written-but-rowless|written but rowless/,
    )
    expect(step, 'the section is created only when a row is confirmed').toMatch(
      /only (when|if) at least one row is confirmed/,
    )
  })
})

describe('the guided question-set covers both sections (AC1)', () => {
  it('interviews on the criticality dimension in Step 3.6.1', () => {
    const step = stepBody(datasetSkill(), '3.6.1')
    // a real blockquote question, not just prose about asking one
    expect(step).toMatch(/^\s*>.*\?\s*$/m)
  })

  it('interviews on thresholds AND per-tier reviewer/SLA in Step 3.6.2', () => {
    const step = stepBody(datasetSkill(), '3.6.2')
    expect(step).toMatch(/^\s*>.*\?\s*$/m)
    expect(step.toLowerCase()).toMatch(/threshold/)
    expect(step.toLowerCase()).toMatch(/reviewer/)
    expect(step.toLowerCase()).toMatch(/sla/)
  })

  it('asks one recommendation at a time rather than dumping a form', () => {
    expect(phaseBody(datasetSkill()).toLowerCase()).toMatch(
      /one (question|recommendation) at a time/,
    )
  })

  // AC1 is about the SHAPE of the illustrated prompt, not only about prose
  // claiming one-at-a-time: an executor copies the blockquote verbatim. Two
  // override families bundled into one compound question is the failure mode.
  it('splits Step 3.6.2 into two separate override questions, never one compound prompt', () => {
    const questions = blockquoteQuestions(stepBody(datasetSkill(), '3.6.2'))
    expect(questions, 'Step 3.6.2 must carry two blockquote questions').toHaveLength(2)
    const [thresholds, reviewers] = questions.map(q => q.toLowerCase())
    expect(thresholds).toMatch(/threshold/)
    expect(thresholds, 'the threshold question must not also ask about reviewers').not.toMatch(
      /reviewer|sla/,
    )
    expect(reviewers).toMatch(/reviewer/)
    expect(reviewers).toMatch(/sla/)
  })

  // the reviewer/SLA overrides only bind a merge with `Review enforcement:
  // enabled` — which Step 3.2 defaults to `disabled`. Without saying so, the
  // prompt reads as configuring a merge gate.
  it('says the reviewer/SLA overrides bind a merge only with Review enforcement enabled', () => {
    const step = stepBody(datasetSkill(), '3.6.2')
    expect(step).toMatch(/Review enforcement/)
    expect(step.toLowerCase()).toMatch(/merge-binding|required check/)
  })

  // `enabled` is a reachable outcome of Step 3.2's own question, so the prompt
  // may not assert the `disabled` default as recorded fact: in an enabled
  // project it would tell the developer these are not merge-binding at the
  // exact moment they decide whether to override them.
  it('renders the recorded Review enforcement value instead of asserting `disabled`', () => {
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const question =
        blockquoteQuestions(stepBody(skill, '3.6.2')).find(q => /reviewer|sla/i.test(q)) ?? ''
      expect(question, 'no reviewer/SLA question').not.toBe('')
      expect(question, 'the recorded value must be rendered, not asserted').toMatch(
        /Review enforcement: *`?\[/,
      )
      expect(question.toLowerCase(), 'the `enabled` branch is not stated').toMatch(/enabled/)
      expect(question.toLowerCase(), 'the `disabled` branch is not stated').toMatch(/disabled/)
      expect(question, 'still claims Step 3.2 recorded `disabled`').not.toMatch(
        /`disabled` default Step 3\.2 just recorded/i,
      )
      // ...and the directive that says so is addressed to the EXECUTOR, so it
      // belongs in the numbered item, not inside the text the developer is
      // shown verbatim (the file's convention: quotes carry substitutable
      // placeholders, items carry instructions).
      expect(question, 'an executor directive leaked into the developer-facing quote').not.toMatch(
        /never assume it/i,
      )
      const item =
        stepBody(skill, '3.6.2')
          .split('\n')
          .find(l => /^\d+\.\s+\*\*Act — per-tier reviewer/.test(l)) ?? ''
      expect(item, 'no reviewer/SLA item lead-in').not.toBe('')
      expect(item, 'the render-it directive is nowhere in the item’s prose').toMatch(
        /never assume it/i,
      )
    }
  })

  // a full-catalog offer (Phase 3.5 runs at `$scope: all`) must not read as a
  // form to complete: one gate question before the row loop, not N prompts.
  it('gates the row loop on a single up-front "author the table at all?" question', () => {
    const step = stepBody(datasetSkill(), '3.6.1')
    const questions = blockquoteQuestions(step)
    expect(questions.length, 'a gate question plus the per-row question').toBeGreaterThanOrEqual(2)
    const gate = questions[0].toLowerCase()
    expect(gate).toMatch(/skip the table|author the table/)
    // semantics, not one phrasing: the offer must read as prunable, not as a form
    expect(step.toLowerCase()).toMatch(/list to prune|keep only some|not a form to complete/)
    // the gate is asked BEFORE the per-row walk
    expect(step.indexOf(questions[0])).toBeLessThan(step.search(/one recommendation at a time/))
  })

  // Pruning is NOT neutral: absent table ⇒ Medium for everyone, but a service
  // unlisted in an EXISTING table ⇒ conservative High (§6). An executor copies
  // the blockquotes verbatim, so the consequence has to live inside them —
  // not only in the prose of item 3.
  it('states the not-listed⇒High consequence inside both prune/drop prompts', () => {
    const questions = blockquoteQuestions(stepBody(datasetSkill(), '3.6.1'))
    expect(questions.length, 'gate question plus per-row question').toBeGreaterThanOrEqual(2)
    for (const q of questions.slice(0, 2)) {
      const lower = q.toLowerCase()
      expect(lower, `prompt does not name the High consequence: ${q}`).toMatch(
        /conservative \*\*high\*\*|conservative high/,
      )
      expect(lower, `prompt does not say dropping is not neutral: ${q}`).toMatch(
        /not neutral|unlisted/,
      )
    }
  })

  // the gate prompt is fixed text, but the candidates have two possible
  // sources (Phase 3.5's catalogs, or the repository) — claiming a domain
  // model that does not exist is exactly what the copied-verbatim convention
  // makes harmful.
  it('parameterises the candidate source in the gate prompt', () => {
    const gate = blockquoteQuestions(stepBody(datasetSkill(), '3.6.1'))[0] ?? ''
    expect(gate.toLowerCase()).toMatch(
      /domain model \| the workspaces|workspaces in this repository/,
    )
  })

  // one key space: two catalogs at different granularities must not both
  // supply rows, since an unlisted/near-miss key resolves to conservative High.
  it('names one key space and de-duplicates candidates into it', () => {
    const step = stepBody(datasetSkill(), '3.6.1').toLowerCase()
    expect(step, 'no statement of what supplies the key').toMatch(
      /suppl(?:y|ies) the keys?|keyed by/,
    )
    expect(step, 'no de-duplication rule across the two catalogs').toMatch(
      /once, not twice|never twice|de-?duplicat|one key never produces two rows/,
    )
    expect(step, 'the cost of a near-miss key is not stated').toMatch(
      /conservative \*\*high\*\*|conservative high/,
    )
  })

  // WRITE-side keys must be READ-side keys. The two catalogs Phase 3.5
  // produces name BUSINESS boundaries (this repo: development-collaboration,
  // knowledge-standards), while a diff resolves to a deployable (apps/website,
  // packages/pair-cli). A table keyed by the former leaves every queried key
  // unlisted ⇒ conservative High on every PR — strictly worse than declining
  // the offer. The catalogs may name candidates and recommend values; they may
  // not define the key space.
  it('keys the rows by what the read side resolves, not by a catalog name', () => {
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const step = stepBody(skill, '3.6.1').toLowerCase()
      expect(step, 'the key is not anchored to a deployable/workspace/path scope').toMatch(
        /deployable|workspace|top-level path/,
      )
      expect(step, 'the catalogs are not demoted to candidate/value sources').toMatch(
        /candidate names?|suggest the names?|name the candidates|supply the candidates/,
      )
      expect(step, 'the step does not cite the read-side key rule it depends on').toMatch(
        /§6|quality-model/,
      )
    }
  })

  // The recommended value must not be read off the subdomain class: §3.1
  // already spends that signal on the Business impact dimension, so deriving
  // criticality from it makes two of five dimensions carry one signal. The
  // criterion ITSELF lives in quality-model §6 (pinned in the cross-document
  // block below) — here the step must reach it, not restate it.
  it('recommends a value from the model’s criterion, never from the subdomain class', () => {
    const step = stepBody(datasetSkill(), '3.6.1').toLowerCase()
    expect(step, 'no criterion named at all').toMatch(
      /blast radius|data sensitivity|user-facing|uptime/,
    )
    expect(step, 'the step does not refuse the subdomain class as the source').toMatch(
      /not read off the subdomain class|not the subdomain class|explicitly not the subdomain/,
    )
  })

  // The degraded path (Phase 3.5 skipped or its catalogs empty) is a fully
  // supported state, but the step's only per-row prompt is hard-shaped as
  // "recommended `[x]`, because `[reason]`" and the phase declares itself
  // recommendation-first. Offering those rows bare leaves an executor to emit
  // a prompt with two empty slots — while §6's criterion (blast radius,
  // exposure, sensitivity, uptime) reads off a workspace package with no
  // domain model at all.
  it('recommends a value on the repository-derived rows too, not only the catalog ones', () => {
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const bullet =
        stepBody(skill, '3.6.1')
          .split('\n')
          .find(l => /Phase 3\.5 skipped/.test(l)) ?? ''
      expect(bullet, 'no degraded-path bullet').not.toBe('')
      expect(bullet, 'the degraded path still withholds the recommendation').not.toMatch(
        /without a recommendation/i,
      )
      expect(bullet.toLowerCase(), 'the degraded path states no recommendation rule').toMatch(
        /same[^.]*recommend|recommendation is unchanged|recommended the same way/,
      )
    }
  })
})

describe('write path reuses classify’s self-write, not /record-decision (AC2)', () => {
  const body = (): string => phaseBody(datasetSkill())

  it('names the propose-then-write-if-confirmed / config-registry pattern', () => {
    const c = body().toLowerCase()
    expect(c).toMatch(/propose-then-write-if-confirmed/)
    expect(c).toMatch(/registry/)
    expect(c).toMatch(/classify/)
  })

  it('states explicitly that it does NOT route through /record-decision', () => {
    expect(body()).toMatch(
      /(does\s+\*\*not\*\*|does not|never)\s+(route|go)\s+through[^.]*record-decision/i,
    )
  })

  it('writes to tech/risk-matrix.md and creates it with the confirmed sections only', () => {
    const c = body()
    expect(c).toContain('risk-matrix.md')
    expect(c.toLowerCase()).toMatch(
      /never a (full )?copy of the example|only the confirmed section/,
    )
  })

  it('owns two sections and leaves classify’s Tag Projection untouched', () => {
    expect(body()).toMatch(/Tag Projection[^.]*untouched|untouched[^.]*Tag Projection/i)
  })
})

// The phase's central claim is "same pattern as classify's Tag Projection
// write". Pinning that only inside bootstrap's own body lets the OTHER end of
// the reference rot silently: rename the pattern in the model, or move
// classify's write out of Step 5, and the claim becomes false with a green
// suite (`check:links` validates the file target, not the anchor or wording).
describe('the reused pattern still exists where bootstrap points (AC2, cross-document)', () => {
  const QUALITY_MODEL_REL = '.pair/knowledge/guidelines/quality-assurance/quality-model.md'

  it('quality-model.md still defines propose-then-write-if-confirmed under a `## 5.` heading', () => {
    for (const base of [ROOT, DATASET]) {
      const section = read(join(base, QUALITY_MODEL_REL)).split(/^## 5\. /m)[1]
      expect(section, `${base}: no '## 5.' heading in quality-model.md`).toBeDefined()
      expect((section ?? '').split(/^## /m)[0], `${base}: §5 body`).toMatch(
        /propose-then-write-if-confirmed/,
      )
    }
  })

  it('classify’s Step 5 still writes the `## Tag Projection` section', () => {
    const sources = [
      join(DATASET, '.skills/capability/classify/SKILL.md'),
      join(ROOT, '.claude/skills/pair-capability-classify/SKILL.md'),
    ]
    for (const path of sources) {
      const after = read(path).split(/^### Step 5:/m)[1]
      expect(after, `${path}: no '### Step 5:' heading`).toBeDefined()
      const step = (after ?? '').split(/^#{2,3}\s/m)[0]
      expect(step, `${path}: Step 5 no longer writes Tag Projection`).toContain('## Tag Projection')
      expect(step, `${path}: Step 5 no longer names the pattern`).toMatch(
        /propose-then-write-if-confirmed/,
      )
      expect(step, `${path}: Step 5 no longer targets risk-matrix.md`).toContain('risk-matrix.md')
    }
  })

  // The ADL claims the two-writer split is "discoverable rather than folklore"
  // BECAUSE skills-guide.md § Adoption Files carries the row. Unpinned, that
  // row can be deleted or rewritten with the suite green and the ADL still
  // asserting discoverability.
  it('skills-guide § Adoption Files names bootstrap as the writer of both sections', () => {
    for (const [base, bootstrap] of [
      [ROOT, '/pair-process-bootstrap'],
      [DATASET, '/bootstrap'],
    ] as const) {
      const guide = read(join(base, '.pair/knowledge/skills-guide.md'))
      const adoption = (guide.split('## Adoption Files')[1] ?? '').split(/^## /m)[0]
      expect(adoption, `${base}: no '## Adoption Files' section`).not.toBe('')
      const row =
        adoption.split('\n').find(l => l.startsWith('|') && l.includes('`tech/risk-matrix.md`')) ??
        ''
      expect(row, `${base}: no tech/risk-matrix.md row in § Adoption Files`).not.toBe('')
      expect(row, `${base}: the row does not name bootstrap as a writer`).toContain(bootstrap)
      expect(row, `${base}: the row does not name the owned sections`).toContain(
        '## Criticality Table',
      )
      expect(row, `${base}: the row does not name the owned sections`).toContain('## Overrides')
    }
  })

  // The write side cannot pick a key namespace the read side never defined.
  // §6 owns the schema, so it owns the answer to "what does a diff resolve to
  // as its service/domain?" — without it, every authored table is a guess.
  it('quality-model §6 defines the key the read side resolves a diff to', () => {
    for (const base of [ROOT, DATASET]) {
      const s6 = qualityModelSection(base, 6)
      expect(s6, `${base}: §6 not found`).toMatch(/Criticality Table/)
      expect(s6.toLowerCase(), `${base}: §6 states no key namespace`).toMatch(/key/)
      expect(s6.toLowerCase(), `${base}: §6 does not say what a diff resolves to`).toMatch(
        /deployable/,
      )
    }
  })

  // The commit adding how-to-02's Phase 2.6 argues "the how-to is the
  // orchestration flow of record, a phase living only in the skill would be
  // drift" — but nothing pinned the how-to. `check:links` validates neither
  // the phase's presence nor its pointer, so a renumber or a delete leaves the
  // suite green and reinstates exactly the drift the commit prevents.
  it('how-to-02 carries the classification-delta phase and points at bootstrap Phase 3.6', () => {
    const REL = '.pair/knowledge/how-to/02-how-to-complete-bootstrap-checklist.md'
    for (const [base, bootstrap] of [
      [ROOT, '/pair-process-bootstrap'],
      [DATASET, '/bootstrap'],
    ] as const) {
      const doc = read(join(base, REL))
      const heading = doc.split('\n').find(l => /^###\s+Phase 2\.6:/.test(l)) ?? ''
      expect(heading, `${base}: no Phase 2.6 in how-to-02`).not.toBe('')
      expect(heading.toLowerCase(), `${base}: Phase 2.6 is not the classification delta`).toMatch(
        /classification delta/,
      )
      // ...positioned between domain modeling and finalization, as in the skill
      const p25 = doc.search(/^###\s+Phase 2\.5:/m)
      const p26 = doc.search(/^###\s+Phase 2\.6:/m)
      const p3 = doc.search(/^###\s+Phase 3:/m)
      expect(p25, `${base}: no Phase 2.5`).toBeGreaterThan(-1)
      expect(p26).toBeGreaterThan(p25)
      expect(p3, `${base}: no Phase 3`).toBeGreaterThan(p26)
      const body = doc.slice(p26, p3)
      expect(body, `${base}: Phase 2.6 does not point at the skill's phase`).toContain(bootstrap)
      expect(body, `${base}: Phase 2.6 does not name Phase 3.6`).toMatch(/Phase 3\.6/)
    }
  })

  // The decision log is what a future author (or `/verify-adoption`)
  // re-derives the design from. Round 2 refused two things round 1 had
  // recorded — catalog-keyed rows, and a rowless table as a valid answer — so
  // an ADL still carrying them makes the record of record disagree with the
  // shipped behaviour, and the likeliest re-derivation reintroduces both.
  it('the positioning ADL’s Decision 1 matches what shipped (keys, empty answer)', () => {
    const adl = read(
      join(
        ROOT,
        '.pair/adoption/decision-log/2026-08-11-criticality-delta-is-authored-after-domain-modeling.md',
      ),
    )
    const decision1 = (adl.split(/^## Decision$/m)[1] ?? '').split(/^2\. /m)[0].toLowerCase()
    expect(decision1, 'no Decision 1 body').not.toBe('')
    expect(decision1, 'the catalogs are still stated as the key space').not.toMatch(
      /candidate rows \*\*are\*\* the subdomains|rows are the subdomains/,
    )
    expect(decision1, 'Decision 1 does not key the rows by the deployable').toMatch(/deployable/)
    expect(decision1, 'the catalogs are not demoted to candidate names/values').toMatch(
      /candidate|recommend/,
    )
    expect(decision1, 'an empty TABLE is still offered as valid').not.toMatch(
      /empty table stays a valid|empty table is a valid/,
    )
    expect(decision1, 'the empty ANSWER / no-section semantics are missing').toMatch(
      /empty answer|no section/,
    )
    expect(decision1, 'Decision 1 does not cross-reference the keying ADL').toMatch(
      /keyed-by-the-deployable|keying adl|2026-08-11-criticality-rows-are-keyed/,
    )
  })

  // One key is the degenerate case. The normal diff in a monorepo touches
  // SEVERAL deployables (this repo: `.claude/`, `.pair/`, `apps/website`,
  // `packages/knowledge-hub`), and with tier = max(dimensions) (§3.2) a rule
  // that leaves the choice to the executor makes the whole tier flip between
  // runs on identical code. The write side already states its multi-key rule
  // ("two contexts inside one deployable yield one row, at the higher value"),
  // so the read side's silence is the asymmetry.
  it('quality-model §6 resolves a multi-deployable change to the highest criticality', () => {
    for (const base of [ROOT, DATASET]) {
      const s6 = qualityModelSection(base, 6).toLowerCase()
      expect(s6, `${base}: §6 does not cover a change touching several deployables`).toMatch(
        /more than one deployable|several deployables|multiple deployables/,
      )
      expect(s6, `${base}: §6 states no highest-of rule`).toMatch(
        /\*\*highest\*\*|highest criticality|the highest of/,
      )
      expect(s6, `${base}: §6 does not say what an unlisted one contributes`).toMatch(
        /not listed[^.]*conservative high|unlisted[^.]*conservative high|contributes the conservative high/,
      )
    }
    // the copy-paste starting point states it too — it is the other authoring route
    for (const base of [ROOT, DATASET]) {
      const example = read(
        join(base, '.pair/knowledge/assets/risk-matrix-example.md'),
      ).toLowerCase()
      expect(example, `${base}: the example asset omits the multi-deployable rule`).toMatch(
        /highest/,
      )
    }
  })

  // `classify` builds the matrix TWICE (§3.2) — once at refinement, from story
  // context, before any code exists. "the deployable that owns the touched
  // files" has no referent there, so the first of the two classifications runs
  // on an executor's guess, and guessing "none" hits the unlisted⇒High branch
  // on a story nobody has written yet.
  it('quality-model §6 resolves the key at refinement time, not only from a diff', () => {
    for (const base of [ROOT, DATASET]) {
      const s6 = qualityModelSection(base, 6).toLowerCase()
      expect(s6, `${base}: §6 says nothing about the refinement-time resolution`).toMatch(
        /refinement/,
      )
      expect(s6, `${base}: §6 does not resolve the key from the story's declared scope`).toMatch(
        /declared scope|story scope|the story names|scope names/,
      )
      expect(
        s6,
        `${base}: a story naming no deployable is not routed to the file-absent default`,
      ).toMatch(/file-absent default|absent-file default/)
    }
  })

  // The H/M/L criterion is model semantics — how a project picks a value for a
  // §3.1 dimension. Living only in `bootstrap`, the OTHER authoring route (hand
  // -authoring from the example, which §6 calls equally valid) gets no criterion
  // at all, and a later §3.1/§6 criterion would be a second definition to align.
  it('quality-model §6 owns the H/M/L criterion, and the skill cites rather than redefines it', () => {
    for (const base of [ROOT, DATASET]) {
      const s6 = qualityModelSection(base, 6).toLowerCase()
      expect(s6, `${base}: §6 states no criterion of its own`).toMatch(
        /blast radius|data sensitivity|uptime/,
      )
      for (const value of ['high', 'medium', 'low']) {
        expect(s6, `${base}: §6 carries no explicit default for ${value}`).toMatch(
          new RegExp(`\\*\\*${value}\\*\\*[^\\n]*—|\\*\\*${value}\\*\\*[^\\n]*:`),
        )
      }
      expect(
        s6,
        `${base}: §6 does not warn that Business impact reads the subdomain class`,
      ).toMatch(/business impact/)
    }
    // the skill applies the mapping; it must not carry a second copy of it
    for (const skill of [datasetSkill(), mirrorSkill()]) {
      const step = stepBody(skill, '3.6.1')
      expect(step, 'the step does not cite the criterion’s owner').toMatch(
        /§6[^\n]*(criterion|choosing a value)|(criterion|choosing a value)[^\n]*§6/i,
      )
      expect(step.toLowerCase(), 'the step does not say it applies rather than defines').toMatch(
        /never re-?defines it|applies that mapping|one criterion, one owner/,
      )
    }
  })

  // The ADL claims this PR fixes the discoverability of the two delta sections;
  // the schema owner is the page a reader lands on first, so the pointer has to
  // exist THERE too — a pointer, never a restatement of the phase.
  it('quality-model §6 points at the guided authoring path for both delta sections', () => {
    for (const base of [ROOT, DATASET]) {
      const s6 = qualityModelSection(base, 6)
      for (const section of ['## Criticality Table', '## Overrides']) {
        const bullet = s6.split('\n').find(l => l.startsWith('- ') && l.includes(section)) ?? ''
        expect(bullet, `${base}: no §6 bullet for ${section}`).not.toBe('')
        expect(bullet, `${base}: ${section} bullet names no guided path`).toMatch(
          /pair-process-bootstrap/,
        )
        expect(bullet, `${base}: ${section} bullet does not name the phase`).toMatch(/Phase 3\.6/)
      }
    }
  })
})

describe('the flow is opt-in and never blocks (AC3)', () => {
  it('says declining writes nothing and degrades to KB defaults', () => {
    const c = phaseBody(datasetSkill()).toLowerCase()
    expect(c).toMatch(/declin|skip/)
    expect(c).toMatch(/writes nothing|nothing is written/)
    expect(c).toMatch(/kb default/)
    expect(c).toMatch(/d21|fully supported/)
  })

  it('states the absence of the file stays legitimate — no DoD may require it', () => {
    const c = phaseBody(datasetSkill()).toLowerCase()
    expect(c).toMatch(/never to make (the delta|it) (expected|mandatory)|not[^.]*expected/)
    expect(c).toMatch(/definition of done/)
  })

  it('adds no HALT condition of its own', () => {
    // the HALT list itself, not everything that follows it
    const halt = (datasetSkill().split('## HALT Conditions')[1] ?? '').split(/^## /m)[0]
    expect(halt.toLowerCase()).not.toMatch(/criticality|risk-matrix/)
  })

  it('the Definition of Done guidelines do not require the sections', () => {
    for (const rel of [
      '.pair/knowledge/guidelines/quality-assurance/quality-standards/definition-of-done.md',
      '.pair/knowledge/guidelines/collaboration/project-management-tool/definition-of-ready-and-done.md',
    ]) {
      for (const base of [ROOT, DATASET]) {
        expect(read(join(base, rel)), `${base}/${rel}`).not.toMatch(/Criticality Table/i)
      }
    }
  })
})

describe('idempotency — an authored file is never re-proposed (AC4)', () => {
  it('checks for the section first and skips when present', () => {
    for (const step of ['3.6.1', '3.6.2']) {
      const body = stepBody(datasetSkill(), step)
      expect(body, `Step ${step}`).toMatch(/\*\*Check\*\*/)
      expect(body.toLowerCase(), `Step ${step}`).toMatch(/already|present/)
      expect(body.toLowerCase(), `Step ${step}`).toMatch(/re-propose|do not propose|never propose/)
    }
  })

  it('registers the phase in the Idempotent Re-invocation list', () => {
    const section = datasetSkill().split('## Idempotent Re-invocation')[1] ?? ''
    expect(section).toMatch(/Criticality Table|risk-matrix/i)
  })

  // The phase claims classify's propose-then-write-if-confirmed pattern but
  // deliberately drops half of it: classify writes `Active: none` on a decline
  // so it never asks again, while a decline here writes nothing (AC3) and IS
  // re-offered. Undocumented, that reads as a bug against "never re-does
  // completed work" — so both the phase and the ADL must say it out loud.
  it('discloses that a decline is not recorded, unlike classify’s `Active: none`', () => {
    const section = datasetSkill().split('## Idempotent Re-invocation')[1] ?? ''
    for (const [where, body] of [
      ['Step 3.6.1', stepBody(datasetSkill(), '3.6.1')],
      ['Idempotent Re-invocation', section],
    ] as const) {
      expect(body, `${where}: does not name classify’s Active: none divergence`).toMatch(
        /Active: none/,
      )
      expect(body.toLowerCase(), `${where}: does not say a decline is not recorded`).toMatch(
        /not recorded|offers the candidates again|asked again/,
      )
    }
    const adl = read(
      join(
        ROOT,
        '.pair/adoption/decision-log/2026-08-11-criticality-delta-is-authored-after-domain-modeling.md',
      ),
    )
    const consequences = (adl.split('## Consequences')[1] ?? '').split(/^## /m)[0]
    expect(consequences, 'the ADL Consequences do not mirror the divergence').toMatch(
      /Active: none/,
    )
  })

  // the guard must be a PHASE-level precondition: behind the per-section
  // presence check it is bypassable — a malformed `## Criticality Table`
  // heading reads as "already authored", and Step 3.6.2 then writes into a
  // file the phase declared it does not trust (and whose write is inert, §6).
  it('gates the whole phase on the parse BEFORE either section presence check', () => {
    const phase = phaseBody(datasetSkill())
    const guard = phase.search(/malformed/i)
    const presenceCheck = phase.indexOf('already contain a `## Criticality Table`')
    expect(guard, 'no malformed guard in the phase').toBeGreaterThan(-1)
    expect(presenceCheck, 'no per-section presence check found').toBeGreaterThan(-1)
    expect(guard, 'the malformed guard must precede the per-section **Check**').toBeLessThan(
      presenceCheck,
    )

    const precondition = stepBody(datasetSkill(), '3.6.0')
    expect(precondition, 'Step 3.6.0 (parse precondition) missing').toMatch(/\*\*Check/)
    expect(precondition.toLowerCase()).toMatch(/whole phase|both steps/)
    expect(precondition.toLowerCase()).toMatch(/skipped — file malformed/)
    // every other numbered step in the file closes on a **Verify**, and every
    // other Skip names where control goes — a step that does neither reads as
    // an oversight rather than as the gate it is.
    expect(precondition, 'Step 3.6.0 has no **Verify**').toMatch(/\*\*Verify\*\*/)
    expect(precondition, 'the malformed path names no continuation').toMatch(/Phase 4/)
    // Graceful Degradation and the summary line declare a THIRD whole-phase
    // outcome (`skipped — quality model not installed`), but no step ever
    // produced it: 3.6.0 is the whole-phase gate and checked only the parse,
    // and its Verify asserted "exactly one of two states". An executor walking
    // the algorithm therefore authors sections against a schema that is not
    // installed.
    expect(precondition.toLowerCase(), 'Step 3.6.0 never checks the quality model').toMatch(
      /skipped — quality model not installed/,
    )
    expect(precondition.toLowerCase(), 'Step 3.6.0’s Verify still admits only two states').toMatch(
      /one of three states|three states/,
    )
    // ...and neither per-section step re-owns the parse decision
    for (const step of ['3.6.1', '3.6.2']) {
      expect(stepBody(datasetSkill(), step).toLowerCase(), `Step ${step}`).toMatch(/presence only/)
    }
  })

  it('reports rather than rewrites a malformed risk-matrix.md', () => {
    const c = `${phaseBody(datasetSkill())}\n${datasetSkill().split('## Graceful Degradation')[1] ?? ''}`
    expect(c.toLowerCase()).toMatch(/malformed|does not parse|unparseable/)
    expect(c.toLowerCase()).toMatch(/never rewrite|does not rewrite|not rewritten/)
  })
})

describe('quick mode asks nothing and writes nothing (AC7)', () => {
  it('carries the quick-mode note in both steps, both stating no write', () => {
    for (const step of ['3.6.1', '3.6.2']) {
      const body = stepBody(datasetSkill(), step)
      expect(body, `Step ${step}`).toMatch(/\*\*Quick mode\*\*/)
      expect(body.toLowerCase(), `Step ${step}`).toMatch(/asks nothing and writes nothing/)
    }
  })

  it('declares the delta row in quick-mode-defaults.md, with "no delta" as the resolved default', () => {
    const doc = datasetDefaults()
    expect(doc).toMatch(/Phase 3\.6/)
    expect(doc).toMatch(/Criticality Table/)
    expect(doc.toLowerCase()).toMatch(/no delta/)
    // a fabricated criticality map would silently shape every future tier
    expect(doc.toLowerCase()).toMatch(/fabricat|guess|invent/)
  })

  // the Tier column names the cascade tier a value is READ from. Nothing is
  // read here — and `fallback` would point at `bootstrap-checklist.md`'s
  // per-type table, which the same row says deliberately does not carry it.
  it('leaves the Phase 3.6 row’s cascade tier empty rather than claiming `fallback`', () => {
    const row =
      datasetDefaults()
        .split('\n')
        .find(l => l.startsWith('| Phase 3.6') && l.includes('Criticality Table')) ?? ''
    expect(row, 'no Phase 3.6 row in the per-decision table').not.toBe('')
    const tier = (row.split('|').at(-2) ?? '').trim()
    expect(tier, 'Phase 3.6 resolves nothing from any tier').toBe('—')
  })

  // guided needs a TTY, and bootstrap downgrades to quick without one — so the
  // CI/piped-stdin case must resolve to "nothing asked, nothing written" HERE
  // too, not to a phase that hangs on a question it cannot receive an answer to.
  it('resolves the no-TTY case through the same quick-mode behaviour', () => {
    const body = phaseBody(datasetSkill()).toLowerCase()
    expect(body).toMatch(/no tty/)
    expect(body).toMatch(/quick/)
  })

  it('does not add the delta to the still-asked list — quick adds zero questions', () => {
    const stillAsked = datasetDefaults().split('## Still asked in quick mode')[1] ?? ''
    expect(stillAsked.split('## ')[0].toLowerCase()).not.toMatch(/criticality/)
  })

  it('names the criticality map among the values a quick run must not invent (KB anchor)', () => {
    for (const base of [ROOT, DATASET]) {
      const c = read(join(base, CHECKLIST_REL))
      const absent = c.split('**Deliberately absent from this table**')[1] ?? ''
      expect(absent.split('\n|')[0], `${base}: criticality not listed`).toMatch(/criticality/i)
    }
  })

  // `classify` may already have written `## Tag Projection` — the common state,
  // and this repository's own. What a quick run leaves unwritten is the DELTA
  // SECTIONS, not necessarily the file.
  it('does not claim the whole file stays absent after a quick run', () => {
    for (const base of [ROOT, DATASET]) {
      const bullet =
        read(join(base, CHECKLIST_REL))
          .split('\n')
          .find(l => l.includes('Service/domain criticality')) ?? ''
      expect(bullet, `${base}: no criticality bullet`).not.toBe('')
      expect(
        bullet,
        `${base}: an existing Tag Projection makes "file stays absent" false`,
      ).not.toMatch(/file stays absent/i)
      expect(bullet.toLowerCase(), `${base}: what stays unwritten is not named`).toMatch(
        /no delta section|neither delta section|delta sections?/,
      )
    }
  })
})

describe('the schema stays in the quality model — never restated here (business rule)', () => {
  const c = (): string => phaseBody(datasetSkill())

  it('references the model sections and the example asset instead of copying them', () => {
    const body = c()
    expect(body).toMatch(/quality-model\.md/)
    expect(body).toMatch(/§3\.1/)
    expect(body).toMatch(/§4/)
    expect(body).toMatch(/§6/)
    expect(body).toContain('risk-matrix-example.md')
    expect(body.toLowerCase()).toMatch(/never restat|does not restat|not restated/)
  })

  it('carries no inline copy of the Criticality Table schema or its tier values', () => {
    const body = c()
    // the example's table header — copying it here is the duplication this rule bans
    expect(body).not.toMatch(/\|\s*Service\/Domain\s*\|\s*Criticality\s*\|/)
    // ...nor the §3.1 green/yellow/red thresholds for the dimension
    expect(body).not.toMatch(/\|\s*Low\s*\|\s*Medium\s*\|\s*High\s*\|/)
  })

  it('carries no inline copy of the per-tier reviewer/SLA table (§4)', () => {
    expect(c()).not.toMatch(/\|\s*(🟢|🟡|🔴)/)
  })
})

describe('Step 4.3 reports the outcome (DoD)', () => {
  it('adds a classification-delta line to the completion summary', () => {
    const out = datasetSkill().split('## Output Format')[1]?.split('## HALT')[0] ?? ''
    expect(out).toMatch(/Classification/i)
    expect(out.toLowerCase()).toMatch(/declined|skipped/)
  })

  // both steps carry their outcome independently, so a mixed run (criticality
  // authored, overrides already authored) must be representable — a single
  // slot forces the reporter to drop one of the two.
  it('reports the two sections in their own slots, whole-phase skips aside', () => {
    const line =
      datasetSkill()
        .split('\n')
        .find(l => /├──\s*Classification:/.test(l)) ?? ''
    expect(line, 'no Classification summary line').not.toBe('')
    const slots = line.match(/\[[^\]]*\]/g) ?? []
    const criticality = slots.find(s => s.includes('criticality:'))
    const overrides = slots.find(s => s.includes('overrides:'))
    expect(criticality, 'no criticality slot').toBeDefined()
    expect(overrides, 'no overrides slot').toBeDefined()
    // two distinct slots — a shared one cannot express a mixed run
    expect(overrides, 'criticality and overrides share one slot').not.toBe(criticality)
    for (const slot of [criticality, overrides]) {
      expect(slot).toMatch(/declined/)
      expect(slot).toMatch(/already authored/)
    }
    // every whole-phase outcome the skill declares must be representable here
    expect(line).toMatch(/skipped — quick mode/)
    expect(line).toMatch(/skipped — file malformed/)
    // Graceful Degradation declares a THIRD one; without it, a run on a
    // project lacking the quality-model guideline has no value to report.
    expect(line, 'the quality-model-absent skip has no representable value').toMatch(
      /skipped — quality model not installed/,
    )
  })

  it('names the summary as where the quick-mode skip is reported once', () => {
    expect(phaseBody(datasetSkill())).toMatch(/Step 4\.3/)
  })
})

describe('root mirror carries the new phase (pair update)', () => {
  it('mirrors Phase 3.6 with prefixed skill references', () => {
    const m = mirrorSkill()
    expect(m).toMatch(/^## Phase 3\.6/m)
    expect(m).toMatch(/\/pair-capability-classify\b/)
    expect(m).not.toMatch(/(?<![-\w])\/classify\b/)
  })
})
