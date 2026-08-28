import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CODEX_FANOUT_ASSET } from '../tools/build-codex-asset'
import { compileKbAsset } from '../tools/build-kb-asset'
import { PHASE_CONTRACTS, PHASES, type JsonSchema } from '../tools/codex-fanout'

/**
 * Three guards over the Codex fan-out realization, all of them mechanical.
 *
 * 1. DRIFT — the two committed copies of the asset are build outputs of one tested source.
 *    Editing a copy by hand, or editing the source without regenerating, turns this red.
 * 2. SMOKE — the shipped asset is what the skill actually runs, so it is executed here as
 *    the skill executes it. The logic is unit-tested in `tools/codex-fanout.test.ts`; this
 *    is the CLI-behaviour check the testing convention asks for instead of unit-testing a
 *    script.
 * 3. RESULT-CONTRACT PARITY — the per-phase return schemas exist twice: once in the
 *    in-harness workflow the Claude realization runs, once in the module the Codex
 *    realization runs. Two realizations of ONE capability must validate a subagent's return
 *    the same way, and prose cannot hold that. The workflow's own constants are read out of
 *    its source and compared, so a divergence fails on whichever side moves first — the
 *    approach the driver's tier-parity guard already established for the policy grammar.
 */

const REPO_ROOT = join(__dirname, '../../../..')
const WORKFLOW = join(REPO_ROOT, '.claude/workflows/pair-implement-batch.js')
const SOURCE = join(REPO_ROOT, CODEX_FANOUT_ASSET.source)

describe('the shipped asset is a build output, not a hand-maintained file', () => {
  const expected = compileKbAsset(readFileSync(SOURCE, 'utf8'), CODEX_FANOUT_ASSET)

  it.each(CODEX_FANOUT_ASSET.targets)('the committed copy matches a fresh compile — %s', target => {
    expect(readFileSync(join(REPO_ROOT, target), 'utf8')).toBe(expected)
  })

  it('names its source and its regeneration command in the generated header', () => {
    expect(expected).toContain('GENERATED FILE')
    expect(expected).toContain('src/tools/codex-fanout.ts')
    expect(expected).toContain('codex:asset')
  })

  it('carries no story-local acceptance marker into the shipped corpus', () => {
    expect(expected).not.toMatch(/\bAC\d+\b/)
  })
})

