import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  appendAuditLine,
  auditRecordFor,
  dispatchRecordLine,
  renderAuditLine,
  resolveAuditPath,
} from './dispatch-audit'
import { decideDispatch } from './dispatch'
import { readWorkflowMapping } from './workflow-mapping'

const MAPPING = readWorkflowMapping(`## Workflows

auto-dev ⇒ pair-loop
`)

const route = decideDispatch({
  card: '217',
  tags: ['auto-dev', 'risk:green'],
  eligibility: 'risk:green',
  mapping: MAPPING,
  isInstalled: () => true,
})

const skipped = decideDispatch({
  card: '218',
  tags: ['risk:green'],
  eligibility: 'risk:green',
  mapping: MAPPING,
  isInstalled: () => true,
})

const at = '2026-08-30T10:00:00.000Z'

describe('auditRecordFor / renderAuditLine — every decision leaves a trail', () => {
  it('records a start with the card, the tag and the workflow', () => {
    const line = renderAuditLine(auditRecordFor(route, 'start', { at }))

    expect(line).toContain(at)
    expect(line).toContain('event=start')
    expect(line).toContain('card=217')
    expect(line).toContain('tag=auto-dev')
    expect(line).toContain('workflow=pair-loop')
  })

  it('records a skip with the reason, so a card that never ran is explainable', () => {
    const line = renderAuditLine(auditRecordFor(skipped, 'skip', { at }))

    expect(line).toContain('event=skip')
    expect(line).toContain('card=218')
    expect(line).toContain('reason=unmapped')
  })

  it('records the end of a run with its outcome', () => {
    const line = renderAuditLine(auditRecordFor(route, 'end', { at, outcome: 'iteration-cap' }))

    expect(line).toContain('event=end')
    expect(line).toContain('outcome=iteration-cap')
  })

  it('renders exactly one line, whatever the detail contains', () => {
    const line = renderAuditLine(
      auditRecordFor(skipped, 'skip', { at, outcome: 'multi\nline\rdetail' }),
    )

    expect(line.split('\n')).toHaveLength(1)
  })
})

describe('dispatchRecordLine — the half a host adapter posts on the card', () => {
  it('is a single, greppable line naming the card and what was decided', () => {
    const line = dispatchRecordLine(auditRecordFor(route, 'start', { at }))

    expect(line.startsWith('DISPATCH-RECORD:')).toBe(true)
    expect(line).toContain('card=217')
    expect(line).toContain('workflow=pair-loop')
    expect(line.split('\n')).toHaveLength(1)
  })
})

describe('resolveAuditPath — under working_path, always', () => {
  it('joins the project root, the working area and the declared location', () => {
    expect(resolveAuditPath('/project', '.pair/working', 'automation/loop-audit.md')).toBe(
      '/project/.pair/working/automation/loop-audit.md',
    )
  })

  it('honours a relocated working area', () => {
    expect(resolveAuditPath('/project', '.pair/scratch', 'audit.md')).toBe(
      '/project/.pair/scratch/audit.md',
    )
  })
})

describe('appendAuditLine — appended, never overwritten', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pair-dispatch-audit-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('creates the destination and its parents on the first record', () => {
    const path = join(root, 'working', 'automation', 'loop-audit.md')

    appendAuditLine(path, 'first')

    expect(readFileSync(path, 'utf-8')).toBe('first\n')
  })

  it('keeps earlier records: a resumed run does not lose its history', () => {
    const path = join(root, 'audit.md')

    appendAuditLine(path, 'first')
    appendAuditLine(path, 'second')

    expect(readFileSync(path, 'utf-8')).toBe('first\nsecond\n')
  })

  it('fails loudly on an unwritable destination rather than running unaudited', () => {
    mkdirSync(join(root, 'blocked'), { recursive: true })
    writeFileSync(join(root, 'blocked', 'audit.md'), '')

    expect(() => appendAuditLine(join(root, 'blocked', 'audit.md', 'nested.md'), 'x')).toThrow()
  })
})
