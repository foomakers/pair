// Dry-run harness for implement-batch.js (#292): executes the workflow source
// with stubbed `agent`/`parallel` (the sandbox primitives) and asserts the
// phase-0 ensure-contract behavior — derived schema on a valid contract (AC1),
// loose fallback on a malformed/failed one (AC4), value-agnostic control flow
// (AC6) — plus the optional per-story `notes` scope directive threading.
// Run (from repo root): node --test '.claude/workflows/**/*.test.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The workflow file is a sandbox script (top-level await + return, ambient
// `args`/`agent`/`parallel`), not importable ESM. Evaluate it as an async
// function body — same shape the Workflow harness gives it.
const SRC = readFileSync(new URL('./implement-batch.js', import.meta.url), 'utf8').replace(
  /^export /gm,
  '',
)
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

async function runWorkflow({ args, dispatch }) {
  const calls = []
  const agent = async (prompt, opts) => {
    calls.push({ prompt, opts })
    return dispatch(prompt, opts)
  }
  // Mirrors the real primitive's contract: "a thunk that throws (or whose agent errors)
  // resolves to null in the result array — the call itself never rejects". The earlier
  // stub let a throw propagate, which is why the total-failure path (six stalled agents,
  // six nulls) had no test: it was unreachable from here.
  const parallel = fns => Promise.all(fns.map(f => Promise.resolve().then(f).catch(() => null)))
  const logs = []
  const log = m => logs.push(m)
  const result = await new AsyncFunction(
    'args',
    'agent',
    'parallel',
    'log',
    SRC,
  )(args, agent, parallel, log)
  return { result, calls, logs }
}

// Happy-path stub: dispatch on agentType/phase; contract behavior injectable.
function stdDispatch({ contractResult, review = { verdict: 'Approved', findings: [] } } = {}) {
  return (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return contractResult
    if (opts.agentType === 'reviewer') return review
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    return { fixed: true } // fix step
  }
}

// A valid generated contract, with a NON-default severity ('Blocker') to prove
// the reviewer prompt vocabulary is threaded from the contract, not hardcoded.
function validContract() {
  return {
    $meta: { source: 't.md', sourceHash: `sha256:${'0'.repeat(64)}`, generatedAt: 'x' },
    vocabulary: {
      verdictOptions: ['Approved', 'Rework'],
      severities: ['Blocker', 'Major', 'Minor'],
      findingFields: ['location', 'severity', 'description', 'recommendation'],
    },
    schema: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: ['Approved', 'Rework'] },
        needsHumanDecision: { type: 'boolean' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              severity: { type: 'string', enum: ['Blocker', 'Major', 'Minor'] },
              description: { type: 'string' },
              recommendation: { type: 'string' },
              nonActionable: { type: 'boolean' },
            },
          },
        },
      },
      required: ['verdict'],
    },
  }
}

const STORY = { id: '292', title: 'T', branch: 'feat/#292-x' }

test('valid contract: reviewer schema derives from contract.json (AC1) and cache-hit is reported (AC2)', async () => {
  const contract = validContract()
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.deepEqual(rev.opts.schema, contract.schema)
  assert.ok(rev.prompt.includes('Blocker'), 'severity vocabulary threaded from the contract')
  assert.ok(rev.prompt.includes('Rework'), 'verdict vocabulary threaded from the contract')
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'cache-hit' }])
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('reviewer prompt pins the nonActionable-is-not-a-scope-filter correction', async () => {
  // Regression guard for the ADL amendment (2026-07-11-agent-execution-layer):
  // "outside the story's originally stated scope" must NOT be a reason to mark a
  // finding nonActionable. A future prompt edit can't silently drop this.
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.ok(
    rev.prompt.includes('originally stated scope'),
    'reviewer prompt keeps the scope-filter correction',
  )
  // Matches either wording of the same ADL clause: the original "NOT by itself a reason"
  // and the stronger "is NOT a reason: fix it here" that came with the no-new-cards rule.
  // The invariant being pinned is the ADL's, not one particular sentence — but it must stay
  // at least as strict, so a future edit cannot weaken it back into a scope filter.
  assert.ok(
    /originally stated scope is NOT (a reason|by itself a reason)/.test(rev.prompt),
    'reviewer prompt keeps the "not a reason to mark nonActionable" clause',
  )
})

test('per-step effort + PR model override are wired into agent opts', async () => {
  // Guards the model/effort policy: effort is set per step in opts (the running
  // lever), and the PR-open step dials the implementer down to sonnet/medium.
  // Role MODEL defaults live in .claude/agents/*.md frontmatter (not visible to
  // this source-eval harness) — only the opts-level config is asserted here.
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const contract = calls.find(c => c.opts.agentType === 'contract-generator')
  const impl = calls.find(c => c.opts.phase === 'Implement')
  const pr = calls.find(c => c.opts.phase === 'PR')
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(contract.opts.effort, 'low')
  assert.equal(impl.opts.effort, 'high')
  // Was 'xhigh' until the reviewer's reasoning gaps started outrunning the supervisor's
  // 180s window on large diffs — see the pacing test below for the measurement.
  assert.equal(rev.opts.effort, 'high')
  assert.equal(pr.opts.model, 'sonnet', 'PR step overrides model to sonnet')
  assert.equal(pr.opts.effort, 'medium')
})

test('malformed contract: loose fallback schema, run never breaks (AC4)', async () => {
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'regenerated', contract: { schema: { type: 'object' } } },
    }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(rev.opts.schema.properties.verdict.type, 'string')
  assert.equal(
    rev.opts.schema.properties.verdict.enum,
    undefined,
    'fallback stays loose (no enum lock)',
  )
  assert.ok(rev.prompt.includes('Critical, Major, Minor'), 'fallback vocabulary used')
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'fallback-loose' }])
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('generator failure (no return): loose fallback, run never breaks (AC4)', async () => {
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: undefined }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(rev.opts.schema.properties.verdict.enum, undefined)
  assert.deepEqual(result.contracts, [{ name: 'code-review', status: 'fallback-loose' }])
})

test('control flow stays value-agnostic: nonActionable findings converge without matching verdict strings (AC6)', async () => {
  const { result } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'cache-hit', contract: validContract() },
      review: {
        verdict: 'Some Unrecognized Verdict',
        findings: [
          { location: 'a.js:1', severity: 'Minor', description: 'by design', nonActionable: true },
        ],
      },
    }),
  })
  assert.equal(result.batch[0].status, 'ready-for-merge')
  assert.equal(result.batch[0].acceptedFindings.length, 1)
})

test('contract with usable schema but missing canonical vocabulary keys: prompt falls back to default vocabulary text (never silently drifts)', async () => {
  const contract = validContract()
  delete contract.vocabulary.severities
  delete contract.vocabulary.verdictOptions
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  // Schema is still enum-locked from the (structurally usable) contract...
  assert.deepEqual(rev.opts.schema, contract.schema)
  // ...but the prompt vocabulary text falls back to the documented defaults,
  // since verdictOptions/severities (the canonical keys it's threaded from)
  // are absent. In practice ensure-contract.mjs's validateContract now rejects
  // such a contract before it is ever persisted — this exercises the
  // consumer-side fallback as defense in depth.
  assert.ok(rev.prompt.includes('Critical, Major, Minor, Questions'), 'default severities fallback')
  assert.ok(rev.prompt.includes('CHANGES-REQUESTED'), 'default verdict fallback')
})

test('story.notes: scope directive threaded into implement and PR prompts', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [{ ...STORY, notes: 'resolve all findings in ONE PR, do not split' }] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const impl = calls.find(c => c.opts.phase === 'Implement')
  const pr = calls.find(c => c.opts.phase === 'PR')
  assert.ok(
    impl.prompt.includes(
      'SCOPE DIRECTIVE (overrides the issue body where they conflict): resolve all findings in ONE PR, do not split',
    ),
  )
  assert.ok(pr.prompt.includes('SCOPE DIRECTIVE: resolve all findings in ONE PR, do not split'))
})

test('story without notes: no scope directive in prompts', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  for (const c of calls)
    assert.ok(!c.prompt.includes('SCOPE DIRECTIVE'), `unexpected directive in ${c.opts.label}`)
})

test('empty batch: no agent calls at all (contracts skipped too)', async () => {
  const { result, calls } = await runWorkflow({ args: { stories: [] }, dispatch: stdDispatch() })
  assert.equal(calls.length, 0)
  assert.deepEqual(result.batch, [])
})

