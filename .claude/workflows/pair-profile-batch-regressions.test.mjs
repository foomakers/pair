// #617 AC-1/2/3: batch dispatch keeps the card tier and bounds its configuration relay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { resolveProfile } from '../skills/pair-workflow-cycle/scripts/workflow-profile.mjs'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const source = () => readFileSync(new URL('./pair-implement-batch.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const argsFor = () => ({
  cards: ['red', 'green'].map((tier, i) => ({ id: String(617 + i), title: 'Profile routing', branch: `feature/US-${617 + i}-profile`, tier: `risk:${tier}` })),
  policyText: '',
})

async function evaluate(args, agent, timers = {}) {
  const parallel = functions => Promise.all(functions.map(fn => fn()))
  const pipeline = (items, ...steps) => Promise.all(items.map(async (item, index) => {
    let result = item
    for (const step of steps) result = await step(result, item, index)
    return result
  }))
  return new AsyncFunction('args', 'agent', 'parallel', 'pipeline', 'log', 'setTimeout', 'clearTimeout', source())(
    args, agent, parallel, pipeline, () => {}, timers.setTimeout ?? setTimeout, timers.clearTimeout ?? clearTimeout,
  )
}

function tierSnapshot() {
  const root = mkdtempSync(join(tmpdir(), 'pair-batch-profile-'))
  try {
    mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
    writeFileSync(join(root, '.pair/adoption/tech/automation.md'), '## Model Policy\n\nrisk:red: frontier\nrisk:green: cheap\n')
    writeFileSync(join(root, 'pair.config.json'), JSON.stringify({ workflowProfiles: { default: 'tiered', inline: {
      tiered: { name: 'tiered', defaults: { engine: 'claude', model: 'by-tier' }, modelClasses: { frontier: 'opus', cheap: 'haiku' } },
    } } }))
    const snapshot = resolveProfile({ root })
    return { ...snapshot, byTier: Object.fromEntries(['risk:red', 'risk:green'].map(tier => [tier, resolveProfile({ root, tier }).stages])) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test(`#617 r0-9: implement dispatch resolves each card's by-tier model from one snapshot`, async () => {
    const snapshot = tierSnapshot()
    const work = []
    let resolutions = 0
    await evaluate(argsFor(), async (_prompt, opts) => {
      if (opts.label === 'profile:resolve') { resolutions++; return snapshot }
      if (opts.label === 'root:resolve') return { root: '/tmp/pair-worktrees' }
    if (opts.label?.startsWith('worktree:inspect')) return { path: `${'/tmp/pair-worktrees'}/${opts.label.split(':')[2].replace(/^#/, '')}`, created: false, available: true }
      if (String(opts.label).startsWith('prepare:phase')) return { outcome: 'nothing-to-prepare' }
      if (opts.agentType === 'pair-implementer') {
        work.push({ label: opts.label, model: opts.model })
        return { status: 'redirect', next: { step: 'blocked', reason: 'needs-human' } }
      }
      return {}
    })
    assert.equal(resolutions, 1, 'one immutable configuration read for the batch')
    assert.deepEqual(work.map(call => [call.label.match(/#(\d+)/)?.[1], call.model]).sort(), [['617', 'opus'], ['618', 'haiku']])
  })

test(`#617 r0-10: implement profile relay obeys agentTimeoutMinutes and never starts work`, async () => {
    const calls = []
    const scheduled = []
    const running = evaluate({ ...argsFor(), agentTimeoutMinutes: 0.01 }, (_prompt, opts) => {
      calls.push(opts.label)
      return new Promise(() => {})
    }, {
      setTimeout: (callback, milliseconds) => { scheduled.push(milliseconds); queueMicrotask(callback); return 1 },
      clearTimeout: () => {},
    }).then(value => ({ value }), error => ({ error }))
    // An event-loop turn observes the deterministic timer callback; no wall-clock sleep.
    const outcome = await Promise.race([running, new Promise(resolve => setImmediate(() => resolve({ pending: true })))])
    assert.equal(outcome.pending, undefined, 'profile resolution must settle at the configured bound')
    assert.deepEqual(scheduled, [600])
    assert.match(String(outcome.error?.message ?? outcome.value?.reason ?? ''), /profile.*timeout/i)
    assert.deepEqual(calls, ['profile:resolve'], 'a timed-out live relay is never retried or followed by work')
  })

test(`#617 engine default map: implement relay selects its actual Claude host profile`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-batch-engine-map-'))
  try {
    writeFileSync(join(root, 'pair.config.json'), JSON.stringify({ workflowProfiles: {
      default: { codex: 'codex-medium', claude: 'claude-medium' }, inline: {
        'codex-medium': { name: 'codex-medium', defaults: { engine: 'codex', model: 'gpt-6-sol' } },
        'claude-medium': { name: 'claude-medium', defaults: { engine: 'claude', model: 'sonnet' } },
      },
    } }))
    const work = []
    let resolutions = 0
    await evaluate(argsFor(), async (prompt, opts) => {
      if (opts.label === 'root:resolve') return { root: '/tmp/pair-worktrees' }
    if (opts.label?.startsWith('worktree:inspect')) return { path: `${'/tmp/pair-worktrees'}/${opts.label.split(':')[2].replace(/^#/, '')}`, created: false, available: true }
      if (opts.label === 'profile:resolve') {
        resolutions++
        assert.match(prompt, /resolve --root \. --host claude/)
        const result = spawnSync(process.execPath, [new URL('../skills/pair-workflow-cycle/scripts/workflow-profile.mjs', import.meta.url).pathname, 'resolve', '--root', root, '--host', 'claude'], { encoding: 'utf8' })
        assert.equal(result.status, 0, result.stdout)
        const snapshot = JSON.parse(result.stdout)
        assert.equal(snapshot.name, 'claude-medium')
        return snapshot
      }
      if (String(opts.label).startsWith('prepare:phase')) return { outcome: 'nothing-to-prepare' }
      if (opts.agentType === 'pair-implementer') {
        work.push(opts.model)
        return { status: 'redirect', next: { step: 'blocked', reason: 'needs-human' } }
      }
      return {}
    })
    assert.equal(resolutions, 1)
    assert.deepEqual(work, ['sonnet', 'sonnet'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
