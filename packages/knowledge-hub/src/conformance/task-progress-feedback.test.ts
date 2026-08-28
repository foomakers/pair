import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Conformance guard for story #220: the breakdown-to-task feedback loop.
//
// The mechanism is ONE guideline (`task-progress-feedback.md`) plus the call
// sites `/implement` owns; a supervised run gets it for free because
// `/loop` -> `/implement-batch` -> `/implement`, so nothing in the automation
// layer re-implements it. The assertions below therefore split in two:
// the MECHANISM (locator, tick-only patch, batching, fallbacks) is asserted on
// the guideline, and the WIRING (where the tick happens, where the batch is
// flushed, who never duplicates it) on the three skills involved.
//
// Both the dataset source and the generated root mirror are asserted, in the
// vocabulary each one is written in: the KB mirror transform rewrites `/command`
// references (`/write-issue` -> `/pair-capability-write-issue`), so a mirror
// assertion pinning the short form would pass on a stale mirror and fail on a
// correct one.

const KB_REL = 'guidelines/collaboration/project-management-tool/task-progress-feedback.md'
const GUIDELINE_DATASET = join(__dirname, '../../dataset/.pair/knowledge', KB_REL)
const GUIDELINE_MIRROR = join(__dirname, '../../../../.pair/knowledge', KB_REL)

const read = (path: string): string => readFileSync(path, 'utf-8')
const guideline = (): string => read(GUIDELINE_DATASET)
const guidelineMirror = (): string => read(GUIDELINE_MIRROR)

/**
 * One level-2 section of the guideline: from its heading to the NEXT level-2
 * heading, or to the end of the file when it is the last section.
 *
 * Not `sectionBetween`: that helper needs the FOLLOWING heading's literal text,
 * which pins every section assertion to the identity of its neighbour — a section
 * inserted between the two silently narrows the window, and reordering the
 * document breaks assertions that have nothing to do with the change. Fails
 * closed on a missing heading, exactly like `sectionBetween` does.
 */
const sectionOf = (text: string, heading: string): string => {
  const start = text.indexOf(heading)
  if (start === -1) throw new Error(`sectionOf: "${heading}" not found`)
  const next = text.indexOf('\n## ', start + heading.length)
  return next === -1 ? text.slice(start) : text.slice(start, next)
}

/** Both copies of the guideline, so every mechanism assertion runs over each. */
const guidelineCopies: ReadonlyArray<readonly [string, () => string]> = [
  ['dataset', guideline],
  ['mirror', guidelineMirror],
]

describe('the task-progress guideline exists in both the dataset and the mirror (#220)', () => {
  it.each(guidelineCopies)('%s copy is present', (_label, load) => {
    expect(() => load()).not.toThrow()
  })

  it('is installed at the generated KB mirror path', () => {
    expect(existsSync(GUIDELINE_MIRROR)).toBe(true)
  })
})

describe('checklist locator — task-ID anchored, never a guess (AC1, T1)', () => {
  it.each(guidelineCopies)('%s: anchors the match on the task ID', (_label, load) => {
    const c = load()
    expect(c).toMatch(/## The task-ID locator/)
    expect(c.toLowerCase()).toContain('anchored on the task id')
  })

  it.each(guidelineCopies)('%s: tolerates the renderings plan-tasks and the story template produce', (_label, load) => {
    const section = sectionOf(load(), '## The task-ID locator')
    // The canonical `- [ ] **T-3**: title` AND the bare `- [ ] T3 — title` a real
    // story body carries. A locator pinned to one punctuation shape silently fails
    // to find the line on the other, which is the mismatch AC1's edge case is about.
    expect(section).toContain('**T-3**')
    expect(section).toContain('T3')
  })

  it.each(guidelineCopies)('%s: requires exactly one match and never guesses', (_label, load) => {
    const section = sectionOf(load(), '## The task-ID locator')
    const low = section.toLowerCase()
    expect(low).toContain('exactly one')
    // zero matches and more than one match are BOTH reported, never resolved by
    // picking a line: "comment the mismatch, do not guess-tick".
    expect(low).toMatch(/zero match|no match|not found/)
    expect(low).toMatch(/more than one|ambiguous/)
    expect(low).toContain('never guess-tick')
  })
})

describe('tick-only body patch — the only body bytes that change (AC1, T1)', () => {
  it.each(guidelineCopies)('%s: changes only the matched line marker', (_label, load) => {
    const section = sectionOf(load(), '## The tick-only body patch')
    expect(section).toContain('[ ]')
    expect(section).toContain('[x]')
    expect(section.toLowerCase()).toContain('every other byte of the body is identical')
  })

  it.each(guidelineCopies)('%s: is idempotent — an already-ticked item is never rewritten', (_label, load) => {
    const section = sectionOf(load(), '## The tick-only body patch')
    const low = section.toLowerCase()
    expect(low).toMatch(/already ticked|already `\[x\]`/)
    expect(low).toContain('never unticks')
  })

  it.each(guidelineCopies)('%s: names the full-body-overwrite hazard the diff check exists for', (_label, load) => {
    const section = sectionOf(load(), '## The tick-only body patch')
    // The transport is write mode, which OVERWRITES the body: the caller-side diff
    // is the only thing standing between a tick and a clobbered AC/DoD section.
    expect(section.toLowerCase()).toContain('full-body overwrite')
    expect(section.toLowerCase()).toMatch(/diff/)
  })

  it('dataset names the composed writer in short form, the mirror in prefixed form', () => {
    expect(guideline()).toContain('/write-issue')
    expect(guidelineMirror()).toContain('/pair-capability-write-issue')
  })
})