test('review noise policy: first review posts, re-review is silent, fix logs to working, convergence synthesizes ONE remediation', async () => {
  let revCall = 0
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') {
      revCall++
      // round 0: one actionable finding; round 1 (re-review): clean → converge
      return revCall === 1
        ? { verdict: 'Rework', findings: [{ location: 'a.ts:1', severity: 'Minor', description: 'd', recommendation: 'r' }] }
        : { verdict: 'Approved', findings: [] }
    }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.label?.startsWith('synth:')) return 'posted'
    return { fixed: true } // fix step
  }
  const { result, calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 2, 'first review + one re-review')
  assert.ok(reviews[0].prompt.includes('This is the FIRST review: POST'), 'first review is posted on the PR')
  assert.ok(reviews[1].prompt.includes('do NOT post any PR comment'), 're-review posts no comment')

  const fix = calls.find(c => c.opts.label?.startsWith('fix:'))
  assert.ok(fix.prompt.includes('append this round to the working log'), 'fix logs the round, no per-round PR comment')
  assert.ok(fix.prompt.includes('.pair/working/reviews/292.md'), 'working log is per-story')

  const synth = calls.find(c => c.opts.label?.startsWith('synth:'))
  assert.ok(synth, 'a synthesis step runs at convergence')
  assert.ok(
    synth.prompt.includes('Post ONE remediation comment') && synth.prompt.includes('DELETE'),
    'convergence posts ONE remediation comment then deletes the log',
  )
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('clean first review: no remediation comment, no synthesis step (first-review comment stands alone)', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no synthesis when first review is already clean')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('fix:')), 'no fix round when nothing actionable')
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 1, 'exactly one (first) review')
  assert.ok(reviews[0].prompt.includes('This is the FIRST review: POST'))
})

test('non-convergence: MAX_FIX_ROUNDS escalation flushes the working log to the PR with the open findings, no synthesis', async () => {
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] } // never converges
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.label?.startsWith('flush:')) return 'flushed'
    return { fixed: true } // fix step
  }
  const { result, calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  assert.equal(result.batch[0].status, 'escalate')
  const flush = calls.find(c => c.opts.label?.startsWith('flush:'))
  assert.ok(flush, 'escalation posts a flush comment')
  assert.ok(flush.prompt.includes('x.ts:1'), 'flush carries the still-open findings')
  assert.ok(flush.prompt.includes('.pair/working/reviews/292.md') && flush.prompt.includes('Do NOT delete the log'), 'flush reads the log and keeps it for the human')
  assert.ok(/UNTRACKED|PRESERVED|pruned/.test(flush.prompt) && flush.prompt.includes('../pair-worktrees/292'), 'flush documents the worktree-persistence assumption of the untracked log (finding 3)')
  // #373 round-6 finding: the flush must ALSO minimize a prior convergence's final-remediation
  // comment (converged-but-unmerged re-run that now escalates) — a stale "ready for merge" verdict
  // cannot stay visible beside an active escalation; never the first-review comment. Mirrors the
  // synth-path minimize set.
  assert.ok(/final-remediation\/synthesis comment left by an EARLIER convergence/i.test(flush.prompt), 'flush minimizes a prior convergence\'s own final-remediation comment (round-6 finding)')
  assert.ok(/NEVER minimize the first-review comment/i.test(flush.prompt), 'flush carves out the first-review comment from the minimize set')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no synthesis on escalation')
})

// ── #373: whole-cycle noise-reduction across escalate / resume / manual rounds ──
// The persisted working log is the single source of truth for an in-flight cycle;
// its EXISTENCE on a resume run == a cycle to CONTINUE (silent round-0), converging
// to exactly ONE first-review + ONE final remediation regardless of run count.
const RESUME_STORY = { id: '292', title: 'T', branch: 'feat/#292-x', prNumber: 7 }

test('#373 continuation (resume + existing log): probe runs, round-0 review is SILENT, immediate convergence still synthesizes + deletes (AC1 + immediate-convergence edge)', async () => {
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: true, firstReviewPosted: true } // prior run left a log + first review
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] } // round-0 already clean
    if (opts.label?.startsWith('synth:')) return 'posted'
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })

  assert.ok(!calls.some(c => c.opts.phase === 'Implement'), 'resume skips implement')
  assert.ok(!calls.some(c => c.opts.phase === 'PR'), 'resume skips PR-open')

  const probe = calls.find(c => c.opts.label?.startsWith('probe:'))
  assert.ok(probe, 'a continuation existence-probe runs on resume')
  assert.ok(probe.prompt.includes('.pair/working/reviews/292.md'), 'probe checks the per-story working log')

  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 1, 'round-0 only (immediate convergence)')
  assert.ok(reviews[0].prompt.includes('do NOT post any PR comment'), 'round-0 on a continuation is a SILENT re-review')
  assert.ok(!reviews[0].prompt.includes('This is the FIRST review: POST'), 'no second first-review is posted')

  const synth = calls.find(c => c.opts.label?.startsWith('synth:'))
  assert.ok(synth, 'immediate convergence on a continuation still synthesizes (cycleHasRemediation seeded true)')
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('#373 continuation convergence: the ONE synthesis maps ALL runs, minimizes prior flush/manual comments, then deletes the log (AC2 + AC3)', async () => {
  let revCall = 0
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: true, firstReviewPosted: true }
    if (opts.agentType === 'reviewer') {
      revCall++
      return revCall === 1
        ? { verdict: 'Rework', findings: [{ location: 'a.ts:1', severity: 'Minor', description: 'd', recommendation: 'r' }] }
        : { verdict: 'Approved', findings: [] }
    }
    if (opts.label?.startsWith('synth:')) return 'posted'
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const synth = calls.find(c => c.opts.label?.startsWith('synth:'))
  assert.ok(synth, 'convergence synthesizes')
  assert.ok(/ALL runs/i.test(synth.prompt), 'synthesis maps findings across ALL runs of the cycle')
  assert.ok(/minimize/i.test(synth.prompt) && /outdated/i.test(synth.prompt), 'synthesis minimizes / marks-outdated prior intermediate comments')
  // #373 round-5 finding 1: the minimize set must also cover a PRIOR convergence's own
  // final-remediation comment (re-run→re-converge edge), while NEVER the first review, so the
  // 'at most one final remediation' invariant holds on re-entry.
  assert.ok(/prior convergence/i.test(synth.prompt), 'synthesis minimizes a prior convergence\'s own final-remediation comment (re-run→re-converge edge)')
  assert.ok(/do NOT minimize the first review/i.test(synth.prompt), 'the first-review comment is explicitly excluded from the minimize set')
  assert.ok(synth.prompt.includes('DELETE'), 'synthesis deletes the log at the end')
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('#373 resume with NO prior log: round-0 is a FRESH first review (posted), not silenced (prNumber-resume-no-log edge)', async () => {
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: false } // review never ran → no log, no prior first review
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const probe = calls.find(c => c.opts.label?.startsWith('probe:'))
  assert.ok(probe, 'probe still runs on resume')
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.ok(reviews[0].prompt.includes('This is the FIRST review: POST'), 'no log → round-0 posts a fresh first review')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'clean fresh review on resume → no synthesis (cycleHasRemediation stayed false)')
})

// This assertion was INVERTED on purpose. It previously required that no probe run
// on a fresh story — the cost saving that gated the probe on `resuming`, i.e. on the
// caller having passed `prNumber`. That gate is what let a `resumeFromRunId` resume
// (same args, cached implement/PR agents, so `story.prNumber` absent) skip the probe
// and post a SECOND and THIRD first review on a PR that already had one. The guard
// must not depend on the caller's bookkeeping, so the probe now runs whenever the PR
// exists. What the test's real intent — "fresh path unchanged" — protects is the
// OUTCOME, and that is asserted below: on a fresh story the first review is still
// POSTED, never silenced.
test('fresh story: the probe runs (guard independent of caller bookkeeping) and the first review still POSTS', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.ok(
    calls.some(c => c.opts.label?.startsWith('probe:')),
    'the probe runs on every story with a PR — not only when the caller passed prNumber',
  )
  // Fresh path outcome unchanged: both signals come back false (no log, no marker),
  // so round-0 is a POSTED first review, not a silent one.
  const review = calls.find(c => c.opts.agentType === 'reviewer')
  assert.ok(review, 'a review round ran')
  assert.match(
    review.prompt,
    /post/i,
    'round-0 on a fresh story still posts the first review (the probe must not silence it)',
  )
})

test('the probe cannot silence a fresh first review even if it returns garbage', async () => {
  // Fail-open direction, pinned: a malformed probe return must leave both signals
  // false so the review is POSTED (visible) rather than suppressed (silent). This is
  // the property that makes running the probe unconditionally safe.
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator')
        return { status: 'cache-hit', contract: validContract() }
      if (opts.label?.startsWith('probe:')) return { nonsense: true }
      if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      return { fixed: true }
    },
  })
  const review = calls.find(c => c.opts.agentType === 'reviewer')
  assert.match(review.prompt, /post/i, 'a garbage probe return must not silence the first review')
})

test('#373 escalate documents the manual out-of-band convention (funnel into the same log; next run synthesizes) — AC4', async () => {
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.label?.startsWith('flush:')) return 'flushed'
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })
  const flush = calls.find(c => c.opts.label?.startsWith('flush:'))
  assert.ok(flush, 'escalation posts a flush comment')
  assert.ok(/same (working )?log|this log/i.test(flush.prompt), 'flush directs further rework into the same working log')
  assert.ok(/next.*run.*synthesi/i.test(flush.prompt), 'flush states the next orchestrated run synthesizes the cycle')
})

