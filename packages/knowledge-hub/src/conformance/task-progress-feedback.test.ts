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
// Coverage of the two copies is deliberately asymmetric. The MECHANISM runs over
// both the dataset guideline and its generated root mirror, in the vocabulary
// each one is written in: the KB mirror transform rewrites `/command` references
// (`/write-issue` -> `/pair-capability-write-issue`), so a mirror assertion
// pinning the short form would pass on a stale mirror and fail on a correct one.
// The WIRING is asserted on the dataset source only (the `.claude/skills` mirror
// is read once, to pin that the guideline reference survives the transform):
// mirror equality for every skill artifact is already guarded by
// `src/tools/skill-md-mirror.ts`, which runs the real copy pipeline — duplicating
// it here would be a second, weaker copy of that check.

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

/**
 * Document order of a step id (`3.1`, `3.1b`, `4`): major, minor, then the
 * letter suffix — so `3.1 < 3.1b < 3.2`. Used to catch a skip target that jumps
 * OVER a step, which plain heading order cannot see.
 */
const rank = (step: string): number => {
  const [, major, minor = '0', suffix = ''] = /^(\d+)(?:\.(\d+))?([a-z])?$/.exec(step) ?? []
  if (major === undefined) throw new Error(`rank: unparsable step "${step}"`)
  const letter = suffix === '' ? 0 : suffix.charCodeAt(0) - 96
  return Number(major) * 10_000 + Number(minor) * 100 + letter
}

/**
 * Markdown emphasis markers, stripped. House style writes step references bold
 * (`Move to **Step 3.1b**`), so a matcher written against the rendered prose
 * (`Move to Step`) sees `Move to **Step` and matches NOTHING — and an assertion
 * over "everything that matched" then passes on an empty set whatever the file
 * says. Only asterisks: `_` is load-bearing inside identifiers (`merge_allowed`).
 */
const unemphasize = (text: string): string => text.replace(/\*+/g, '')

/** From the first match of `from` up to the next match of `to`. Fails closed on either. */
const sliceBetween = (text: string, from: RegExp, to: RegExp): string => {
  const start = text.search(from)
  if (start === -1) throw new Error(`sliceBetween: start ${from} not found`)
  const rest = text.slice(start)
  const end = rest.slice(1).search(to)
  if (end === -1) throw new Error(`sliceBetween: end ${to} not found after ${from}`)
  return rest.slice(0, end + 1)
}

/**
 * Every `Move to Step X` in a Phase-3 slice that sits BEFORE Step 3.1b and targets
 * a step ordered AFTER it — i.e. every jump that skips the flush. Emphasis is
 * stripped first, so the detector reads the text as a human does.
 */
