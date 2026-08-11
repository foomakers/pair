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

/** The `### Step 3.6.x` body, heading included, up to the next `##`/`###`. */
const stepBody = (skill: string, step: string): string => {
  const lines = skill.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (new RegExp(`^###\\s+Step\\s+${step.replace('.', '\\.')}:`).test(line)) {
      inside = true
      out.push(line)
      continue
    }
    if (inside && /^#{2,3}\s/.test(line)) break
    if (inside) out.push(line)
  }
  return out.join('\n')
}

/** Phase 3.6's own body: from its heading to the next `## ` heading. */
const phaseBody = (skill: string): string => {
  const lines = skill.split('\n')
  const out: string[] = []
  let inside = false
  for (const line of lines) {
    if (/^##\s+Phase 3\.6/.test(line)) {
      inside = true
      out.push(line)
      continue
    }
    if (inside && /^##\s/.test(line)) break
    if (inside) out.push(line)
  }
  return out.join('\n')
}

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
    expect(step).toMatch(/empty table is a valid|empty is a valid|empty table stays valid/)
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

  // a full-catalog offer (Phase 3.5 runs at `$scope: all`) must not read as a
  // form to complete: one gate question before the row loop, not N prompts.
  it('gates the row loop on a single up-front "author the table at all?" question', () => {
    const step = stepBody(datasetSkill(), '3.6.1')
    const questions = blockquoteQuestions(step)
    expect(questions.length, 'a gate question plus the per-row question').toBeGreaterThanOrEqual(2)
    const gate = questions[0].toLowerCase()
    expect(gate).toMatch(/skip the table|author the table/)
    expect(step.toLowerCase()).toMatch(/list to prune, not a form to complete/)
    // the gate is asked BEFORE the per-row walk
    expect(step.indexOf(questions[0])).toBeLessThan(step.search(/one recommendation at a time/))
  })

  // one key space: two catalogs at different granularities must not both
  // supply rows, since an unlisted/near-miss key resolves to conservative High.
  it('names which catalog supplies the criticality key and de-duplicates the other', () => {
    const step = stepBody(datasetSkill(), '3.6.1').toLowerCase()
    expect(step).toMatch(/bounded contexts supply the keys/)
    expect(step).toMatch(/once, not twice/)
    expect(step).toMatch(/conservative high/)
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
    // the two whole-phase outcomes stay single-slot
    expect(line).toMatch(/skipped — quick mode/)
    expect(line).toMatch(/skipped — file malformed/)
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
