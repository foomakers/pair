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

const SKILL_DATASET = (rel: string): string => join(__dirname, '../../dataset/.skills', rel)
const SKILL_MIRROR = (name: string): string =>
  join(__dirname, '../../../../.claude/skills', name, 'SKILL.md')

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

  it.each(guidelineCopies)(
    '%s: tolerates the renderings plan-tasks and the story template produce',
    (_label, load) => {
      const section = sectionOf(load(), '## The task-ID locator')
      // The canonical `- [ ] **T-3**: title` AND the bare `- [ ] T3 — title` a real
      // story body carries. A locator pinned to one punctuation shape silently fails
      // to find the line on the other, which is the mismatch AC1's edge case is about.
      expect(section).toContain('**T-3**')
      expect(section).toContain('T3')
    },
  )

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

  it.each(guidelineCopies)(
    '%s: is idempotent — an already-ticked item is never rewritten',
    (_label, load) => {
      const section = sectionOf(load(), '## The tick-only body patch')
      const low = section.toLowerCase()
      expect(low).toMatch(/already ticked|already `\[x\]`/)
      expect(low).toContain('never unticks')
    },
  )

  it.each(guidelineCopies)(
    '%s: names the full-body-overwrite hazard the diff check exists for',
    (_label, load) => {
      const section = sectionOf(load(), '## The tick-only body patch')
      // The transport is write mode, which OVERWRITES the body: the caller-side diff
      // is the only thing standing between a tick and a clobbered AC/DoD section.
      expect(section.toLowerCase()).toContain('full-body overwrite')
      expect(section.toLowerCase()).toMatch(/diff/)
    },
  )

  it('dataset names the composed writer in short form, the mirror in prefixed form', () => {
    expect(guideline()).toContain('/write-issue')
    expect(guidelineMirror()).toContain('/pair-capability-write-issue')
  })
})

describe('batching — one comment per run iteration (AC2, T2)', () => {
  const BATCHING = '## Batching and the comment format'

  it.each(guidelineCopies)('%s: posts exactly one comment per run iteration', (_label, load) => {
    const section = sectionOf(load(), BATCHING)
    expect(section.toLowerCase()).toContain('one comment per run iteration')
  })

  it.each(guidelineCopies)(
    '%s: defines the run iteration so both paths measure it the same way',
    (_label, load) => {
      // "per iteration" is meaningless unless the unit is pinned: without this the
      // manual path reads it as "per session" and the supervised path as "per loop
      // pass", and the same story gets two different comment cadences.
      const section = sectionOf(load(), BATCHING)
      expect(section.toLowerCase()).toContain('run iteration')
      expect(section.toLowerCase()).toMatch(/one .*invocation|a single invocation/)
    },
  )

  it.each(guidelineCopies)(
    '%s: honours the D22 reading budget — a line per task, detail collapsed',
    (_label, load) => {
      const section = sectionOf(load(), BATCHING)
      expect(section).toContain('D22')
      expect(section.toLowerCase()).toContain('one line per task')
      expect(section).toContain('<details>')
      expect(section).toContain('</details>')
    },
  )

  it.each(guidelineCopies)('%s: posts nothing when the batch is empty', (_label, load) => {
    // An implement invocation that completed no task must not leave a comment
    // saying so — that is the comment spam AC2 rules out, one per no-op re-run.
    const section = sectionOf(load(), BATCHING)
    expect(section.toLowerCase()).toMatch(/empty.*no comment|no comment.*empty|nothing is posted/)
  })
})

describe('outcome vocabulary — failure and skip are recorded, not ticked (AC3, T2)', () => {
  const VOCAB = '## Outcome vocabulary'

  it.each(guidelineCopies)('%s: carries every outcome the loop can produce', (_label, load) => {
    const section = sectionOf(load(), VOCAB)
    // The closed set: three the task itself produces, four the write path does.
    for (const outcome of [
      'ticked',
      'failed',
      'skipped',
      'not-found',
      'ambiguous',
      'patch-rejected',
      'write-failed',
    ]) {
      expect(section).toContain(outcome)
    }
  })

  it.each(guidelineCopies)(
    '%s: leaves the checklist item unticked on failure or skip',
    (_label, load) => {
      const section = sectionOf(load(), VOCAB)
      expect(section.toLowerCase()).toContain('stays unticked')
    },
  )

  it.each(guidelineCopies)(
    '%s: states the tick outcome per row, so no outcome is silent',
    (_label, load) => {
      const section = sectionOf(load(), VOCAB)
      // A table, one row per outcome, with an explicit "does the item get ticked"
      // column — the shape that makes an unanswered outcome visible.
      expect(section).toMatch(/\|\s*Outcome\s*\|/)
      expect(section.toLowerCase()).toMatch(/\|\s*checklist item\s*\|/)
    },
  )
})