const jumpsOverTheFlush = (phase3: string): string[] => {
  const plain = unemphasize(phase3)
  const flushIdx = plain.search(/#+\s*Step\s*3\.1b:/i)
  if (flushIdx === -1) throw new Error('jumpsOverTheFlush: Step 3.1b heading not found')
  return [...plain.matchAll(/Move to (?:Step|Phase)\s*(\d+(?:\.\d+)?[a-z]?)/gi)]
    .filter(m => (m.index ?? 0) < flushIdx)
    .filter(m => rank(m[1]) > rank('3.1b'))
    .map(m => m[0])
}

/** Spelled cardinals a lead-in can use to count a list. */
const CARDINALS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 }

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

  it.each(guidelineCopies)('%s: makes each checkbox its own diff-checked write', (_label, load) => {
    const section = sectionOf(load(), '## The tick-only body patch')
    const low = section.toLowerCase()
    // "Exactly one changed line" AND "tick the Definition-of-Done box this task
    // satisfies" are only compatible if the two boxes are two writes. Read as one
    // write, a task that legitimately ticks both produces a two-line diff, the
    // check rejects it, and the task's OWN tick is lost too — reported as a
    // feedback failure with nothing actually wrong.
    expect(low).toMatch(/one write per (check)?box|its own .*write|separate write/)
    expect(low).toMatch(/definition[- ]of[- ]done/)
  })

  it.each(guidelineCopies)('%s: the lead-in counts the properties it lists', (_label, load) => {
    // Round 2 inserted a fourth property ("One write per checkbox") under a lead-in
    // still reading "Three properties". An agent resolving the guideline enumerates
    // three and treats the last — "the patch never unticks", the idempotence that
    // keeps a resumed story write-free — as commentary rather than a rule.
    const section = sectionOf(load(), '## The tick-only body patch')
    const lead = /\b(one|two|three|four|five)\s+propert(?:y|ies)\b/i.exec(section)
    expect(lead).not.toBeNull()
    const items = section.split('\n').filter(l => /^\d+\.\s/.test(l)).length
    expect(CARDINALS[lead![1].toLowerCase()]).toBe(items)
  })

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

  it.each(guidelineCopies)(
    '%s: scopes the batch to work THIS invocation attempted',
    (_label, load) => {
      // "An empty batch posts nothing" is only reachable if a task the invocation
      // never attempted stays OUT of the queue. Left implicit, a resumed story
      // whose items are all `[x]` re-queues every one of them as `ticked`, the
      // batch is non-empty, and the silent re-run posts a duplicate comment.
      const section = sectionOf(load(), BATCHING)
      const low = section.toLowerCase()
      expect(low).toContain('this invocation')
      expect(low).toMatch(/neither re-?written nor queued|not queued/)
    },
  )
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
    '%s: says where `skipped` is produced, so it is not an orphan outcome',
    (_label, load) => {
      // An outcome in the closed set with no producing call site is a hole in AC3:
      // the caller has no defined path for a task it declines to attempt, and the
      // headline count silently shrinks instead of reporting the deferral.
      const section = sectionOf(load(), VOCAB)
      const low = section.toLowerCase()
      expect(low).toMatch(/task selection|selection step|declines to attempt/)
      expect(low).toMatch(/never .*outcome of an attempt|not .*attempt that failed/)
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

  it('no Phase-3 skip jumps over the flush', () => {
    // The regression this pins: Step 3.1's `commit-per-task` skip used to read
    // "Move to Step 3.2", so the recommended (and supervised-default) commit
    // strategy reached the checkpoint/PR hand-off having never flushed the
    // queue — a whole story's progress comment silently lost. Ordering the two
    // headings (the assertion above) cannot see it: a jump target defeats
    // document order.
    expect(jumpsOverTheFlush(sectionOf(implement(), '## Phase 3:'))).toEqual([])
  })

  it('the anti-jump detector fires on the round-1 bug, in the emphasis the file uses', () => {
    // A pin that cannot see the line it pins is not a pin. The fixed line reads
    // `Move to **Step 3.1b**` — bold markers between `to ` and `Step` — so a
    // matcher over raw markdown matched nothing and the assertion above went
    // green over an EMPTY set, for any target whatsoever. Mutation: restore the
    // verbatim round-1 regression and require the detector to report it.
    const mutated = sectionOf(implement(), '## Phase 3:').replace(
      /Move to \*\*Step 3\.1b\*\*/,
      'Move to **Step 3.2**',
    )
    expect(jumpsOverTheFlush(mutated)).toEqual(['Move to Step 3.2'])
  })

  it('ticks and queues on BOTH commit strategies — the queue site is not inside a strategy branch', () => {
    // The regression: Step 2.8's item 2 short-circuited (`If commit-per-story,
    // continue to next task — return to Step 2.1`) BEFORE item 7, the tick-and-queue.
    // A 4-task commit-per-story story whose gate goes red on T3 then queued only
    // the failure: the story body still showed `- [ ] T1`, `- [ ] T2` for finished
    // work and the single comment reported one failure and no successes — the
    // "on task 3 of 4 and failed on task 2 look identical" state the loop exists
    // to end. Not exotic: Step 1.3 auto-selects commit-per-story for EVERY
    // single-task story.
    const step28 = sectionOf(implement(), '### Step 2.8: Task Completion')
    const skip = unemphasize(sliceBetween(step28, /^2\.\s+\*\*Skip\*\*/m, /^3\.\s+\*\*Act\*\*/m))
    expect(skip).toMatch(/commit-per-story/)
    expect(skip.toLowerCase()).toMatch(/item 7|tick and queue/)
  })

  it('does not re-queue a task an earlier invocation completed', () => {
    // Step 3.1's catch-up must be scoped to THIS invocation. Unscoped ("once per
    // completed task") a single-task story re-invoked after a context reset jumps
    // Step 2.1 -> Phase 3, re-applies the tick-and-queue over the already-`[x]`
    // task, and Step 3.1b posts a SECOND identical progress comment for an
    // invocation that did no work — the accretion the guideline forbids.
    const step31 = sliceBetween(implement(), /#+\s*Step\s*3\.1:/i, /#+\s*Step\s*3\.1b:/i)
    expect(step31.toLowerCase()).toContain('in this invocation')
    expect(step31.toLowerCase()).toMatch(/neither re-?written nor queued|not .*queued/)
  })

  it('has an explicit call site that queues `skipped`', () => {
    // `skipped` is in the guideline's closed set and AC3 names it beside failure,
    // so the only caller must be able to produce it. Without a path, a task blocked
    // mid-run either HALTs (reported `failed` — wrong, it was a deliberate
    // deferral) or vanishes from the batch, so "N of M tasks this iteration"
    // understates the run without saying why.
    // The imperative act, not just the word: Step 2.1's exit condition mentions
    // `skipped` too, so "the section contains `skipped`" stays green over a
    // section that only CONSUMES the outcome and never produces one.
    const step21 = sliceBetween(implement(), /#+\s*Step\s*2\.1:/i, /#+\s*Step\s*2\.2:/i)
    expect(step21).toMatch(/queue it as `skipped`/i)
    expect(step21.toLowerCase()).toMatch(/unmet dependenc|blocke|defer/)
  })

  it('flushes on the way out of a HALT too', () => {
    // The run with the most to report is the one that stopped. A flush only on
    // the success path leaves exactly the failed iteration silent (AC3).
    const halts = sectionOf(implement(), '## HALT Conditions').toLowerCase()
    expect(halts).toMatch(/flush/)
  })

  it('never flushes twice in one invocation — the HALT flush is conditional on the batch not being out', () => {
    // A HALT reachable AFTER Step 3.1b has already posted (Step 3.3's "gate red
    // inside /publish-pr", "/publish-pr not installed") would otherwise re-flush
    // the same batch: the guard "is the queue empty" stays false after a post,
    // because those tasks were still attempted this invocation. Two near-identical
    // progress comments on one story is exactly the spam the guideline forbids.
    const c = implement()
    const flushStep = c
      .slice(c.search(/#+\s*Step\s*3\.1b:/i), c.search(/#+\s*Step\s*3\.2:/i))
      .toLowerCase()
    expect(flushStep).toMatch(/already flushed/)
    // and the queue is drained by the flush, so "already flushed" is a fact the
    // step establishes rather than a note the reader has to carry.
    expect(flushStep).toMatch(/drain|empt(y|ies)\s+the\s+queue/)
    const halts = sectionOf(c, '## HALT Conditions').toLowerCase()
    expect(halts).toMatch(/unless[^\n]*already flushed/)
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