describe('the shipped asset runs as the skill invokes it', () => {
  const asset = join(REPO_ROOT, '.pair/knowledge/assets/codex-fanout.cjs')

  const run = (command: string, request: unknown): { code: number; body: unknown } => {
    try {
      const out = execFileSync('node', [asset, command], {
        input: JSON.stringify(request),
        encoding: 'utf8',
      })
      return { code: 0, body: JSON.parse(out) }
    } catch (err) {
      const e = err as { status?: number; stdout?: string }
      return { code: e.status ?? 1, body: JSON.parse(e.stdout ?? '{}') }
    }
  }

  it('binds a probed v1 session and announces the primitive it bound to', () => {
    const { code, body } = run('bind', { probe: { tools: ['spawn_agent', 'wait_agent'] } })
    expect(code).toBe(0)
    expect(body).toMatchObject({
      tier: 1,
      realization: 'codex-multi-agent-v1',
      primitive: 'spawn_agent',
    })
  })

  it('degrades on a probe miss instead of assuming the harness has the primitive', () => {
    const { body } = run('bind', { probe: { tools: ['shell'] } })
    expect(body).toMatchObject({ tier: 3, realization: 'degraded-one-card' })
  })

  it('binds a Claude Code session to tier 1 rather than announcing a degradation to its audit', () => {
    // Against the previously shipped asset this exact request returned
    // {"tier":3,"realization":"degraded-one-card","announcement":"… degrading to the one-card
    // path…"} — a false line printed and written to the audit on every Claude Code run.
    const { code, body } = run('bind', {
      probe: {
        tools: ['Workflow', 'Task', 'Read', 'Bash', 'Edit'],
        externalDriverAvailable: false,
      },
    })
    expect(code).toBe(0)
    expect(body).toMatchObject({
      tier: 1,
      realization: 'claude-code-workflow',
      dispatch: 'delegated-run',
      primitive: 'Workflow',
    })
    expect(String((body as { announcement: string }).announcement)).not.toContain('degrading')
  })

  it('hands the caller a wait bound to apply, instead of a timeout it would have to invent', () => {
    const { body } = run('bind', { probe: { tools: ['spawn_agent', 'wait_agent'] } }) as {
      body: { waitTimeoutKeys: { max: string } | null; waitTimeoutMs: number | null }
    }
    expect(body.waitTimeoutKeys?.max).toBeTruthy()
    expect(body.waitTimeoutMs).toBeNull()
    const probed = run('bind', {
      probe: { tools: ['spawn_agent', 'wait_agent'], harnessWaitTimeoutMs: 600000 },
    })
    expect(probed.body).toMatchObject({ waitTimeoutMs: 600000 })
  })

  it('exits non-zero on a top-level `workingPath` instead of guarding the default it overrides', () => {
    // Previously exit 0, emitting a packet with "blind":true carrying the author's checkpoint.
    const { code, body } = run('packet', {
      workingPath: '.pair/scratch',
      packet: {
        phase: 'review',
        card: { id: '441', title: 't', branch: 'b' },
        attachments: ['.pair/scratch/checkpoints/441.md'],
      },
    })
    expect(code).toBe(1)
    expect(String((body as { error: string }).error)).toContain('.pair/scratch/')
  })

  it('exits non-zero on a `fix` packet with no findings, instead of a fixer with nothing to fix', () => {
    // Previously exit 0 with the findings silently dropped: the fixer returned {"fixed":true},
    // the re-review re-raised the same findings, and the card burned all 3 rounds to `escalate`.
    const dropped = run('packet', {
      packet: {
        phase: 'fix',
        card: { id: '441', title: 't', branch: 'b' },
        findings: [
          { location: 'a.ts:1', severity: 'Major', description: 'd', recommendation: 'r' },
        ],
      },
    })
    expect(dropped.code).toBe(0)
    expect((dropped.body as { findings: unknown[] }).findings).toHaveLength(1)
    expect(
      run('packet', { packet: { phase: 'fix', card: { id: '441', title: 't', branch: 'b' } } })
        .code,
    ).toBe(1)
  })

  it('takes a run-level audit record and never resumes it as a card', () => {
    const audit = [
      '{"kind":"run","run":"r1","realization":"claude-code-workflow","announcement":"bound"}',
      '{"run":"r1","iteration":0,"id":"441","phase":"implement","outcome":"completed"}',
    ].join('\n')
    const plans = run('resume', { audit }).body as { id: string }[]
    expect(plans.map(p => p.id)).toEqual(['441'])
  })

  it('exits non-zero when a review packet would carry the working area', () => {
    const { code, body } = run('packet', {
      packet: {
        phase: 'review',
        card: { id: '1', title: 't', branch: 'b' },
        attachments: ['.pair/working/checkpoints/1.md'],
      },
    })
    expect(code).toBe(1)
    expect(String((body as { error: string }).error)).toContain('.pair/working/checkpoints/1.md')
  })

  it('exits non-zero on an OVERRIDDEN working area, and on a parent-relative spelling of one', () => {
    // Both were accepted by the shipped asset — exit 0 with `blind:true`, carrying the author's
    // checkpoint into the reviewer's packet. They are re-run HERE, against the built artifact,
    // because that is the file the skill actually invokes.
    const overridden = run('packet', {
      packet: {
        phase: 'review',
        card: { id: '441', title: 't', branch: 'b' },
        attachments: ['.pair/scratch/checkpoints/441.md'],
        workingPath: '.pair/scratch',
      },
    })
    expect(overridden.code).toBe(1)
    const traversal = run('packet', {
      packet: {
        phase: 'review',
        card: { id: '441', title: 't', branch: 'b' },
        attachments: ['../../pair/.pair/working/checkpoints/441.md'],
      },
    })
    expect(traversal.code).toBe(1)
  })

  it('never lets a caller-supplied schema replace the phase contract', () => {
    const { body } = run('collect', {
      phase: 'review',
      result: { status: 'ok', value: {} },
      schema: { type: 'object' },
    })
    expect(body).toMatchObject({ outcome: 'failed-validation', advances: false })
  })

  it('does not refuse a card forever because an earlier run recorded a failure', () => {
    const audit = [
      { iteration: 1, id: '441', phase: 'implement', outcome: 'timed-out' },
      { iteration: 2, id: '441', phase: 'implement', outcome: 'completed' },
    ]
      .map(r => JSON.stringify(r))
      .join('\n')
    const { body } = run('resume', { audit, id: '441' })
    expect(body).toMatchObject({ halted: false, redispatch: ['pr', 'review'] })
  })

  it('converges an approved review instead of owing a fix nobody asked for', () => {
    expect(run('converge', { review: { verdict: 'APPROVED', findings: [] } }).body).toMatchObject({
      action: 'converged',
    })
    expect(
      run('converge', {
        review: { verdict: 'CHANGES-REQUESTED', findings: [{ severity: 'Major' }] },
        round: 3,
      }).body,
    ).toMatchObject({ action: 'escalate' })
  })
})

/**
 * The workflow's schema constants, read from its source the way the driver's parity guard
 * reads its policy helpers: slice the self-contained declaration block and evaluate it. The
 * block is bounded by two markers; a rename must fail loudly here rather than silently slice
 * nothing and let every comparison pass against an empty object.
 */
function workflowSchemas(): Record<string, JsonSchema> {
  const source = readFileSync(WORKFLOW, 'utf8')
  const start = source.indexOf('const STEP_SCHEMA = {')
  const end = source.indexOf('// ── Phase 0: ensure machine contracts')
  if (start === -1 || end === -1 || end <= start)
    throw new Error(
      `${WORKFLOW} no longer contains the schema declaration block this guard slices ` +
        `(\`const STEP_SCHEMA = {\` … \`// ── Phase 0: ensure machine contracts\`); update the markers`,
    )
  const block = source.slice(start, end)
  const factory = new Function(
    `${block}\nreturn { implement: STEP_SCHEMA, pr: PR_SCHEMA, review: LOOSE_REVIEW_SCHEMA, fix: FIX_SCHEMA }`,
  ) as () => Record<string, JsonSchema>
  return factory()
}

describe('one result contract, two realizations', () => {
  const fromWorkflow = workflowSchemas()

  it.each([...PHASES])('the %s return schema is identical on both sides', phase => {
    expect(PHASE_CONTRACTS[phase].schema).toEqual(fromWorkflow[phase])
  })

  it('covers every phase the workflow declares a schema for', () => {
    expect(Object.keys(fromWorkflow).sort()).toEqual([...PHASES].sort())
  })
})