test('#373 resume with NO log but a first review ALREADY on the PR: round-0 is SILENT (no duplicate first review), clean → no synth (findings 1 & 3)', async () => {
  // Converged-but-unmerged re-run (log deleted at convergence) OR a pruned/out-of-band
  // clone that lost the untracked log: the PR-side `firstReviewPosted` signal must still
  // suppress a second first-review. cycleHasRemediation stays false (no log to continue), so a
  // clean round-0 adds nothing and never tries to synthesize a gone log.
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: true }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 1, 'round-0 only')
  assert.ok(reviews[0].prompt.includes('do NOT post any PR comment'), 'round-0 is a SILENT re-review when a first review already exists on the PR')
  assert.ok(!reviews[0].prompt.includes('This is the FIRST review: POST'), 'no duplicate first-review is posted')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no log to continue → clean round-0 does not synthesize a deleted log')
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('#373 finding 1: resume, NO log + first review already on PR, round-0 ESCALATES → flush still posts from inline findings (best-effort log read)', async () => {
  // The escalate-visibility gap: firstReviewPosted=true + logExists=false means round-0 is a
  // SILENT re-review (first=false) AND cycleHasRemediation stays false (seeded only from the
  // log). If round-0 returns needsHumanDecision, the escalation must STILL leave a PR-visible
  // artifact — otherwise the new blocking concern surfaces only in the batch return value and a
  // later resume repeats the silent escalation. The `|| !first` arm posts a flush; because
  // there is no log to anchor to, it escalates from the inline findings directly.
  const finding = { location: 'x.ts:1', severity: 'Blocker', description: 'design disagreement', recommendation: 'r' }
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: true }
    if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding], needsHumanDecision: true }
    if (opts.label?.startsWith('flush:')) return 'flushed'
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  assert.equal(result.batch[0].status, 'escalate')
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  // TWO reviews, not one: `needsHumanDecision` no longer escalates immediately. It now buys
  // ONE fix round first — measured cost of the old behaviour was six consecutive rounds
  // across two stories that produced reviews and zero commits, because the flag skipped the
  // fixer entirely. The escalation is DEFERRED by a round, never dropped: the flag is
  // remembered, so the second time it stands the story escalates exactly as before.
  assert.equal(reviews.length, 2, 'one fix round is spent before honouring the request')
  assert.ok(calls.some(c => c.opts.label?.startsWith('fix:')), 'the fixer DID run on the actionable findings')
  assert.ok(reviews[0].prompt.includes('do NOT post any PR comment'), 'round-0 is SILENT (first review already on PR)')
  const flush = calls.find(c => c.opts.label?.startsWith('flush:'))
  assert.ok(flush, 'a resume-path round-0 escalation STILL posts a flush (finding 1: no silent escalation)')
  assert.ok(flush.prompt.includes('x.ts:1'), 'flush carries the still-open actionable findings')
  // The no-log arm no longer applies HERE: the deferred-escalation fix round runs first and
  // the fixer writes the working log, so by flush time an anchor exists. That is the correct
  // outcome — the arm itself is still exercised by the MAX_FIX_ROUNDS escalation test, where
  // no fix round precedes it. What this test still pins is the finding-1 invariant: a
  // resume-path escalation is never SILENT.
  assert.ok(flush.prompt.includes('Read the review log'), 'after a fix round there IS a log to anchor to')
  assert.ok(flush.prompt.includes('Do NOT delete the log'), 'the log is kept as the continuation anchor')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'escalation never synthesizes')
})

test('#373 finding 4: probe queries BOTH signals and runs at sonnet/low — reliable worktree+gh, still low effort', async () => {
  // The probe orchestrates a worktree + a `gh` fetch + a substring match, and a mis-report
  // fails OPEN toward a duplicate first review (the very noise this story removes), so it runs
  // at sonnet (not the cheapest haiku) while staying at low effort. This pins the model choice
  // so a later refactor can't silently drop it back to a tier that mis-runs the tool steps.
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: false }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const probe = calls.find(c => c.opts.label?.startsWith('probe:'))
  assert.ok(probe, 'probe runs on resume')
  assert.equal(probe.opts.model, 'sonnet', 'probe runs at sonnet (reliable worktree+gh substring match, fails open toward duplicate first review)')
  assert.equal(probe.opts.effort, 'low', 'probe uses low effort')
  assert.ok(probe.prompt.includes('logExists') && probe.prompt.includes('firstReviewPosted'), 'probe reports both the log-existence and the PR-side first-review signal')
})

test('#373 finding 1: the first review emits a hidden marker and the probe matches it DETERMINISTICALLY (no semantic template-structure judgment)', async () => {
  // The probe runs at sonnet/low. It must NOT classify a comment by reading its structure
  // (a false positive would silence a legitimate first review — the story's High-impact
  // over-silencing risk). Instead the first review emits a fixed hidden marker and the probe
  // does a plain EXACT substring match on that same marker.
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: false }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const marker = `<!-- pair:first-review #${RESUME_STORY.id} PR#${RESUME_STORY.prNumber} -->`

  const first = calls.find(c => c.opts.agentType === 'reviewer')
  assert.ok(first.prompt.includes(marker), 'the first review emits the exact hidden marker verbatim')
  assert.ok(/HTML comment/i.test(first.prompt) && /invisible/i.test(first.prompt), 'marker is documented as an invisible HTML comment (no visible noise)')

  const probe = calls.find(c => c.opts.label?.startsWith('probe:'))
  assert.ok(probe.prompt.includes(marker), 'the probe matches the SAME marker the first review emits')
  assert.ok(/EXACT marker substring|plain substring match|DETERMINISTICALLY/.test(probe.prompt), 'probe is a deterministic substring match, not a judgment')
  assert.ok(!/Overall Assessment|Review Summary/.test(probe.prompt), 'probe no longer relies on a semantic template-structure reading of the comment')
})

test('#373 finding 3: both escalate-flush prompts carry the shared convention block, each interpolated from its OWN story/PR (single source, parameterized — not a byte-equal tautology)', async () => {
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }

  // MAX_FIX_ROUNDS escalation (fresh-story path, cycleHasRemediation set by a prior fix round).
  // Distinct id (292) + PR (#7 from the PR phase) from the resume path below.
  const STORY_A = { id: '292', title: 'T', branch: 'feat/#292-x' }
  const maxRoundsFlush = (await runWorkflow({
    args: { stories: [STORY_A] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      if (opts.label?.startsWith('flush:')) return 'flushed'
      return { fixed: true }
    },
  })).calls.find(c => c.opts.label?.startsWith('flush:'))

  // needsHumanDecision escalation (fixer escalates a design disagreement on a continuation).
  // DISTINCT id (555) + PR (#88 via resume) so an interpolation regression cannot be masked.
  const STORY_B = { id: '555', title: 'T', branch: 'feat/#555-y', prNumber: 88 }
  const designFlush = (await runWorkflow({
    args: { stories: [STORY_B] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.label?.startsWith('probe:')) return { logExists: true, firstReviewPosted: true }
      if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] }
      if (opts.label?.startsWith('flush:')) return 'flushed'
      return { needsHumanDecision: true } // fixer escalates a design disagreement
    },
  })).calls.find(c => c.opts.label?.startsWith('flush:'))

  assert.ok(maxRoundsFlush && designFlush, 'both escalation paths post a flush')

  // Shared single-source marker present in BOTH (Part A supersede clause).
  assert.match(maxRoundsFlush.prompt, /SUPERSEDES the last/, 'maxRounds flush carries the shared minimize/supersede block')
  assert.match(designFlush.prompt, /SUPERSEDES the last/, 'design-disagreement flush carries the shared minimize/supersede block')

  // Each flush is interpolated from its OWN story/PR — proving parameterization, not a tautology.
  assert.match(maxRoundsFlush.prompt, /\.\.\/pair-worktrees\/292\b/, 'maxRounds flush interpolates its own worktree (292)')
  assert.match(maxRoundsFlush.prompt, /PR #7\b/, 'maxRounds flush interpolates its own PR (#7)')
  assert.doesNotMatch(maxRoundsFlush.prompt, /pair-worktrees\/555|PR #88\b/, 'maxRounds flush does NOT leak the other story/PR')

  assert.match(designFlush.prompt, /\.\.\/pair-worktrees\/555\b/, 'design flush interpolates its own worktree (555)')
  assert.match(designFlush.prompt, /PR #88\b/, 'design flush interpolates its own PR (#88)')
  assert.doesNotMatch(designFlush.prompt, /pair-worktrees\/292|PR #7\b/, 'design flush does NOT leak the other story/PR')
})

test('#373 escalate ON A CONTINUATION: resume + existing log + never-converging re-review keeps the log, flushes (cycleHasRemediation seeded true), supersedes prior flush, no synth (AC5 on the resume path)', async () => {
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: true, firstReviewPosted: true }
    if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] } // never converges
    if (opts.label?.startsWith('flush:')) return 'flushed'
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  assert.equal(result.batch[0].status, 'escalate')
  // cycleHasRemediation was seeded true by the continuation, so the flush fires even though the
  // escalation happened on round-0 of a RESUMED cycle (fresh-story path only reaches the
  // guarded flush after a fix round sets cycleHasRemediation).
  const flush = calls.find(c => c.opts.label?.startsWith('flush:'))
  assert.ok(flush, 'continuation escalation posts a flush (cycleHasRemediation seeded true from the existing log)')
  assert.ok(flush.prompt.includes('x.ts:1'), 'flush carries the still-open findings')
  assert.ok(flush.prompt.includes('Do NOT delete the log'), 'the continuation anchor log is kept')
  assert.ok(/minimize|supersede/i.test(flush.prompt), 'a new escalate-flush supersedes/minimizes the prior one (finding 2)')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no synthesis on escalation')
})

