import { describe, expect, it } from 'vitest'
import {
  type Bump,
  type PlanInput,
  highestBump,
  parseChangesetBump,
  planRelease,
  predecessors,
} from './release-state'

const HEAD = 'h2'
const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  channel: 'pre',
  tags: { 'v0.4.3': 'h0' },
  bumps: ['patch'],
  head: HEAD,
  ...o,
})
const ok = (o: Partial<PlanInput> = {}) => {
  const r = planRelease(base(o))
  if (!r.ok) throw new Error(r.error)
  return r
}
const err = (o: Partial<PlanInput> = {}) => {
  const r = planRelease(base(o))
  if (r.ok) throw new Error('expected refusal')
  return r.error
}

describe('parseChangesetBump / highestBump', () => {
  it('reads the highest bump of the frontmatter', () => {
    const md = `---\n"@pair/pair-cli": minor\n"@pair/brand": patch\n---\n\nText`
    expect(parseChangesetBump(md)).toBe('minor')
  })
  it('returns null without frontmatter bumps', () => {
    expect(parseChangesetBump('no frontmatter')).toBeNull()
  })
  it('ranks major > minor > patch', () => {
    expect(highestBump(['patch', 'major', 'minor'], '1.2.0')).toBe('major')
  })
  it('below 1.0 breaking = minor', () => {
    expect(highestBump(['major', 'patch'], '0.4.3')).toBe('minor')
  })
  it('none when empty', () => {
    expect(highestBump([] as Bump[], '0.4.3')).toBeNull()
  })
})

describe('planRelease', () => {
  it('fresh pre: base from changeset, .1 suffix', () => {
    const r = ok()
    expect(r.version).toBe('0.4.4-pre.1')
    expect(r.tag).toBe('v0.4.4-pre.1')
    expect(r.base).toBe('0.4.4')
    expect(r.predecessors).toEqual([])
  })
  it('breaking below 1.0 bumps minor', () => {
    expect(ok({ bumps: ['major'] }).base).toBe('0.5.0')
  })
  it('pre.N increments and lists previous pre as predecessor', () => {
    const r = ok({ tags: { 'v0.4.3': 'h0', 'v0.4.4-pre.1': 'h1' } })
    expect(r.version).toBe('0.4.4-pre.2')
    expect(r.predecessors).toEqual(['v0.4.4-pre.1'])
  })
  it('rc after pre is forward, keeps pre', () => {
    const r = ok({ channel: 'rc', tags: { 'v0.4.3': 'h0', 'v0.4.4-pre.2': 'h1' } })
    expect(r.version).toBe('0.4.4-rc.1')
    expect(r.predecessors).toEqual([])
  })
  it('rc may skip pre', () => {
    expect(ok({ channel: 'rc' }).version).toBe('0.4.4-rc.1')
  })
  it('final removes every pre/rc of the base, no suffix', () => {
    const r = ok({
      channel: 'final',
      tags: { 'v0.4.3': 'h0', 'v0.4.4-pre.1': 'h1', 'v0.4.4-rc.1': 'h1' },
    })
    expect(r.version).toBe('0.4.4')
    expect(r.predecessors.sort()).toEqual(['v0.4.4-pre.1', 'v0.4.4-rc.1'])
  })
  it('final may skip pre and rc', () => {
    expect(ok({ channel: 'final' }).version).toBe('0.4.4')
  })
  it('refuses pre after rc of the same base (backward)', () => {
    expect(err({ tags: { 'v0.4.3': 'h0', 'v0.4.4-rc.1': 'h1' } })).toMatch(/backward/)
  })
  it('refuses a final that already exists (duplicate)', () => {
    expect(err({ channel: 'final', override: '0.4.3' })).toMatch(/not greater/)
  })
  it('refuses same channel without new main commits', () => {
    expect(err({ tags: { 'v0.4.3': 'h0', 'v0.4.4-pre.1': HEAD } })).toMatch(/no new commits/)
  })
  it('refuses when no changeset and no override', () => {
    expect(err({ bumps: [] })).toMatch(/nothing to release/)
  })
  it('override valid wins over changeset bump', () => {
    expect(ok({ override: '0.9.0' }).base).toBe('0.9.0')
  })
  it('override must be semver X.Y.Z', () => {
    expect(err({ override: '0.9' })).toMatch(/invalid version/)
    expect(err({ override: '0.9.0-pre.1' })).toMatch(/invalid version/)
  })
  it('override must be greater than last final', () => {
    expect(err({ override: '0.3.0' })).toMatch(/not greater/)
  })
  it('override must be untagged', () => {
    expect(err({ tags: { 'v0.4.3': 'h0', 'v0.5.0': 'h1' }, override: '0.5.0' })).toMatch(
      /not greater/,
    )
  })
  it('base change drops pre/rc of the old base', () => {
    const r = ok({
      override: '0.5.0',
      tags: { 'v0.4.3': 'h0', 'v0.4.4-pre.1': 'h1', 'v0.4.4-rc.1': 'h1' },
    })
    expect(r.version).toBe('0.5.0-pre.1')
    expect(r.predecessors.sort()).toEqual(['v0.4.4-pre.1', 'v0.4.4-rc.1'])
  })
  it('never lists finals as predecessors', () => {
    expect(ok({ channel: 'final' }).predecessors).not.toContain('v0.4.3')
  })
})

describe('predecessors', () => {
  const tags = ['v0.4.3', 'v0.4.4-pre.1', 'v0.4.4-pre.2', 'v0.4.4-rc.1']
  it('pre: earlier same-channel only', () => {
    expect(predecessors('0.4.4-pre.2', tags)).toEqual(['v0.4.4-pre.1'])
  })
  it('rc: earlier rc only', () => {
    expect(predecessors('0.4.4-rc.1', tags)).toEqual([])
  })
  it('final: all pre/rc of base', () => {
    expect(predecessors('0.4.4', tags).sort()).toEqual([
      'v0.4.4-pre.1',
      'v0.4.4-pre.2',
      'v0.4.4-rc.1',
    ])
  })
})
