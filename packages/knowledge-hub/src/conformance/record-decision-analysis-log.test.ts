import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #247: record-decision supports a 4th decision
// type, analysis-log — one record per technical analysis in decision-log/
// (category `analysis`) plus a current-state summary in the pertinent
// adoption file. Same history<->state relation as DDR<->context-map (R7.6).

const DATASET_SKILL = join(__dirname, '../../dataset/.skills/capability/record-decision/SKILL.md')
const MIRROR_SKILL = join(
  __dirname,
  '../../../../.claude/skills/pair-capability-record-decision/SKILL.md',
)

const DATASET_TEMPLATE = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/collaboration/templates/analysis-log-template.md',
)
const MATERIALIZED_TEMPLATE = join(
  __dirname,
  '../../../../.pair/knowledge/guidelines/collaboration/templates/analysis-log-template.md',
)

const DATASET_GUIDELINE = join(
  __dirname,
  '../../dataset/.pair/knowledge/guidelines/collaboration/decision-records.md',
)
const MATERIALIZED_GUIDELINE = join(
  __dirname,
  '../../../../.pair/knowledge/guidelines/collaboration/decision-records.md',
)

describe('record-decision supports the analysis-log type (#247)', () => {
  it('dataset SKILL.md documents the analysis type and its Category', () => {
    const content = readFileSync(DATASET_SKILL, 'utf-8')
    expect(content).toMatch(/`analysis`/)
    expect(content).toMatch(/Category `[Aa]nalysis`|Category \(`Analysis`\)/)
    // Never updated in place — history is always preserved for analysis-log.
    expect(content.toLowerCase()).toContain('never updated in place')
  })

  it('installed mirror SKILL.md carries the same analysis-log contract', () => {
    expect(existsSync(MIRROR_SKILL)).toBe(true)
    const content = readFileSync(MIRROR_SKILL, 'utf-8')
    expect(content).toMatch(/`analysis`/)
    expect(content.toLowerCase()).toContain('never updated in place')
  })

  it('reuses decision-log/ — no new artifact directory is introduced (D21)', () => {
    const content = readFileSync(DATASET_SKILL, 'utf-8')
    expect(content).toMatch(/no new artifact directory/i)
  })

  it('asks where the summary belongs when no adoption file is clearly pertinent (AC3)', () => {
    const content = readFileSync(DATASET_SKILL, 'utf-8')
    expect(content.toLowerCase()).toContain('ask the developer')
    expect(content.toLowerCase()).toContain('instead of guessing')
  })

  it('flags a contradiction with an existing ADR instead of silently overwriting', () => {
    const content = readFileSync(DATASET_SKILL, 'utf-8')
    expect(content.toLowerCase()).toContain('contradict')
    expect(content.toLowerCase()).toContain('silently overwrit')
  })

  it('the analysis-log template exists in both dataset and materialized locations and matches', () => {
    expect(existsSync(DATASET_TEMPLATE)).toBe(true)
    expect(existsSync(MATERIALIZED_TEMPLATE)).toBe(true)
    const datasetContent = readFileSync(DATASET_TEMPLATE, 'utf-8')
    const materializedContent = readFileSync(MATERIALIZED_TEMPLATE, 'utf-8')
    expect(materializedContent).toBe(datasetContent)
    expect(datasetContent).toMatch(/^## Category\n\nAnalysis$/m)
    // Status is a fixed `Active` value (never "Superseded by ..." — analysis-log
    // entries are additive, not superseded; see decision-records.md Lifecycle).
    expect(datasetContent).toMatch(/^## Status\n\nActive$/m)
  })

  it('the decision-records guideline documents analysis-log in both copies', () => {
    const datasetContent = readFileSync(DATASET_GUIDELINE, 'utf-8')
    const materializedContent = readFileSync(MATERIALIZED_GUIDELINE, 'utf-8')
    expect(datasetContent.toLowerCase()).toContain('analysis-log')
    expect(materializedContent.toLowerCase()).toContain('analysis-log')
    // DDR must also be present in the materialized copy (pre-existing drift fixed alongside).
    expect(materializedContent).toContain('DDR')
  })
})