// ── Input contract: a batch that drives nothing must FAIL, not report success ──
// Regression origin: the workflow was invoked with `args: "#234 #236 #281 …"` — the
// shape its own invocation line suggested. `JSON.parse` threw, the catch coerced the
// input to `undefined`, `STORIES` fell back to `[]`, and the run exited in ~30ms with
// `{ batch: [], note: 'PRs are ready-for-merge or escalated…' }`. Nothing ran, and the
// result was shaped exactly like a successful batch.

async function expectThrow({ args }) {
  try {
    await runWorkflow({ args, dispatch: stdDispatch() })
  } catch (e) {
    return e.message
  }
  throw new Error('expected the workflow to throw on invalid args, but it resolved')
}

test('args as a bare list of issue refs THROWS (the silent-no-op regression) and names the required shape', async () => {
  const msg = await expectThrow({ args: '#234 #236 #281' })
  assert.match(msg, /not JSON/i)
  // The message must be actionable: say what to pass, and why ids alone cannot work.
  assert.match(msg, /id, title, branch|\{ id, title, branch \}/)
  assert.match(msg, /worktree add/, 'explains why branch is required')
  assert.match(msg, /"stories"/, 'shows the literal shape to pass')
})

test('args missing entirely THROWS and says nothing was run', async () => {
  const msg = await expectThrow({ args: undefined })
  assert.match(msg, /must be \{ stories: \[\.\.\.\] \}/)
  assert.match(msg, /Nothing was run/i)
})

test('args object without a stories array THROWS (not treated as an empty batch)', async () => {
  const msg = await expectThrow({ args: { batch: [{ id: '1' }] } })
  assert.match(msg, /must be \{ stories/)
})

test('a story missing branch (or title) THROWS, naming the story and the missing keys', async () => {
  const msg = await expectThrow({ args: { stories: [{ id: '234', title: 'x' }] } })
  assert.match(msg, /#234/)
  assert.match(msg, /missing branch/)
  assert.match(msg, /undefined/, 'explains the consequence: it would reach a shell command')
})

test('an EXPLICIT empty list stays a legal no-op — a computed "nothing to do" is not an error', async () => {
  const { result, calls } = await runWorkflow({ args: { stories: [] }, dispatch: stdDispatch() })
  assert.equal(calls.length, 0)
  assert.deepEqual(result.batch, [])
})

test('a bare array of stories is accepted (unambiguous) and drives the batch', async () => {
  const { result } = await runWorkflow({
    args: [{ id: '234', title: 't', branch: 'b' }],
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.equal(result.batch.length, 1)
})

test('a JSON string is still accepted (the documented escape hatch keeps working)', async () => {
  const { result } = await runWorkflow({
    args: JSON.stringify({ stories: [{ id: '234', title: 't', branch: 'b' }] }),
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.equal(result.batch.length, 1)
})

test('a leading # on the id is normalized away (worktree paths and markers never carry it)', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [{ id: '#234', title: 't', branch: 'b' }] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const impl = calls.find(c => c.opts.phase === 'Implement')
  assert.match(impl.prompt, /pair-worktrees\/234\b/, 'worktree path uses the bare id')
  assert.ok(!/pair-worktrees\/#/.test(impl.prompt), 'no stray # in a shell path')
})

// ── meta must be a PURE LITERAL ────────────────────────────────────────────
// Regression guard. The loader parses `meta` statically and rejects any expression
// node, so a `+`-concatenated string (a BinaryExpression) makes the whole workflow
// UNLOADABLE — and it fails SILENTLY: the workflow simply stops appearing in the
// registry, so `Workflow({name})` reports "not found" and only an explicit
// `scriptPath` surfaces the real reason. Shipped once, in the #401 fix itself.
//
// The invariant is checked structurally: strip comments and string literals from
// the meta block, and what remains must be nothing but object/array punctuation.
// Anything else — an operator, a call, a spread, a template literal, an identifier
// reference — leaves a residue and fails here.
test('meta is a pure literal — no expression can make the workflow silently unloadable', () => {
  const open = SRC.indexOf('const meta = {')
  assert.ok(open > -1, 'meta declaration found')
  const bodyStart = SRC.indexOf('{', open)
  let depth = 0
  let bodyEnd = -1
  let inStr = null
  for (let i = bodyStart; i < SRC.length; i++) {
    const c = SRC[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') inStr = c
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) {
        bodyEnd = i
        break
      }
    }
  }
  assert.ok(bodyEnd > bodyStart, 'meta object literal is balanced')

  const residue = SRC.slice(bodyStart, bodyEnd + 1)
    .replace(/^[ \t]*\/\/.*$/gm, '') // line comments
    .replace(/'(?:[^'\\]|\\.)*'/g, '') // single-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '') // double-quoted strings
    .replace(/[A-Za-z_$][\w$]*\s*:/g, '') // property keys (inline ones too)
    .replace(/[\s{}[\],:]/g, '') // structural punctuation

  assert.equal(
    residue,
    '',
    `meta contains non-literal syntax (residue: ${JSON.stringify(residue.slice(0, 80))}). ` +
      'Every value must be a single literal — no concatenation, no template literals, no calls.',
  )
})

// ── Autonomy hardening: dead-agent handling + stacked bases ─────────────────
// Three properties that decide how many stories reach a review-approved PR without
// a human: a dead reviewer must not read as an approval, a dead authoring step must
// not lose the story, and a textual mutex must be resolvable at authoring time.

test('a DEAD reviewer is NOT a clean review: the story fails loudly instead of converging to ready-for-merge', async () => {
  // The regression: `agent()` returns null when the reviewer dies, `review?.findings ?? []`
  // yielded zero findings, the convergence test read that as "nothing actionable remains"
  // and the batch reported ready-for-merge — a PR that was never reviewed, labelled approved.
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return null // dies on both the call and its retry
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  assert.equal(result.batch[0].status, 'failed-review', 'a dead reviewer never yields ready-for-merge')
  assert.equal(result.batch[0].prNumber, 7, 'the PR handle is still surfaced so the human can pick it up')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no convergence synthesis on a failed review')
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 2, 'the review step is retried exactly once before giving up')
})

test('a dead authoring step is retried once and the story continues (a 180s supervisor kill no longer costs the card)', async () => {
  let implCalls = 0
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.phase === 'Implement') return ++implCalls === 1 ? null : { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { result, calls, logs } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  assert.equal(implCalls, 2, 'implement is attempted twice')
  assert.equal(result.batch[0].status, 'ready-for-merge', 'the story survives one dead step')
  assert.ok(
    calls.some(c => c.opts.label === 'impl:#292 retry'),
    'the retry is labelled distinctly so it is visible in the progress tree',
  )
  assert.ok(logs.some(m => /retrying once/.test(m)), 'the retry is narrated, never silent')
})

test('a story with `base` stacks on that branch: worktree forks from it and the PR targets it, not main', async () => {
  const stacked = { id: '396', title: 'T', branch: 'feat/#396-x', base: 'feature/US-395-cache-keying' }
  const { calls } = await runWorkflow({
    args: { stories: [stacked] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })

  const impl = calls.find(c => c.opts.phase === 'Implement')
  assert.ok(
    impl.prompt.includes('-B feat/#396-x feature/US-395-cache-keying'),
    'the worktree forks from the base branch, not origin/main',
  )
  assert.ok(!impl.prompt.includes('-B feat/#396-x origin/main'), 'origin/main is not used as the fork point')
  assert.ok(/STACKED on/.test(impl.prompt), 'the implementer is told it is stacked')
  assert.ok(
    /must NOT be reverted, duplicated or re-implemented/.test(impl.prompt),
    'the implementer is warned not to re-do the base story work already in its history',
  )
  const pr = calls.find(c => c.opts.phase === 'PR')
  assert.ok(
    /target `feature\/US-395-cache-keying` as the PR base branch/.test(pr.prompt),
    'the PR targets the base branch so the diff shows only this story',
  )
})

test('no `base` keeps the existing behaviour byte-for-byte (origin/main, no stacking language)', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const impl = calls.find(c => c.opts.phase === 'Implement')
  assert.ok(impl.prompt.includes('-B feat/#292-x origin/main'), 'unstacked stories still fork from origin/main')
  assert.ok(!/STACKED on/.test(impl.prompt), 'no stacking language leaks into an unstacked story')
})

test('MAX_FIX_ROUNDS allows three autonomous fix rounds before escalating', async () => {
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.label?.startsWith('flush:')) return 'flushed'
    return { fixed: true }
  }
  const { result, calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  assert.equal(result.batch[0].status, 'escalate')
  const fixes = calls.filter(c => c.opts.label?.startsWith('fix:'))
  assert.equal(fixes.length, 3, 'three fix rounds run before the human is involved')
  const reviews = calls.filter(c => c.opts.agentType === 'reviewer')
  assert.equal(reviews.length, 4, 'first review + one re-review per fix round')
})

// ── Every step goes through the Pair skill that owns it ─────────────────────
// The workflow must COMPOSE the skills, never re-implement what they do. The
// regression this guards: the open-PR step used to say "push the branch and open
// the PR using the PR template", which produced a PR that silently skipped most of
// /pair-capability-publish-pr — no `pr-state:*` label, classification tags not
// copied, no PR-URL back-link on the story, board state left behind. Observed on 5
// of 6 PRs in a real batch.
test('the open-PR step composes /pair-capability-publish-pr instead of hand-rolling the PR', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const pr = calls.find(c => c.opts.phase === 'PR')
  assert.ok(pr.prompt.includes('/pair-capability-publish-pr'), 'the PR step invokes the publish-pr skill')
  assert.ok(/Do NOT hand-roll the PR/.test(pr.prompt), 'hand-rolling is explicitly forbidden')
  for (const owned of ['pr-state:', 'classification tags', 'back-link', 'board state'])
    assert.ok(pr.prompt.includes(owned), `the prompt names "${owned}" as owned by the skill, so a reader cannot mistake it for optional`)
  // The one place where composing publish-pr could collide with this orchestrator:
  // publish-pr normally dispatches the review itself. Running inside a subagent it
  // emits `review-dispatch-required` instead — the prompt must say so, or the
  // implementer treats the signal as a failure and improvises a nested review.
  assert.ok(/review-dispatch-required/.test(pr.prompt), 'the expected non-nesting signal is named')
  assert.ok(/Do NOT dispatch or run a review yourself/.test(pr.prompt), 'the implementer is barred from reviewing its own work')
})

test('the implement and fix steps name the skills that own gating and decisions', async () => {
  const finding = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let round = 0
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return round++ === 0 ? { verdict: 'Rework', findings: [finding] } : { verdict: 'Approved', findings: [] }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch })

  const impl = calls.find(c => c.opts.phase === 'Implement')
  assert.ok(impl.prompt.includes('/pair-process-implement'), 'implement follows the process skill')
  assert.ok(impl.prompt.includes('/pair-capability-verify-quality'), 'the gate is the skill, not an improvised command')
  assert.ok(impl.prompt.includes('/pair-capability-record-decision'), 'decisions are recorded via the skill, not left in commit messages')
  assert.ok(impl.prompt.includes('/pair-capability-checkpoint $mode=write'), 'the handoff is written via the checkpoint skill')

  const fix = calls.find(c => c.opts.label?.startsWith('fix:'))
  assert.ok(fix, 'a fix round ran')
  for (const skill of [
    '/pair-process-implement',
    '/pair-capability-verify-quality',
    '/pair-capability-record-decision',
    '/pair-capability-publish-pr',
  ])
    assert.ok(fix.prompt.includes(skill), `the fix step composes ${skill}`)
  assert.ok(
    /in sync with the NEW head commit/.test(fix.prompt),
    'the fix step re-publishes so the PR describes the post-fix head, not the pre-fix state',
  )
})

