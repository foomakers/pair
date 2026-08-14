// Dry-run harness for refine-batch.js: executes the workflow source with stubbed
// sandbox primitives (`agent`/`parallel`/`pipeline`/`log`) and asserts the behaviours
// that decide whether a card is trustworthy afterwards — the verification predicate,
// the read-only contract, model routing, and loud input validation.
// Run (from repo root): `pnpm workflows:test` — i.e. `cd .claude/workflows && node --test`.
// The `cd` is deliberate. A QUOTED glob is a Node 22 feature; Node 20 (the major
// `release.yml` pins) reads it as a literal path and exits non-zero. A DIRECTORY argument
// is the reverse: it recurses on 20 and is resolved as a module on 26. Bare `node --test`
// with no positional argument discovers recursively from the cwd on every major from 18 up,
// and it picks up a new test file (or a new subdirectory) with no script edit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The workflow file is a sandbox script (top-level await + return, ambient globals),
// not importable ESM. Evaluate it as an async function body — the same shape the
// Workflow harness gives it.
const SRC = readFileSync(new URL('./pair-refine-batch.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function runWorkflow({ args, dispatch }) {
  const calls = []
  const logs = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return dispatch(prompt, opts)
  }
  const parallel = fns => Promise.all(fns.map(f => f()))
  // Mirrors the real pipeline contract:each item runs every stage independently, and each
  // stage receives (prevResult, originalItem, index). No barrier between stages.
  const pipeline = async (items, ...stages) =>
    Promise.all(
      items.map(async (item, i) => {
        let v = item
        for (const s of stages) v = await s(v, item, i)
        return v
      }),
    )
  const result = await new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'log', SRC)(
    args,
    agent,
    parallel,
    pipeline,
    m => logs.push(m),
  )
  return { result, calls, logs }
}

const okDispatch = (prompt, opts) =>
  opts.phase === 'Verify'
    ? { number: 1, verified: true, riskTag: 'risk:yellow', boardStatus: 'Refined' }
    : { number: 1, recommendation: 'ready', note: 'n' }

// ── The verification predicate ─────────────────────────────────────────────
// The regression this pins: the first version asked the verifier for "a board status".
// #219 and #250 came back verified:true while still sitting in `Todo` — the very column
// they were supposed to leave. `Todo` IS a status, so the check passed and two cards were
// reported Ready while the board said otherwise.
test('verify demands the EXACT expected column, not merely "a status"', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '216', mode: 'classify' }] },
    dispatch: okDispatch,
  })
  const v = calls.find(c => c.opts.label === 'verify:#216').prompt
  assert.ok(/EXACTLY `Refined`/.test(v), 'the expected column is named literally')
  assert.ok(/`Todo` included, means NOT verified/.test(v), 'Todo is explicitly rejected')
  assert.ok(/treat that as a CLAIM to check, not as fact/.test(v), "the writer's report is a claim, not evidence")
  assert.ok(/Do NOT fix anything you find missing/.test(v), 'the verifier reports, it does not repair')
})

