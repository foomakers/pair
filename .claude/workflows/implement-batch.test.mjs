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
  const parallel = fns => Promise.all(fns.map(f => f()))
  const result = await new AsyncFunction('args', 'agent', 'parallel', SRC)(args, agent, parallel)
  return { result, calls }
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
  assert.ok(
    rev.prompt.includes('NOT by itself a reason'),
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
  assert.equal(rev.opts.effort, 'xhigh')
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
  assert.ok(rev.prompt.includes('Critical, Major, Minor'), 'default severities fallback')
  assert.ok(rev.prompt.includes('Comment Only'), 'default verdict fallback')
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
  assert.ok(synth, 'immediate convergence on a continuation still synthesizes (remediated seeded true)')
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
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'clean fresh review on resume → no synthesis (remediated stayed false)')
})

test('#373 fresh story: no continuation probe runs (fresh path unchanged, AC6)', async () => {
  const { calls } = await runWorkflow({
    args: { stories: [STORY] },
    dispatch: stdDispatch({ contractResult: { status: 'cache-hit', contract: validContract() } }),
  })
  assert.ok(!calls.some(c => c.opts.label?.startsWith('probe:')), 'no existence-probe on a fresh (non-resume) story')
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
  // suppress a second first-review. remediated stays false (no log to continue), so a
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

test('#373 probe queries BOTH signals and is dialed to the cheap model/effort policy (haiku/low)', async () => {
  const dispatch = (prompt, opts) => {
    if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
    if (opts.label?.startsWith('probe:')) return { logExists: false, firstReviewPosted: false }
    if (opts.agentType === 'reviewer') return { verdict: 'Approved', findings: [] }
    return { fixed: true }
  }
  const { calls } = await runWorkflow({ args: { stories: [RESUME_STORY] }, dispatch })
  const probe = calls.find(c => c.opts.label?.startsWith('probe:'))
  assert.ok(probe, 'probe runs on resume')
  assert.equal(probe.opts.model, 'haiku', 'probe uses the cheap model')
  assert.equal(probe.opts.effort, 'low', 'probe uses low effort')
  assert.ok(probe.prompt.includes('logExists') && probe.prompt.includes('firstReviewPosted'), 'probe reports both the log-existence and the PR-side first-review signal')
})

test('#373 finding 1: the first review emits a hidden marker and the probe matches it DETERMINISTICALLY (no semantic template-structure judgment)', async () => {
  // The probe runs at haiku/low. It must NOT classify a comment by reading its structure
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

test('#373 finding 3: both escalate-flush prompts share ONE authored convention block (supersede + out-of-band + untracked-worktree), so they cannot diverge', async () => {
  // MAX_FIX_ROUNDS escalation (fresh-story path, remediated set by a prior fix round).
  const finding = { location: 'x.ts:1', severity: 'Minor', description: 'never fixed', recommendation: 'r' }
  const maxRoundsFlush = (await runWorkflow({
    args: { stories: [STORY] },
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
  const designFlush = (await runWorkflow({
    args: { stories: [RESUME_STORY] },
    dispatch: (prompt, opts) => {
      if (opts.agentType === 'contract-generator') return { status: 'cache-hit', contract: validContract() }
      if (opts.label?.startsWith('probe:')) return { logExists: true, firstReviewPosted: true }
      if (opts.agentType === 'reviewer') return { verdict: 'Rework', findings: [finding] }
      if (opts.label?.startsWith('flush:')) return 'flushed'
      return { needsHumanDecision: true } // fixer escalates a design disagreement
    },
  })).calls.find(c => c.opts.label?.startsWith('flush:'))

  assert.ok(maxRoundsFlush && designFlush, 'both escalation paths post a flush')
  // The extracted convention block is byte-identical in both prompts (single source of truth).
  const block = /SUPERSEDES the last[\s\S]*prevents a duplicate first review on the next run\)/
  const a = maxRoundsFlush.prompt.match(block)
  const b = designFlush.prompt.match(block)
  assert.ok(a && b, 'both flush prompts carry the shared convention block')
  assert.equal(a[0], b[0], 'the convention block is identical in both flush prompts (no drift)')
})

test('#373 escalate ON A CONTINUATION: resume + existing log + never-converging re-review keeps the log, flushes (remediated seeded true), supersedes prior flush, no synth (AC5 on the resume path)', async () => {
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
  // remediated was seeded true by the continuation, so the flush fires even though the
  // escalation happened on round-0 of a RESUMED cycle (fresh-story path only reaches the
  // guarded flush after a fix round sets remediated).
  const flush = calls.find(c => c.opts.label?.startsWith('flush:'))
  assert.ok(flush, 'continuation escalation posts a flush (remediated seeded true from the existing log)')
  assert.ok(flush.prompt.includes('x.ts:1'), 'flush carries the still-open findings')
  assert.ok(flush.prompt.includes('Do NOT delete the log'), 'the continuation anchor log is kept')
  assert.ok(/minimize|supersede/i.test(flush.prompt), 'a new escalate-flush supersedes/minimizes the prior one (finding 2)')
  assert.ok(!calls.some(c => c.opts.label?.startsWith('synth:')), 'no synthesis on escalation')
})