test('the review step is the review PROCESS skill, and the reviewer is never asked to fix or merge', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.ok(rev.prompt.includes('/pair-process-review'), 'the review follows the process skill')
  assert.ok(rev.prompt.includes('Do NOT read .pair/working/'), 'the reviewer stays blind to the authoring handoff')
})

// ── Debts are resolved in place, never spun out into new cards ──────────────
// The regression this pins: the reviewer prompt used to say "file one via
// /pair-capability-write-issue if none exists yet" for deferred findings. One batch
// produced SIX new tech-debt issues (#426-#431) out of six PRs — findings that had been
// reviewed, understood and then parked. A finding filed as a card is a finding nobody
// fixes, and it turns a reviewed PR into unreviewed backlog.
test('the reviewer is forbidden from filing issues and told to resolve debts in this PR', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer').prompt
  assert.ok(/DO NOT FILE NEW ISSUES/.test(rev), 'the ban is stated, in the imperative')
  assert.ok(
    !/file one via \/pair-capability-write-issue/.test(rev),
    'the old "file one if none exists yet" instruction is gone — this is the exact string that produced #426-#431',
  )
  assert.ok(/never invoke \/pair-capability-write-issue/i.test(rev), 'the skill that files issues is named and forbidden')
  assert.ok(/resolved IN PLACE, in this same PR/.test(rev), 'the replacement behaviour is stated positively')
  // An existing card may still be cited — the ban is on CREATING, not on referencing.
  assert.ok(/do not create one/i.test(rev), 'citing an already-tracked story stays allowed')
  // The escape hatch must not re-open the door: an oversized finding stays actionable and
  // goes to the human, rather than being converted into a card by the agent.
  assert.ok(/leave it ACTIONABLE/.test(rev), 'an oversized finding stays actionable instead of becoming a card')
  assert.ok(/not yours to pre-empt by filing a card/.test(rev), 'the carve-out decision is the human\'s')
})

test('the fix step is likewise barred from deferring a finding into a new issue', async () => {
  const finding = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let round = 0
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer') return round++ === 0 ? { verdict: 'Rework', findings: [finding] } : { verdict: 'Approved', findings: [] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      return { fixed: true }
    },
  })
  const fix = calls.find(c => c.opts.label?.startsWith('fix:')).prompt
  assert.ok(/Fix them IN PLACE, in this PR/.test(fix), 'the fixer resolves in place')
  assert.ok(/do NOT file a follow-up issue/.test(fix), 'the fixer cannot file a follow-up either')
  assert.ok(/do NOT invoke \/pair-capability-write-issue/.test(fix), 'the issue-filing skill is named and forbidden')
  assert.ok(
    /the human decides at the merge gate, not a new card/.test(fix),
    'an oversized remainder goes to the human, not to the backlog',
  )
})

// ── A run that drove nothing must not report success ───────────────────────
// Observed: two workflows were launched concurrently on a saturated machine, every
// implementer stalled past the supervisor's window, `parallel` returned six nulls,
// and the run reported `batch: []` under the sentence "PRs are ready-for-merge or
// escalated" — success-shaped output for a run that advanced nothing. Same failure
// class as #401 (empty input reported as a completed batch), reached through total
// execution failure instead.
test('total failure is reported as failure, and names the stories that died', async () => {
  const stories = [
    { id: '1', title: 'a', branch: 'b1' },
    { id: '2', title: 'b', branch: 'b2' },
  ]
  const { result } = await runWorkflow({
    args: { stories },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      // A stalled agent is killed by the supervisor: the thunk throws, and `parallel`
      // resolves it to null. This is the shape the real run produced.
      throw new Error('agent stalled on all 6 attempts (no progress for 180000ms each)')
    },
  })
  assert.deepEqual(result.batch, [], 'nothing completed')
  assert.deepEqual(result.died, ['1', '2'], 'the dead stories are named, so the run is actionable')
  assert.match(result.note, /NOTHING COMPLETED/, 'the note leads with the failure')
  assert.doesNotMatch(
    result.note,
    /^PRs are ready-for-merge/,
    'it must not open with the success sentence',
  )
  assert.match(result.note, /worktrees is intact/, 'it says committed work survived')
})

test('a partial run reports the ratio and names only the stories that died', async () => {
  const stories = [
    { id: '1', title: 'a', branch: 'b1' },
    { id: '2', title: 'b', branch: 'b2' },
  ]
  const { result } = await runWorkflow({
    args: { stories },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (prompt.includes('story #2')) throw new Error('agent stalled') // one story dies throughout
      if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      return { fixed: true }
    },
  })
  assert.equal(result.batch.length, 1)
  assert.deepEqual(result.died, ['2'])
  assert.match(result.note, /1\/2 stories returned a result/)
  assert.match(result.note, /1 failed outright and advanced nothing/)
})

test('an explicitly empty batch still reads as a deliberate no-op, not a failure', async () => {
  const { result } = await runWorkflow({ args: { stories: [] }, dispatch: stdDispatch({}) })
  assert.deepEqual(result.batch, [])
  assert.deepEqual(result.died, [])
  assert.match(result.note, /Empty batch/)
  assert.doesNotMatch(result.note, /NOTHING COMPLETED/, 'an empty request is not a failed run')
})

// ── Review cadence: the supervisor cannot tell a long think from a hang ─────
// Measured failure: at effort 'xhigh' on a 22-file / 1600-line diff, the reviewer's
// reasoning between two tool calls exceeded the 180s no-visible-progress window and it
// was killed mid-read. Transcripts showed ordinary work (40+ turns, plain cat/sed) right
// up to `[Request interrupted by user]` — a cadence problem, not a stuck command. Six
// retries then repeated a task that never fit the window, because each restarts the
// review from scratch.
test('the reviewer runs at high effort, not xhigh, and is told to work in short observable steps', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  assert.equal(rev.opts.effort, 'high', 'xhigh reasoning gaps outrun the supervisor window')
  assert.match(rev.prompt, /PACING \(mandatory/, 'the pacing contract is stated')
  // The measurement that matters: the window is on TEXT, not on tool calls. A prompt that
  // says "do not leave gaps between tool calls" aims at the wrong target — the killed
  // reviewer was calling sed every ~5s and died anyway.
  assert.match(rev.prompt, /180 seconds without emitting a TEXT MESSAGE/, 'the real limit is named')
  assert.match(rev.prompt, /Tool calls do NOT count as progress/, 'the common misreading is pre-empted')
  assert.match(rev.prompt, /after EVERY file you inspect, write ONE SHORT LINE/, 'the required behaviour is concrete')
  assert.match(rev.prompt, /never read two files in a row without speaking in between/i, 'the failure mode is named')
  assert.match(rev.prompt, /silence is fatal/, 'the rule ends unambiguously')
  assert.match(rev.prompt, /--name-only/, 'it starts by enumerating the files so progress is observable from the first step')
})

