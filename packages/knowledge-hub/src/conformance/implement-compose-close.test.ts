import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #256: /implement's closing phase composes
// /checkpoint (write) + /publish-pr (via a handoff-only subagent), and its
// opening phase resumes from the checkpoint without repeating completed tasks.
// The 5-step task cycle is unchanged (AC4 — no regression). The subagent
// boundary is mechanical isolation (D23): anonymous, no named role, its prompt
// is the handoff only. Degradation: subagent spawning unavailable ⇒ checkpoint
// still written, /publish-pr invoked inline, degradation noted (AC3).
// See issue #256 and epic #206.

const DATASET = join(__dirname, '../../dataset/.skills/process/implement/SKILL.md')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-process-implement/SKILL.md')

const dataset = (): string => readFileSync(DATASET, 'utf-8')
const mirror = (): string => readFileSync(MIRROR, 'utf-8')

describe('implement composes checkpoint + publish-pr (#256)', () => {
  it('lists /checkpoint and /publish-pr as composed skills (dataset short refs)', () => {
    const c = dataset()
    expect(c).toMatch(/\/checkpoint\b/)
    expect(c).toMatch(/\/publish-pr\b/)
  })

  it('lists the prefixed composed skills in the installed mirror', () => {
    const c = mirror()
    expect(c).toMatch(/\/pair-capability-checkpoint\b/)
    expect(c).toMatch(/\/pair-capability-publish-pr\b/)
  })
})

describe('closing phase: checkpoint(write) then publish-pr (AC1)', () => {
  const c = dataset()

  it('writes the checkpoint as the boundary/handoff artifact before publishing', () => {
    // checkpoint is written in write mode at the closing phase.
    expect(c).toMatch(/\$mode\s*=?:?\s*write/i)
    expect(c.toLowerCase()).toContain('checkpoint')
    // the write happens before the publish-pr composition (ordering).
    const writeIdx = c.toLowerCase().indexOf('checkpoint')
    const publishIdx = c.indexOf('/publish-pr')
    expect(writeIdx).toBeGreaterThanOrEqual(0)
    expect(publishIdx).toBeGreaterThan(writeIdx)
  })

  it('spawns an anonymous subagent whose prompt is the handoff only (D23)', () => {
    const low = c.toLowerCase()
    expect(low).toContain('subagent')
    expect(low).toContain('handoff')
    expect(low).toContain('anonymous')
    // mechanical isolation, no named role.
    expect(c).toContain('D23')
    // clean/fresh context reset within one execution.
    expect(low).toMatch(/clean context|fresh context/)
  })

  it('delegates gate + PR to /publish-pr instead of re-doing PR logic', () => {
    // implement never re-does gate/PR logic — composes /publish-pr only.
    expect(c.toLowerCase()).toMatch(/never re-?do|composes .*publish-pr only/)
    // the old raw "create or update PR" template-fill step is gone.
    expect(c).not.toMatch(/#+\s*Step\s*3\.4:\s*Create or Update PR/i)
  })
})

describe('opening phase: resume from checkpoint (AC2)', () => {
  const c = dataset()

  it('probes the checkpoint in resume mode at Phase 0', () => {
    expect(c).toMatch(/\$mode\s*=?:?\s*resume/i)
  })

  it('resumes from the first pending task without repeating completed work', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/first pending task|first incomplete/)
    expect(low).toMatch(/without repeating|never re-?does completed|skip.*completed/)
  })
})

describe('degraded inline path (AC3)', () => {
  const c = dataset()

  it('falls back to inline /publish-pr when subagent spawning is unavailable', () => {
    const low = c.toLowerCase()
    expect(low).toContain('inline')
    expect(low).toMatch(/subagent spawn|spawning.*unavailable|cannot spawn|no subagent/)
  })

  it('notes the degradation in the output', () => {
    expect(c.toLowerCase()).toMatch(/degrad/)
  })
})

describe('edge cases (#256)', () => {
  const c = dataset()

  it('HALTs on checkpoint/branch divergence (branch missing)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/branch.*missing|missing.*branch|diverg/)
    expect(c).toContain('HALT')
  })

  it('warns and requires confirmation on a stale checkpoint (story Done)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/stale checkpoint|already done|story.*done/)
    expect(low).toMatch(/confirm/)
  })

  it('treats a subagent failure mid-PR as idempotent rerun (publish-pr updates)', () => {
    const low = c.toLowerCase()
    expect(low).toMatch(/idempotent/)
    expect(low).toMatch(/subagent fail|fails mid|rerun|re-run|re-invoke/)
  })
})

describe('no regression on the 5-step task cycle (AC4)', () => {
  const c = dataset()

  it('keeps the 5-step per-task cycle intact', () => {
    // Phase 2 task cycle anchors remain.
    expect(c).toMatch(/Step 2\.1: Select Next Task/)
    expect(c).toMatch(/Step 2\.7: Verify Quality/)
    expect(c).toMatch(/Step 2\.8: Task Completion/)
  })
})