describe('wiring — /implement owns both call sites (AC1/AC2, T3)', () => {
  const implement = (): string => read(SKILL_DATASET('process/implement/SKILL.md'))
  const implementMirror = (): string => read(SKILL_MIRROR('pair-process-implement'))

  it('points at the guideline rather than restating the mechanism', () => {
    expect(implement()).toContain('task-progress-feedback.md')
    expect(implementMirror()).toContain('task-progress-feedback.md')
  })

  it('declares /write-issue as an OPTIONAL composed skill — feedback never blocks the story', () => {
    // Optional by design (AC "missing feedback never blocks implementation"): a
    // required composition would turn an uninstalled writer into a HALT and stop
    // the very work the comment only annotates.
    const table = sectionOf(implement(), '## Composed Skills')
    expect(table).toMatch(/\/write-issue\b/)
    expect(table).toMatch(/\/write-issue[^\n]*Optional/)
  })

  it('ticks and queues per task at Step 2.8, not at the end', () => {
    const step28 = sectionOf(implement(), '### Step 2.8: Task Completion')
    const low = step28.toLowerCase()
    expect(low).toContain('task-progress-feedback')
    expect(low).toMatch(/queue/)
  })

  it('flushes the batch in the closing phase, before the checkpoint hand-off', () => {
    const c = implement()
    const flushIdx = c.search(/#+\s*Step\s*3\.1b:/i)
    const checkpointIdx = c.search(/#+\s*Step\s*3\.2:\s*Write the Checkpoint/i)
    expect(flushIdx).toBeGreaterThanOrEqual(0)
    expect(checkpointIdx).toBeGreaterThan(flushIdx)
    // and the flush step is about the progress comment, not something else that
    // happens to occupy the slot.
    const flushStep = c.slice(flushIdx, checkpointIdx).toLowerCase()
    expect(flushStep).toMatch(/flush/)
    expect(flushStep).toMatch(/\$mode:?\s*=?\s*comment/)
  })

  it('flushes on the way out of a HALT too', () => {
    // The run with the most to report is the one that stopped. A flush only on
    // the success path leaves exactly the failed iteration silent (AC3).
    const halts = sectionOf(implement(), '## HALT Conditions').toLowerCase()
    expect(halts).toMatch(/flush/)
  })

  it('reports the feedback outcome in its own output block', () => {
    expect(sectionOf(implement(), '## Output Format')).toMatch(/Progress:/)
  })
})

describe('wiring — nobody duplicates the loop (AC2, T3)', () => {
  it('/loop states it never posts its own per-task progress comments', () => {
    const boundaries = sectionOf(
      read(SKILL_DATASET('loop/SKILL.md')),
      '## Boundaries — What This Skill Does Not Do',
    )
    expect(boundaries.toLowerCase()).toMatch(/task-progress|per-task progress/)
    expect(boundaries).toContain('task-progress-feedback.md')
  })

  it('/write-issue documents the composition /implement drives it through', () => {
    const writeIssue = read(SKILL_DATASET('capability/write-issue/SKILL.md'))
    const section = sectionOf(writeIssue, '## Composition Interface')
    expect(section).toMatch(/When composed by `\/implement`/)
    // both modes, because the loop uses both: write mode for the tick (caller
    // merges the full body), comment mode for the batch.
    expect(section).toContain('$mode: comment')
    expect(section.toLowerCase()).toContain('tick')
  })
})

describe('conflict and write-failure fallbacks (edge cases, T4)', () => {
  const FALLBACKS = '## Failure and conflict handling'

  it.each(guidelineCopies)(
    '%s: confirms the tick by a read, never by an exit status',
    (_label, load) => {
      // The repo-wide verified-writes contract, applied here: a call that exits 0
      // having changed nothing must report `write-failed`, not `ticked` — otherwise
      // the batch claims a tick the body does not carry.
      const section = sectionOf(load(), FALLBACKS)
      const low = section.toLowerCase()
      expect(low).toMatch(/read (it |the body )?back|reading the body back/)
      expect(low).toContain('exit status')
    },
  )

  it.each(guidelineCopies)('%s: retries a body conflict from a FRESH read', (_label, load) => {
    const section = sectionOf(load(), FALLBACKS)
    const low = section.toLowerCase()
    expect(low).toMatch(/concurrent|conflict/)
    expect(low).toContain('fresh')
    // and the locator is re-run on the new body: the item may have moved, or a
    // human may have ticked it meanwhile.
    expect(low).toMatch(/re-?run the locator|locator .*again/)
  })

  it.each(guidelineCopies)(
    '%s: falls back to comment-only on a repeated conflict',
    (_label, load) => {
      const section = sectionOf(load(), FALLBACKS)
      expect(section.toLowerCase()).toContain('comment-only')
    },
  )

  it.each(guidelineCopies)(
    '%s: bounds the retries so a broken tracker cannot stall the run',
    (_label, load) => {
      const section = sectionOf(load(), FALLBACKS)
      const low = section.toLowerCase()
      expect(low).toMatch(/retr/)
      expect(low).toMatch(/one retry|once/)
    },
  )

  it.each(guidelineCopies)('%s: a PM write failure never blocks implementation', (_label, load) => {
    const section = sectionOf(load(), FALLBACKS)
    const low = section.toLowerCase()
    expect(low).toMatch(/never blocks?/)
    expect(low).toMatch(/continue|carries on/)
  })
})

describe('what the loop never does (AC4, T4)', () => {
  const NEVER = '## What never happens'

  it.each(guidelineCopies)('%s: creates no task issues — tasks stay inline', (_label, load) => {
    const section = sectionOf(load(), NEVER)
    expect(section.toLowerCase()).toContain('no separate task issues')
  })

  it.each(guidelineCopies)('%s: rewrites no other section of the body', (_label, load) => {
    const section = sectionOf(load(), NEVER)
    const low = section.toLowerCase()
    expect(low).toMatch(/acceptance criteria|other section/)
  })

  it.each(guidelineCopies)('%s: writes no board state', (_label, load) => {
    expect(sectionOf(load(), NEVER).toLowerCase()).toMatch(/board (state|field)/)
  })
})

describe('the docs site carries the feature (DoD)', () => {
  const docs = (rel: string): string =>
    read(join(__dirname, '../../../../apps/website/content/docs', rel))

  it('lists the guideline in the guidelines catalog', () => {
    expect(docs('reference/guidelines-catalog.mdx')).toContain('task-progress')
  })

  it('describes the progress feedback on the execution journey page', () => {
    const page = docs('developer-journey/execution.mdx').toLowerCase()
    expect(page).toMatch(/task-progress|progress comment/)
  })
})