test('the fix step keeps high effort — it was never the step that stalled', async () => {
  const finding = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let round = 0
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer') return round++ === 0 ? { verdict: 'Rework', findings: [finding] } : { verdict: 'Approved', findings: [] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      return { fixed: true }
    },
  })
  assert.equal(calls.find(c => c.opts.label?.startsWith('fix:')).opts.effort, 'high')
  assert.equal(calls.find(c => c.opts.phase === 'Implement').opts.effort, 'high')
})

// ── Severity floor: making the loop terminable without hiding anything ──────
// Measured: three PRs, three fix rounds each, findings GREW (4→5, 4→7, 4→3). Convergence
// needs zero actionable findings, so one Minor on markdown prose keeps the cycle open
// forever — and markdown prose yields Minors without limit. The floor lets the loop close
// while carrying every unblocked finding to the human.
const MINOR = { location: 'a.md:1', severity: 'Minor', description: 'wording', recommendation: 'reword' }
const MAJOR = { location: 'b.ts:2', severity: 'Major', description: 'real', recommendation: 'fix' }

test('with a Major floor, Minor-only findings converge and are carried to the gate, not discarded', async () => {
  const { result, calls } = await runWorkflow({
    args: { severityFloor: 'Major', stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'cache-hit', contract: validContract() },
      review: { verdict: 'Rework', findings: [MINOR, MINOR] },
    }),
  })
  const b = result.batch[0]
  assert.equal(b.status, 'ready-for-merge', 'Minors below the floor no longer block convergence')
  assert.equal(b.acceptedFindings.length, 2, 'both are carried to the human, not dropped')
  assert.match(
    b.acceptedFindings[0].disposition,
    /Below severity floor \(Major\)/,
    'the disposition says we chose not to block — distinct from the reviewer judging it by-design',
  )
  assert.ok(!calls.some(c => c.opts.label?.startsWith('fix:')), 'no fix round is spent on sub-floor findings')
})

test('a finding AT or ABOVE the floor still blocks and still drives a fix round', async () => {
  let round = 0
  const { result, calls } = await runWorkflow({
    args: { severityFloor: 'Major', stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer')
        return round++ === 0 ? { verdict: 'Rework', findings: [MAJOR, MINOR] } : { verdict: 'Approved', findings: [MINOR] }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      return { fixed: true }
    },
  })
  const fix = calls.find(c => c.opts.label?.startsWith('fix:'))
  assert.ok(fix, 'the Major drove a fix round')
  assert.ok(fix.prompt.includes('b.ts:2'), 'the fixer got the Major')
  assert.ok(!fix.prompt.includes('a.md:1'), 'the sub-floor Minor was not sent to the fixer')
  assert.equal(result.batch[0].status, 'ready-for-merge')
})

test('without a floor nothing changes: every actionable finding still blocks', async () => {
  const { result } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'cache-hit', contract: validContract() },
      review: { verdict: 'Rework', findings: [MINOR] },
    }),
  })
  assert.equal(result.batch[0].status, 'escalate', 'a lone Minor still blocks when no floor is asked for')
})

test('an unknown severity blocks regardless of the floor (fail safe), and a bad floor throws', async () => {
  const { result } = await runWorkflow({
    args: { severityFloor: 'Major', stories: [STORY] },
    dispatch: stdDispatch({
      contractResult: { status: 'cache-hit', contract: validContract() },
      review: { verdict: 'Rework', findings: [{ location: 'x:1', severity: 'Weird', description: 'd' }] },
    }),
  })
  assert.equal(result.batch[0].status, 'escalate', 'an unrecognised severity is treated as blocking')

  await assert.rejects(
    () => runWorkflow({ args: { severityFloor: 'Whatever', stories: [STORY] }, dispatch: stdDispatch({}) }),
    /unknown severityFloor/,
    'a typo in the floor must throw, not silently disable blocking',
  )
})

// ── Options must survive a JSON-string `args` ───────────────────────────────
// Real bug: the runtime can hand this script `args` as a JSON STRING. parseBatchArgs
// normalized it, but severityFloor was read off the RAW value, where
// `typeof args === 'object'` is false — so the floor was silently ignored and a batch ran
// with Minors still blocking while the caller believed the floor was in force. Observed on
// a live run: three PRs escalated on Minor-only findings under `severityFloor: 'Major'`.
test('severityFloor is honoured whether args arrives as an object or as a JSON string', async () => {
  const story = { id: '1', title: 't', branch: 'b' }
  const minorOnly = stdDispatch({
    contractResult: { status: 'cache-hit', contract: validContract() },
    review: { verdict: 'Rework', findings: [{ location: 'a.md:1', severity: 'Minor', description: 'd' }] },
  })
  for (const [shape, args] of [
    ['object', { severityFloor: 'Major', stories: [story] }],
    ['JSON string', JSON.stringify({ severityFloor: 'Major', stories: [story] })],
  ]) {
    const { result } = await runWorkflow({ args, dispatch: minorOnly })
    assert.equal(result.batch[0].status, 'ready-for-merge', `floor must apply with args as ${shape}`)
    assert.equal(result.batch[0].acceptedFindings.length, 1, `the Minor is carried to the gate (${shape})`)
  }
})

test('a bad severityFloor throws even when args is a JSON string', async () => {
  await assert.rejects(
    () => runWorkflow({ args: JSON.stringify({ severityFloor: 'Nope', stories: [{ id: '1', title: 't', branch: 'b' }] }), dispatch: stdDispatch({}) }),
    /unknown severityFloor/,
    'a typo must not be swallowed by the string path either',
  )
})

// ── needsHumanDecision buys one fix round before escalating ─────────────────
// Measured: a reviewer raising the flag skipped the fixer ENTIRELY, so four consecutive
// rounds on one story and two on another produced review after review and zero commits —
// the orchestrator writing detailed fix instructions for an agent never invoked. A
// reviewer raising it says "one of these needs a human", not "none can be fixed".
test('needsHumanDecision spends one fix round first, then escalates if it still stands', async () => {
  const f = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let round = 0
  const { result, calls, logs } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer') { round++; return { verdict: 'Rework', findings: [f], needsHumanDecision: true } }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      if (opts.label?.startsWith('flush:')) return 'flushed'
      return { fixed: true }
    },
  })
  assert.ok(calls.some(c => c.opts.label?.startsWith('fix:')), 'a fix round runs despite the flag')
  assert.equal(calls.filter(c => c.opts.label?.startsWith('fix:')).length, 1, 'exactly ONE — the request is honoured on its second occurrence')
  assert.equal(result.batch[0].status, 'escalate', 'the escalation is deferred, never dropped')
  assert.ok(logs.some(m => /asked for a human decision/.test(m)), 'the deferral is narrated')
})

test('a flag raised only AFTER a fix round still escalates on that round', async () => {
  const f = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let round = 0
  const { result, calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.agentType === 'reviewer')
        return { verdict: 'Rework', findings: [f], needsHumanDecision: round++ > 0 }
      if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
      if (opts.phase === 'PR') return { prNumber: 7 }
      if (opts.label?.startsWith('flush:')) return 'flushed'
      return { fixed: true }
    },
  })
  // Round 0 has no flag → normal fix. Round 1 raises it → one more fix round, then escalate.
  assert.equal(result.batch[0].status, 'escalate')
  assert.equal(calls.filter(c => c.opts.label?.startsWith('fix:')).length, 2)
})

test('args.model routes implement, review and fix; absent, each agent keeps its frontmatter tier', async () => {
  const f = { location: 'x.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }
  let n = 0
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') return n++ === 0 ? { verdict: 'Rework', findings: [f] } : { verdict: 'Approved', findings: [] }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { model: 'fable', stories: [STORY] }, dispatch })
  for (const label of ['impl:', 'rev:', 'fix:'])
    assert.equal(
      calls.find(c => c.opts.label?.startsWith(label)).opts.model,
      'fable',
      `${label} runs on the requested model`,
    )

  const { calls: bare } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.ok(!('model' in bare.find(c => c.opts.label?.startsWith('impl:')).opts), 'no override without one asked for')
})

test('an unknown model throws instead of silently running the wrong tier', async () => {
  await assert.rejects(
    () => runWorkflow({ args: { model: 'gpt', stories: [STORY] }, dispatch: stdDispatch({}) }),
    /unknown model "gpt"/,
  )
})

// ── Text shape: the artifacts this loop produces are read again, many times ──
// The PR body is re-read by every reviewer and every fixer of the cycle; the working log by
// the escalate-flush and the final synthesis. Prose that restates the diff is paid on each of
// those reads. These pin the rule where it is actually consumed — a prompt clause that
// silently stops being interpolated is indistinguishable from one that was never written.

// One round with a finding, then clean: exercises PR + review + fix + synth in a single run.
const shapeDispatch = () => {
  let rev = 0
  return (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.agentType === 'reviewer') {
      rev++
      return rev === 1
        ? { verdict: 'Rework', findings: [{ location: 'a.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }] }
        : { verdict: 'Approved', findings: [] }
    }
    if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.label?.startsWith('synth:')) return 'posted'
    return { fixed: true }
  }
}

test('the text-shape rule reaches the prompts whose output gets re-read', async () => {
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch: shapeDispatch() })
  const pr = calls.find(c => c.opts.phase === 'PR')
  const rev = calls.find(c => c.opts.agentType === 'reviewer')
  const synth = calls.find(c => c.opts.label?.startsWith('synth:'))
  for (const [name, c] of [['PR', pr], ['review', rev], ['synthesis', synth]]) {
    assert.ok(c, `no ${name} call`)
    assert.ok(c.prompt.includes('TEXT SHAPE (mandatory)'), `${name} prompt lost the shape rule`)
  }
})

