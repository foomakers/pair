import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  observePreparationFailure,
  renderPreparationFailure,
  type Git,
} from './preparation-failure'

/** US-591 r0-3: a PR-entry run reports the dispatched PR, not only what an a0 handoff recorded. */
const git: Git = () => undefined
const next = { reason: 'failed-preparation', refusal: 'unprovable' }
const input = (runDir: string, pr?: number) =>
  ({ next, main: runDir, card: '591', runDir, git, ...(pr !== undefined && { pr }) }) as Parameters<
    typeof observePreparationFailure
  >[0]

describe('preparation failure PR (US-591 r0-3)', () => {
  it('shows the dispatched PR when no a0 handoff recorded one', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'prepfail-pr-'))
    const f = observePreparationFailure(input(runDir, 632))
    expect(f.pr).toContain('#632')
    expect(renderPreparationFailure(f).join('\n')).toContain('PR: #632')
  })

  it('prefers the dispatched PR over a stale a0 handoff PR', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'prepfail-pr-'))
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'a0-implement-phase.json'), JSON.stringify({ prNumber: 5 }))
    expect(observePreparationFailure(input(runDir, 632)).pr).toContain('#632')
  })

  it('control: no dispatched PR and no handoff keeps the none-recorded statement', () => {
    const runDir = mkdtempSync(join(tmpdir(), 'prepfail-pr-'))
    expect(observePreparationFailure(input(runDir)).pr).toBe('none recorded in the run directory')
  })
})