test('fixStatusLine is asserted at verify time, and the Status Workflow legend cannot false-positive it', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '219', mode: 'classify', fixStatusLine: true }, { id: '216', mode: 'classify' }] },
    dispatch: okDispatch,
  })
  const withFix = calls.find(c => c.opts.label === 'verify:#219').prompt
  const without = calls.find(c => c.opts.label === 'verify:#216').prompt
  assert.ok(/\*\*Status\*\*:` line must now read/.test(withFix), 'the body status line is checked')
  // The card body carries a `### Status Workflow` legend listing every state, including
  // `Refined`. A verifier grepping for "Refined" would match the legend and pass a card
  // whose real status line still says Todo.
  assert.ok(/Status Workflow` legend/.test(withFix), 'the legend is excluded from the match')
  assert.ok(!/must now read/.test(without), 'cards without the flag get no such assertion')
})

// ── Read-only contract ─────────────────────────────────────────────────────
// This batch runs CONCURRENTLY with an implement-batch whose agents hold sibling
// worktrees. A stray file write here lands in someone else's story.
test('every prompt carries the repo read-only clause, and triage additionally writes nothing at all', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '216', mode: 'classify' }, { id: '321', mode: 'refine' }, { id: '134', mode: 'triage' }] },
    dispatch: okDispatch,
  })
  for (const c of calls) {
    assert.ok(/do NOT create, edit or delete ANY file/.test(c.prompt), `${c.opts.label} forbids file writes`)
    assert.ok(/no add\/commit\/checkout\/branch\/worktree\/stash/.test(c.prompt), `${c.opts.label} forbids mutating git`)
    assert.ok(/running CONCURRENTLY in sibling worktrees/.test(c.prompt), `${c.opts.label} states why`)
  }
  const triage = calls.find(c => c.opts.label === 'triage:#134').prompt
  assert.ok(/READ-ONLY, write NOTHING/.test(triage), 'triage writes nothing')
  assert.ok(/do not label, do not touch the board/.test(triage), 'triage does not touch the tracker either')
})

test('triage skips the verify stage — there is no write to read back', async () => {
  const { calls, result } = await runWorkflow({
    args: { items: [{ id: '134', mode: 'triage' }, { id: '216', mode: 'classify' }] },
    dispatch: okDispatch,
  })
  assert.ok(!calls.some(c => c.opts.label === 'verify:#134'), 'no verify agent is spent on triage')
  assert.ok(calls.some(c => c.opts.label === 'verify:#216'), 'classify still pays for verification')
  assert.equal(result.triage.length, 1)
  assert.equal(result.ready.length, 1)
  assert.equal(result.unverified.length, 0, 'the skipped verify must not register as unverified')
})

// ── Model routing ──────────────────────────────────────────────────────────
test('args.model routes the WORK stage; the verify stage stays pinned to sonnet', async () => {
  const { calls } = await runWorkflow({
    args: { model: 'fable', items: [{ id: '134', mode: 'triage' }, { id: '216', mode: 'classify' }] },
    dispatch: okDispatch,
  })
  assert.equal(calls.find(c => c.opts.label === 'triage:#134').opts.model, 'fable')
  assert.equal(calls.find(c => c.opts.label === 'classify:#216').opts.model, 'fable')
  // Pinned deliberately: the verifier's job is to be reliable, and a change of authoring
  // model must not silently change what counts as verified.
  assert.equal(calls.find(c => c.opts.label === 'verify:#216').opts.model, 'sonnet')
})

test('per-card model overrides the batch default, and omitting both inherits the session model', async () => {
  const { calls } = await runWorkflow({
    args: { model: 'fable', items: [{ id: '218', mode: 'triage', model: 'opus' }, { id: '134', mode: 'triage' }] },
    dispatch: okDispatch,
  })
  assert.equal(calls.find(c => c.opts.label === 'triage:#218').opts.model, 'opus', 'per-card wins')
  assert.equal(calls.find(c => c.opts.label === 'triage:#134').opts.model, 'fable', 'others take the batch default')

  const { calls: bare } = await runWorkflow({
    args: { items: [{ id: '134', mode: 'triage' }] },
    dispatch: okDispatch,
  })
  assert.ok(
    !('model' in bare.find(c => c.opts.label === 'triage:#134').opts),
    'no model key at all when none was asked for — the agent inherits the session model',
  )
})

// ── Resilience ─────────────────────────────────────────────────────────────
test('a dead agent is retried once, distinctly labelled and narrated', async () => {
  let n = 0
  const { calls, logs, result } = await runWorkflow({
    args: { items: [{ id: '216', mode: 'classify' }] },
    dispatch: (prompt, opts) => {
      if (opts.label === 'classify:#216' && n++ === 0) return null
      return okDispatch(prompt, opts)
    },
  })
  assert.ok(calls.some(c => c.opts.label === 'classify:#216 retry'), 'the retry is visible in the progress tree')
  assert.ok(logs.some(m => /retrying once/.test(m)), 'the retry is narrated, never silent')
  assert.equal(result.ready.length, 1, 'the card survives one dead agent')
})

// ── Loud input validation ──────────────────────────────────────────────────
// A silently-ignored bad input produces a run that looks successful and did nothing —
// the failure mode that is indistinguishable from real work.
test('bad input throws instead of degrading into a no-op that reports success', async () => {
  const cases = [
    [{ items: [{ id: '1', mode: 'bogus' }] }, /unknown mode "bogus"/],
    [{ items: [{ mode: 'triage' }] }, /is missing id/],
    [{ items: [{ id: '1' }], model: 'gpt' }, /unknown model "gpt"/],
    [{ items: [{ id: '1', model: 'nope' }] }, /#1\) has unknown model "nope"/],
    ['#218 #219', /not JSON/],
    [{ nope: 1 }, /must be \{ items/],
    [undefined, /must be \{ items/],
  ]
  for (const [args, re] of cases) {
    await assert.rejects(() => runWorkflow({ args, dispatch: okDispatch }), re, `input ${JSON.stringify(args)} must throw`)
  }
})

test('an explicit empty list is a legal no-op, and a bare array is read as the item list', async () => {
  const { result } = await runWorkflow({ args: { items: [] }, dispatch: okDispatch })
  assert.deepEqual(result.ready, [])
  assert.deepEqual(result.failed, [])

  const { calls } = await runWorkflow({ args: [{ id: '134', mode: 'triage' }], dispatch: okDispatch })
  assert.ok(calls.some(c => c.opts.label === 'triage:#134'), 'a bare array drives the batch')
})

test('a leading # on the id is normalized away so labels never carry it', async () => {
  const { calls } = await runWorkflow({ args: { items: [{ id: '#134', mode: 'triage' }] }, dispatch: okDispatch })
  assert.ok(calls.some(c => c.opts.label === 'triage:#134'), 'label is triage:#134, not triage:##134')
})

// ── meta integrity ─────────────────────────────────────────────────────────
// The loader parses `meta` statically and rejects any expression node: a `+`-concatenated
// string makes the whole workflow silently unloadable — it disappears from the registry.
test('meta is a pure literal — no expression can make the workflow silently unloadable', () => {
  const start = SRC.indexOf('const meta = {')
  assert.ok(start >= 0, 'meta is declared')
  const bodyStart = SRC.indexOf('{', start)
  let depth = 0
  let bodyEnd = -1
  let inStr = null
  for (let i = bodyStart; i < SRC.length; i++) {
    const ch = SRC[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') inStr = ch
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) {
      bodyEnd = i
      break
    }
  }
  assert.ok(bodyEnd > bodyStart, 'meta object literal is balanced')
  const residue = SRC.slice(bodyStart, bodyEnd + 1)
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '')
    .replace(/[A-Za-z_$][\w$]*\s*:/g, '')
    .replace(/[\s{}[\],:]/g, '')
  assert.equal(residue, '', `meta contains non-literal syntax (residue: ${JSON.stringify(residue.slice(0, 80))})`)
})

// ── refine mode: re-refinement and unattended operation ────────────────────
// Two hazards the first version walked into. (1) It asserted "this card has NO acceptance
// criteria", which is false for a card whose AC are WRONG rather than absent — an agent
// told that appends a second set beside the broken ones and ships a self-contradicting
// body. (2) /pair-process-refine-story opens with a grill interview, and nothing told the
// agent there is no human on the other end.
test('refine handles a card whose existing content is WRONG, not merely absent', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '219', mode: 'refine' }] },
    dispatch: okDispatch,
  })
  const p = calls.find(c => c.opts.label === 'refine:#219').prompt
  assert.ok(!/This card has NO acceptance criteria/.test(p), 'it no longer asserts the card is empty')
  assert.ok(/It may be empty, or it may already carry content that is WRONG/.test(p), 'both shapes are named')
  assert.ok(/REPLACE it; do not append a second version beside it/.test(p), 'wrong content is replaced, not appended')
  assert.ok(/do not leave a body that contradicts itself/.test(p), 'self-contradiction is called out')
  assert.ok(/if it names a superseded framing/.test(p), 'a stale title is surfaced for correction')
  assert.ok(/keep it and say so rather than rewriting for the sake of it/.test(p), 'correct content is preserved')
})

test('refine runs unattended: no questions, assumptions recorded, unanswerable ones left open', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '216', mode: 'refine' }] },
    dispatch: okDispatch,
  })
  const p = calls.find(c => c.opts.label === 'refine:#216').prompt
  assert.ok(/NON-INTERACTIVE \(mandatory\)/.test(p), 'the unattended contract is stated')
  assert.ok(/do NOT ask questions and do NOT stall waiting for input/.test(p), 'the grill cannot block the batch')
  assert.ok(/RECORD the assumption in the card body/.test(p), 'assumptions are written down, not hidden')
  // The escape hatch matters: an agent with no human and no evidence must not invent a
  // product decision — it marks it open and finishes the rest.
  assert.ok(/do not invent an answer/.test(p), 'unanswerable questions are not fabricated')
  assert.ok(/keep the rest of the refinement complete/.test(p), 'one open question does not abort the card')
})

test('refine grounds criteria in the repo as it is today, and files nothing', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '218', mode: 'refine', notes: 'triage says #234/#390 already shipped this' }] },
    dispatch: okDispatch,
  })
  const p = calls.find(c => c.opts.label === 'refine:#218').prompt
  assert.ok(/never write an AC against a capability you have not verified exists/.test(p), 'AC must be evidence-based')
  assert.ok(/do NOT file any new issue/.test(p), 'the no-new-cards rule reaches refine too')
  // Triage output is evidence for the refiner, but not gospel — it was produced by another
  // agent and can be wrong.
  assert.ok(/TRIAGE FINDINGS/.test(p) && /verify before acting/.test(p), 'triage is threaded in as checkable evidence')
})

// ── breakdown: carrying a card past Ready into a task list ─────────────────
test('breakdown composes plan-tasks, forbids separate task issues, and demands full AC coverage', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '219', mode: 'refine', breakdown: true }] },
    dispatch: okDispatch,
  })
  const p = calls.find(c => c.opts.label === 'refine:#219').prompt
  assert.match(p, /\/pair-process-plan-tasks/, 'the breakdown goes through the process skill')
  assert.match(p, /added to the SAME issue body/, 'tasks live in the story, not elsewhere')
  assert.match(p, /Do NOT create separate task issues/, 'no task-issue explosion')
  assert.match(p, /AC-coverage table/, 'the coverage table is required')
  // The load-bearing part: an uncovered criterion is a signal about the CRITERION, not a
  // gap to paper over — otherwise a story ships Ready with an AC nothing implements.
  assert.match(p, /go back and fix the criterion rather than leaving a hole/, 'an uncoverable AC is fixed, not skipped')

  const v = calls.find(c => c.opts.label === 'verify:#219').prompt
  assert.match(v, /implementation task checklist/, 'verify checks the tasks landed')
  assert.match(v, /every acceptance criterion covered by at least one task/i, 'verify checks coverage is complete')
})

test('a card refined without breakdown is not asked for tasks, and verify does not demand them', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '321', mode: 'refine' }] },
    dispatch: okDispatch,
  })
  assert.doesNotMatch(calls.find(c => c.opts.label === 'refine:#321').prompt, /plan-tasks/)
  assert.doesNotMatch(calls.find(c => c.opts.label === 'verify:#321').prompt, /task checklist/)
})

test('breakdown on a non-refine mode throws instead of being silently ignored', async () => {
  for (const mode of ['classify', 'triage']) {
    await assert.rejects(
      () => runWorkflow({ args: { items: [{ id: '1', mode, breakdown: true }] }, dispatch: okDispatch }),
      /breakdown only follows a full refine/,
      `breakdown on ${mode} must throw`,
    )
  }
})

test('every refine prompt carries the pacing contract and the no-new-cards ADL reference', async () => {
  const { calls } = await runWorkflow({
    args: { items: [{ id: '219', mode: 'refine', breakdown: true }] },
    dispatch: okDispatch,
  })
  const p = calls.find(c => c.opts.label === 'refine:#219').prompt
  assert.match(p, /180 seconds without emitting a TEXT MESSAGE/, 'the real supervisor limit is named')
  assert.match(p, /Silence is fatal, slowness is not/, 'the rule is unambiguous')
  assert.match(p, /2026-08-12-implementation-never-files-a-card/, 'the binding decision is cited by name')
})