test('the shape rule protects evidence: it forbids narration, never the failure case', async () => {
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch: shapeDispatch() })
  const review = calls.find(c => c.opts.agentType === 'reviewer').prompt
  // A rule that merely said "be brief" would trade a review round for a few words. The
  // asymmetry — cut narration, keep the failure case and the proof — IS the rule.
  assert.ok(review.includes('KEEP AT FULL LENGTH'), 'the keep-clause is gone')
  assert.ok(review.includes('CONCRETE FAILURE CASE'), 'the failure case is no longer protected')
  assert.ok(review.includes('EVIDENCE it is real'), 'the evidence clause is gone')
  assert.ok(review.includes('Cut narration, never evidence'), 'the asymmetry is gone')
})

test('the fix step carries the shape rule — it is the only step that rewrites the PR body mid-cycle', async () => {
  // Measured regression: the first run of this rule left PR bodies BIGGER (#423 16.2k -> 17.6k
  // tokens). A resumed cycle passes `prNumber`, which skips the PR step entirely, so the rule
  // sat on a prompt that never ran while the fix step re-invoked publish-pr without it and
  // each round appended another section.
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch: shapeDispatch() })
  const fix = calls.find(c => c.opts.label?.startsWith('fix:'))
  assert.ok(fix, 'no fix call')
  assert.ok(fix.prompt.includes('TEXT SHAPE (mandatory)'), 'the fix step lost the shape rule')
  assert.ok(
    fix.prompt.includes('do not append a round-by-round history'),
    'nothing stops the PR body from growing one section per round',
  )
})

test('the fix step logs a round as table rows, not a paragraph per finding', async () => {
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch: shapeDispatch() })
  const fix = calls.find(c => c.opts.label?.startsWith('fix:'))
  assert.ok(fix, 'no fix call')
  assert.ok(fix.prompt.includes('COMPACT TABLE'), 'the log round is not constrained to a table')
  assert.ok(
    fix.prompt.includes('severity | location | what changed | commit'),
    'the columns are gone — without them "table" is unspecified',
  )
})

test('the convergence synthesis stays COMPLETE while becoming a table', async () => {
  const { calls } = await runWorkflow({ args: { stories: [STORY] }, dispatch: shapeDispatch() })
  const synth = calls.find(c => c.opts.label?.startsWith('synth:'))
  assert.ok(synth, 'no synthesis call')
  assert.ok(synth.prompt.includes('ONE MARKDOWN TABLE'), 'synthesis is not a table')
  // Compression must never become truncation: this comment is the merge-gate reader's whole
  // view of the cycle, so a dropped finding is a finding nobody sees.
  assert.ok(synth.prompt.includes('EVERY finding recorded across ALL runs'), 'completeness lost')
  assert.ok(synth.prompt.includes('no silent truncation'), 'the anti-truncation clause is gone')
})

// ═══════════════════════════════════════════════════════════════════════════
// US-219 T1 — pins on the behaviour the generalization must not lose.
//
// These run BEFORE the refactor, deliberately. Every one of them passes today;
// their job is to fail the moment a step of the generalization drops something
// the current engine guarantees. A refactor that keeps the tests green but
// loses the guarantee is exactly what a pin like this exists to prevent.
// ═══════════════════════════════════════════════════════════════════════════

// AC5 — merge is the human gate, on EVERY path.
// Not "the happy path does not merge": no execution path may, including the ones
// reached by escalation and by a dead agent. Asserted over every dispatched prompt
// and every returned status, so a new step cannot quietly acquire the authority.
test('US-219 AC5: no dispatched prompt ever instructs a merge, on any path', async () => {
  const paths = [
    { name: 'convergence', reviews: [{ verdict: 'Approved', findings: [] }] },
    {
      name: 'fix then converge',
      reviews: [
        { verdict: 'Rework', findings: [{ location: 'a.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }] },
        { verdict: 'Approved', findings: [] },
      ],
    },
    {
      name: 'escalation (never converges)',
      reviews: Array.from({ length: 8 }, () => ({
        verdict: 'Rework',
        findings: [{ location: 'a.ts:1', severity: 'Major', description: 'd', recommendation: 'r' }],
      })),
    },
  ]

  for (const path of paths) {
    let i = 0
    const { calls, result } = await runWorkflow({
      args: { stories: [STORY] },
      dispatch: (prompt, opts) => {
        if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
        if (opts.agentType === 'reviewer') return path.reviews[Math.min(i++, path.reviews.length - 1)]
        if (opts.phase === 'Implement') return { gatesPassed: true, branch: 'b' }
        if (opts.phase === 'PR') return { prNumber: 7 }
        return { fixed: true }
      },
    })

    for (const c of calls) {
      // The engine says "Do NOT merge" in prose; what must never appear is an
      // INSTRUCTION to merge. Match the imperative, not the word.
      assert.ok(
        !/\b(?:please\s+)?merge (?:the|this|it)\b(?![^.]*\bnot\b)/i.test(c.prompt.replace(/Do NOT merge\.?/gi, '')),
        `${path.name}: ${c.opts.label} was told to merge`,
      )
    }
    for (const row of result.batch ?? [])
      assert.notStrictEqual(row.status, 'merged', `${path.name}: a card reported itself merged`)
  }
})

// AC5 — the authoring steps carry the prohibition explicitly, not by omission.
// A step that simply never mentions merging is one prompt edit away from doing it;
// the ban has to be written where the agent reads it.
test('US-219 AC5: every step that can push carries an explicit no-merge instruction', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  for (const phase of ['Implement', 'PR']) {
    const c = calls.find(x => x.opts.phase === phase)
    assert.ok(c, `no ${phase} call`)
    assert.match(c.prompt, /do not merge/i, `${phase} lost its explicit no-merge instruction`)
  }
})

// AC4 — one fresh subagent per card per step (ADR-017 §3). Context isolation is an
// architectural invariant, so the pin is on the SHAPE of the dispatch: N distinct
// agent() calls, never one context handed a second story to iterate over.
test('US-219 AC4: each step is its own subagent call, and no call carries two stories', async () => {
  const two = [STORY, { ...STORY, id: '293', branch: 'feature/US-293-other' }]
  const { calls } = await runWorkflow({
    args: { stories: two },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })

  const work = calls.filter(c => c.opts.agentType !== 'contract-generator')
  assert.ok(work.length >= 4, 'expected at least implement+PR per story')

  for (const c of work) {
    const mentioned = two.filter(s => c.prompt.includes(`#${s.id}`) || c.prompt.includes(s.branch))
    assert.ok(
      mentioned.length <= 1,
      `${c.opts.label} names ${mentioned.length} stories — a shared context, not a fresh one`,
    )
  }

  // Distinct labels per (story, step): a reused label would mean a reused agent.
  const labels = work.map(c => c.opts.label)
  assert.strictEqual(new Set(labels).size, labels.length, `duplicate labels: ${labels.join(', ')}`)
})

// ── US-219 T2 / AC1 — the engine stops being pair-shaped ───────────────────
// Every value below is pair's today. The generalization must make each one a
// DEFAULT rather than a literal, so an adopter with different skill names, a
// different worktree root or a different base branch can drive the same engine.
// The two directions are tested together on purpose: a config that is read but
// whose defaults drifted breaks pair's own dogfood run, and defaults that are
// right but never overridable ship an engine only pair can use.

const PAIR_DEFAULTS = {
  implement: '/pair-process-implement',
  publishPr: '/pair-capability-publish-pr',
  review: '/pair-process-review',
  verifyQuality: '/pair-capability-verify-quality',
  checkpoint: '/pair-capability-checkpoint',
  worktreeRoot: '../pair-worktrees',
  auditLog: '.pair/working/reviews',
  baseBranch: 'origin/main',
  reviewTemplate: 'code-review-template.md',
}

test('US-219 AC1: with no configuration, every pair default is still in the prompts', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const all = calls.map(c => c.prompt).join('\n')
  for (const [key, value] of Object.entries(PAIR_DEFAULTS))
    assert.ok(all.includes(value), `zero-config run lost the ${key} default (${value})`)
})

test('US-219 AC1: a caller-supplied pipeline replaces every pair literal', async () => {
  const pipeline = {
    skills: {
      implement: '/acme-build',
      publishPr: '/acme-open-pr',
      review: '/acme-review',
      verifyQuality: '/acme-gate',
      checkpoint: '/acme-save',
    },
    worktreeRoot: '../acme-trees',
    auditLogDir: '.acme/audit',
    baseBranch: 'origin/trunk',
    reviewTemplate: 'acme-review-format.md',
  }
  const { calls } = await runWorkflow({
    args: { stories: [STORY], pipeline },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const all = calls.map(c => c.prompt).join('\n')

  for (const v of [...Object.values(pipeline.skills), '../acme-trees', '.acme/audit', 'origin/trunk', 'acme-review-format.md'])
    assert.ok(all.includes(v), `configured value ${v} never reached a prompt`)

  // And the pair values must be GONE — a config that is merely appended, leaving the
  // hardcoded value in place, would send the agent two contradictory instructions.
  for (const [key, value] of Object.entries(PAIR_DEFAULTS))
    assert.ok(!all.includes(value), `pair's ${key} literal (${value}) survived the override`)
})

// A misconfigured pipeline must fail LOUDLY, like #401's card list. The failure mode
// these prevent is the quiet one: the run proceeds on values the caller did not choose
// and reports success, which is indistinguishable from a run that did what was asked.
test('US-219 AC1: an unknown skill key throws instead of being dropped in silence', async () => {
  await assert.rejects(
    () => runWorkflow({ args: { stories: [STORY], pipeline: { skills: { implment: '/typo' } } }, dispatch: stdDispatch({}) }),
    /unknown .*skills\.implment/,
  )
})

test('US-219 AC1: an empty override throws rather than interpolating an empty string', async () => {
  // `worktreeRoot: ''` would reach the shell as `git worktree add /292` — a path at the
  // filesystem root. Falling back to the default would be just as wrong: the caller asked
  // for something and would never learn the request was discarded.
  await assert.rejects(
    () => runWorkflow({ args: { stories: [STORY], pipeline: { worktreeRoot: '   ' } }, dispatch: stdDispatch({}) }),
    /worktreeRoot.*is empty/,
  )
})

test('US-219 AC1: a non-object pipeline throws and says how to opt out', async () => {
  await assert.rejects(
    () => runWorkflow({ args: { stories: [STORY], pipeline: 'defaults' }, dispatch: stdDispatch({}) }),
    /must be an object/,
  )
})

test('US-219 AC1: a partial pipeline keeps the defaults it did not mention', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY], pipeline: { skills: { review: '/acme-review' } } },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const all = calls.map(c => c.prompt).join('\n')
  assert.ok(all.includes('/acme-review'), 'the one override did not apply')
  // An all-or-nothing merge would have blanked these.
  assert.ok(all.includes('/pair-process-implement'), 'an unmentioned skill lost its default')
  assert.ok(all.includes('../pair-worktrees'), 'an unmentioned path lost its default')
})

