import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * US-597 AC4 (r1-g2, r0-1) — live guard: when implementation starts, `cycle-state resolve` rereads the card's
 * prerequisites through `prereqState` (the one grammar) and blocks truthfully; nothing is read for other steps.
 */
const SCRIPT = join(
  __dirname,
  '../../../../../.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs',
)
type Next = { step: string; mode?: string; phase?: string }
type Card = { body?: string; state?: string; stateReason?: string; labels?: { name: string }[] }
type Resolve = (o: Record<string, unknown>) => { next: Next }
let resolve: Resolve
beforeAll(async () => {
  ;({ resolve } = (await import(pathToFileURL(SCRIPT).href)) as { resolve: Resolve })
})

const MERGED: Card = { state: 'CLOSED', stateReason: 'COMPLETED', labels: [] }
const OPEN: Card = { state: 'OPEN', labels: [] }

function pm(cards: Record<string, Card>) {
  const reads: string[] = []
  return {
    reads,
    pm: {
      readCard: (id: string, o: { fields?: string[] } = {}) => {
        reads.push(id)
        const card = cards[id]
        if (card === undefined) throw Object.assign(new Error('HTTP 502'), { kind: 'failed' })
        const all = card as Record<string, unknown>
        return o.fields
          ? Object.fromEntries(o.fields.filter(f => f in all).map(f => [f, all[f]]))
          : { body: card.body }
      },
    },
  }
}

function at(entry: string, host: ReturnType<typeof pm>, extra: Record<string, unknown> = {}) {
  const root = join(mkdtempSync(join(tmpdir(), 'live-guard-')), '.pair/working/runs')
  const dir = join(root, 'story-42/42')
  mkdirSync(dir, { recursive: true })
  return resolve({
    dir,
    runsRoot: root,
    workflowVersion: '4.0.1',
    policy: {},
    entry,
    story: '42',
    inputs: 'abc',
    acHash: 'sha256:00',
    host,
    ...extra,
  }).next
}

describe('implementation-entry live guard (resolve)', () => {
  it.each([
    ['L-1a open prerequisite (prose)', 'Depends on #3', { 3: OPEN }, /#?3\b/],
    [
      'L-1b open prerequisite (canonical field)',
      '**Prerequisite Stories**: #3',
      { 3: OPEN },
      /#?3\b/,
    ],
    [
      'L-3b open prerequisite parked by needs-review',
      'Depends on #3',
      { 3: { state: 'OPEN', labels: [{ name: 'needs-review' }] } },
      /parked/,
    ],
    ['L-4 unreadable prerequisite state fails closed', 'Depends on #3', {}, /unreadable/],
    ['L-5 unrecognised declaration', 'Depends on the billing epic', {}, /unrecognised/],
  ])('%s blocks, reason names the cause', (_n, body, others, reason) => {
    const next = at('fresh', pm({ 42: { body }, ...others }))
    expect(next.step).toBe('blocked')
    expect(JSON.stringify(next)).toMatch(reason)
  })

  it('L-2 prerequisite merged at selection then reopened before implementation start blocks (live reread)', () => {
    const body = 'Depends on #3'
    expect(at('fresh', pm({ 42: { body }, 3: MERGED })).step).toBe('implement')
    expect(at('fresh', pm({ 42: { body }, 3: OPEN })).step).toBe('blocked')
  })

  it('C-1 control: every prerequisite merged lets implementation start', () => {
    const next = at('fresh', pm({ 42: { body: 'Depends on #3' }, 3: MERGED }))
    expect([next.step, next.mode, next.phase]).toEqual(['implement', 'initial', 'a0'])
  })

  it('C-2 control: no prerequisite declared lets implementation start', () => {
    expect(at('fresh', pm({ 42: { body: '**Prerequisite Stories**: none' } })).step).toBe(
      'implement',
    )
  })

  it('C-3 control: PR entry (verify) does not reread prerequisites', () => {
    const host = pm({ 42: { body: 'Depends on #3' }, 3: OPEN })
    expect(at('pr', host, { pr: 7 }).step).toBe('verify')
    expect(host.reads).toEqual([])
  })

  it('C-5 control: merged (closed COMPLETED) prerequisite stays merged though labelled', () => {
    const merged = { ...MERGED, labels: [{ name: 'needs-review' }] }
    expect(at('fresh', pm({ 42: { body: 'Depends on #3' }, 3: merged })).step).toBe('implement')
  })
})

describe('implementation-entry live guard (CLI wiring, real filesystem adapter)', () => {
  function cli(body: string): Next {
    const story = '01-01-002'
    const main = mkdtempSync(join(tmpdir(), 'live-guard-cli-'))
    const backlog = join(main, '.pair/adoption/product/backlog/03-user-stories/not-started')
    mkdirSync(join(main, '.pair/adoption/tech'), { recursive: true })
    mkdirSync(backlog, { recursive: true })
    writeFileSync(
      join(main, '.pair/adoption/tech/way-of-working.md'),
      '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n',
    )
    writeFileSync(
      join(backlog, '01-01-002-pay.md'),
      `# US ${story}: Pay\n\n**Status**: Refined\n\n${body}\n`,
    )
    const runs = join(main, '.pair/working/runs')
    const dir = join(runs, `story-${story}`, story)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, '.host-binding.json'),
      JSON.stringify({ schemaVersion: 1, pmTool: 'filesystem', codeHost: 'github' }),
    )
    const r = spawnSync(
      process.execPath,
      [
        SCRIPT,
        'resolve',
        '--dir',
        dir,
        '--workflowVersion',
        '4.0.1',
        '--policy',
        '{}',
        '--entry',
        'fresh',
        '--story',
        story,
        '--inputs',
        'abc',
        '--acHash',
        'sha256:00',
        '--runsRoot',
        runs,
      ],
      { cwd: main, encoding: 'utf8' },
    )
    return (JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}') as { next: Next }).next
  }

  it('L-6 blocks implementation entry on an unrecognised dependency declaration', () => {
    const next = cli('**Prerequisite Stories**: 01-01-001')
    expect(next.step).toBe('blocked')
    expect(JSON.stringify(next)).toMatch(/unrecognised/)
  })

  it('C-4 control: no dependency declaration starts implementation', () => {
    expect(cli('plain body').step).toBe('implement')
  })
})