// ── US-219 T3 / AC6 — bounded fan-out ──────────────────────────────────────
// The cap has to be enforced INSIDE the workflow: the sandbox `parallel` primitive is an
// unbounded `Promise.all` and cannot limit anything on its own. So the test measures the
// real peak concurrency rather than trusting that the option was read — a cap that is
// parsed and then ignored looks identical from the outside to one that works.

/** Drives N stories and reports the highest number of them in flight at once. */
async function peakConcurrency(stories, args = {}) {
  let inFlight = 0
  let peak = 0
  const dispatch = async (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.phase === 'Implement') {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, 5))
      inFlight--
      return { gatesPassed: true, branch: 'b' }
    }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { result } = await runWorkflow({ args: { stories, ...args }, dispatch })
  return { peak, result }
}

const manyStories = n =>
  Array.from({ length: n }, (_, i) => ({
    id: String(300 + i),
    title: `story ${i}`,
    branch: `feature/US-${300 + i}-x`,
  }))

test('US-219 AC6: maxParallelism caps how many cards are in flight at once', async () => {
  const { peak, result } = await peakConcurrency(manyStories(6), { maxParallelism: 2 })
  assert.ok(peak <= 2, `cap of 2 was exceeded — peak was ${peak}`)
  assert.strictEqual(result.batch.length, 6, 'every card must still be driven, just not at once')
})

test('US-219 AC6: an absent cap keeps today unbounded fan-out', async () => {
  // Existing callers must not silently change behaviour when this option lands.
  const { peak } = await peakConcurrency(manyStories(6))
  assert.strictEqual(peak, 6, `expected all 6 in flight, saw ${peak}`)
})

test('US-219 AC6: a cap of 0 or a negative/non-numeric value throws, never falls back to unbounded', async () => {
  // The #401 failure direction: an option silently discarded runs the batch on settings the
  // caller did not choose — and here the discarded setting is the one holding back load.
  for (const bad of [0, -1, 'two', 1.5, null]) {
    await assert.rejects(
      () => peakConcurrency(manyStories(2), { maxParallelism: bad }),
      /maxParallelism/,
      `maxParallelism: ${JSON.stringify(bad)} was accepted`,
    )
  }
})

test('US-219 AC6: a cap larger than the batch is harmless', async () => {
  const { peak, result } = await peakConcurrency(manyStories(3), { maxParallelism: 99 })
  assert.strictEqual(peak, 3)
  assert.strictEqual(result.batch.length, 3)
})

test('US-219 AC6: under a cap, results keep INPUT order and a dead card does not kill the batch', async () => {
  // The batch maps results positionally back onto the story list, so an out-of-order return
  // would attribute one card's outcome to another — a silent mix-up, not a crash. And a
  // throwing thunk must resolve to null rather than reject, or one dead agent cancels the
  // cards still in flight. Both are `parallel`'s contract; the bounded version must match it.
  const order = []
  const dispatch = async (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.phase === 'Implement') {
      const id = (prompt.match(/#(\d{3})/) ?? [])[1]
      // Later stories finish FIRST, so a naive push-on-completion would reverse the list.
      await new Promise(r => setTimeout(r, id === '300' ? 15 : 1))
      if (id === '301') throw new Error('agent died')
      order.push(id)
      return { gatesPassed: true, branch: 'b' }
    }
    if (opts.phase === 'PR') return { prNumber: 7 }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }

  const stories = manyStories(4)
  const { result } = await runWorkflow({ args: { stories, maxParallelism: 2 }, dispatch })

  assert.ok(order.length >= 2 && order[0] !== '300', 'the fixture did not actually finish out of order')

  // The survivors keep INPUT order, not completion order.
  const survivors = stories.map(s => s.id).filter(id => id !== '301')
  assert.deepStrictEqual(
    result.batch.map(r => r.story.id),
    survivors,
    'results were not realigned to the input order',
  )
  // The card whose agent threw is REPORTED, not silently missing: three completed, one named
  // in `died`. A batch that just came back shorter would read as a smaller batch, not a loss.
  assert.deepStrictEqual(result.died, ['301'], 'the dead card was not reported')
  assert.strictEqual(result.batch.length, 3, 'a dead card took the others down with it')
})

// ── US-219 T4 / AC7 — the contract pair-loop codes against ─────────────────
// #250 consumes this shape. It is pinned here rather than only documented, because a
// return field that quietly changes name breaks a caller that this repo cannot see.

test('US-219 AC7: `cards` is the contract key, and `stories` still works', async () => {
  const dispatch = stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } })
  const viaCards = await runWorkflow({ args: { cards: [STORY] }, dispatch })
  const viaStories = await runWorkflow({ args: { stories: [STORY] }, dispatch })
  assert.strictEqual(viaCards.result.batch.length, 1, '`cards` was not accepted')
  assert.strictEqual(viaStories.result.batch.length, 1, '`stories` (the pair-era name) stopped working')
})

test('US-219 AC7: passing BOTH cards and stories throws instead of picking one', async () => {
  // Silently preferring one would run a batch the caller did not describe.
  await assert.rejects(
    () => runWorkflow({ args: { cards: [STORY], stories: [STORY] }, dispatch: stdDispatch({}) }),
    /both `cards` and `stories`/,
  )
})

test('US-219 AC7: every batch row carries the documented per-card fields', async () => {
  const { result } = await runWorkflow({
    args: { cards: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  const STATUSES = new Set([
    'ready-for-merge', 'escalate',
    'failed-implement', 'failed-pr', 'failed-review', 'failed-fix',
  ])
  for (const row of result.batch) {
    assert.strictEqual(row.id, STORY.id, 'row is missing the top-level `id` pair-loop reads')
    assert.ok(STATUSES.has(row.status), `status "${row.status}" is outside the documented set`)
  }
})

test('US-219 AC7: the batch-level shape is exactly the four documented keys', async () => {
  const { result } = await runWorkflow({
    args: { cards: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  for (const k of ['contracts', 'batch', 'died', 'note'])
    assert.ok(k in result, `batch-level key \`${k}\` is missing`)
  assert.ok(Array.isArray(result.batch) && Array.isArray(result.died) && Array.isArray(result.contracts))
  assert.strictEqual(typeof result.note, 'string')
})

test('US-219 AC7: an explicitly empty card list stays a legal no-op', async () => {
  const { result, calls } = await runWorkflow({ args: { cards: [] }, dispatch: stdDispatch({}) })
  assert.strictEqual(calls.length, 0, 'an empty batch spawned agents')
  assert.match(result.note, /Empty batch/)
})
