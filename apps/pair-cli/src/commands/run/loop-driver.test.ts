import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import { readIterationOutcome, toLines } from './stream-reader'
import { spawnIteration } from './spawn'

/**
 * US-573 T-8 — e2e over a recorded workflow stream: banner, live lines, audit, summary, exit code.
 * The engine is a fake `runIteration` that replays the fixture through the real stream reader.
 */

const cwd = '/project'

function projectFs() {
  return new InMemoryFileSystemService(
    {
      [`${cwd}/config.json`]: JSON.stringify({
        asset_registries: {
          skills: {
            source: '.skills',
            behavior: 'overwrite',
            description: 'skills',
            prefix: 'pair',
            targets: [{ path: '.claude/skills/', mode: 'canonical' }],
          },
        },
      }),
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      '/bin/claude': '',
      '/bin/codex': '',
      [`${cwd}/${POLICY_PATH}`]:
        '## Eligibility\n\nrisk:green\n\n## Stop Predicate\n\nmax-iterations: 5\nidle-timeout: 900\n',
    },
    cwd,
    cwd,
  )
}

const replay =
  (fixture: string): IterationRunner =>
  input => {
    const content = readFileSync(join(__dirname, '__fixtures__', fixture), 'utf-8')
    const chunks = (async function* () {
      yield content
    })()
    return readIterationOutcome(toLines(chunks), input.engine, undefined, input.onRunEvent)
  }

function capture() {
  const out: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => (out.push(String(chunk)), true))
  vi.spyOn(console, 'log').mockImplementation((...args) => void out.push(`${args.join(' ')}\n`))
  const err: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args) => void err.push(`${args.join(' ')}\n`))
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => (err.push(String(chunk)), true))
  return { out: () => out.join(''), err: () => err.join('') }
}

async function drive(fixture: string, flags: Record<string, unknown> = {}) {
  const audit: string[] = []
  const io = capture()
  const code = await handleRunCommand(parseRunCommand({ root: '212', ...flags }), projectFs(), {
    runIteration: replay(fixture),
    runAudit: (_path, line) => void audit.push(line),
  })
  return { code, ...io, audit: audit.map(line => JSON.parse(line) as Record<string, unknown>) }
}

describe('pair run — live progress wiring (US-573 T-8)', () => {
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('prints the absolute audit path and the idle timeout source in the banner', async () => {
    const { out } = await drive('claude-workflow-events.jsonl')
    expect(out()).toContain(`Audit: ${cwd}/.pair/working/automation/loop-audit.md (live JSONL`)
    expect(out()).toContain(
      'Idle timeout: 900s (source: ## Stop Predicate idle-timeout) · total cap: none',
    )
  })

  it('a completed workflow run: live lines, summary with cards and eligible-left, exit 0', async () => {
    const { code, out } = await drive('claude-workflow-events.jsonl')
    expect(code).toBe(0)
    expect(out()).toMatch(/card-start ENG-12 Linear card\n/)
    expect(out()).toMatch(/stage ENG-12 review PR #41\n/)
    expect(out()).toContain('Cards: 0 merged · 1 parked · 0 prepared · 0 failed')
    expect(out()).toMatch(
      /stopped: the skill reported itself finished.*, 0 eligible card\(s\) left/,
    )
  })

  it('#704 F11: a completed Codex loop settles while the engine is still shutting down', async () => {
    const stream = readFileSync(join(__dirname, '__fixtures__/codex-workflow-events.jsonl'), 'utf8')
    const program = `require('node:fs').writeFileSync(1, ${JSON.stringify(stream)}); setInterval(() => {}, 1000)`
    const audit: string[] = []
    capture()

    const code = await handleRunCommand(
      parseRunCommand({ root: '212', engine: 'codex', iterationTimeout: '1' }),
      projectFs(),
      {
        runIteration: input =>
          spawnIteration({
            ...input,
            cwd: tmpdir(),
            engine: {
              ...input.engine,
              command: process.execPath,
              headlessArgs: ['-e', program, '--'],
            },
          }),
        runAudit: (_path, line) => void audit.push(line),
      },
    )

    expect(code).toBe(0)
    expect(JSON.parse(audit.at(-1)!)).toMatchObject({
      event: 'loop-end',
      detail: { status: 'completed' },
    })
  })

  const formatError = 'missing-field:inputHead'
  const handoff = (reason: string) => JSON.stringify({ status: 'failed', reason })
  const progress = 'PAIR_EVENT {"event":"loop-end","status":"halted","reason":"handoff rejected"}'
  const handoffThenProgress = [handoff(formatError), progress].join('\n')
  const progressThenHandoff = [progress, handoff(formatError)].join('\n')
  const keepAlive = 'setInterval(() => {}, 1000)'

  it.each([
    {
      label: 'echoed progress and a file-only handoff',
      streamResult: progress,
      file: handoff(formatError),
      retry: true,
    },
    {
      label: 'a handoff before echoed progress',
      streamResult: handoffThenProgress,
      file: handoffThenProgress,
      retry: true,
    },
    {
      label: 'a handoff after echoed progress',
      streamResult: progressThenHandoff,
      file: progressThenHandoff,
      retry: true,
    },
    {
      label: 'a file-only handoff before echoed progress',
      file: handoffThenProgress,
      retry: true,
    },
    {
      label: 'progress quoted in Markdown',
      streamResult: `> ${progress}`,
      file: handoff(formatError),
      retry: true,
    },
    {
      label: 'progress quoted in prose',
      streamResult: `Observed ${progress}`,
      file: handoff(formatError),
      retry: true,
    },
    {
      label: 'a stream decision beside progress',
      streamResult: `${progress} ${handoff('gate-red')}`,
      file: handoff(formatError),
      failure: 'halted: handoff rejected',
    },
    {
      label: 'a file handoff beside progress',
      file: `${progress} ${handoff(formatError)}`,
      retry: true,
    },
    {
      label: 'a handoff after an incomplete progress record',
      streamResult: ['PAIR_EVENT {"event":"loop-end",', handoff('gate-red')].join('\n'),
      file: handoff(formatError),
      failure: 'halted: handoff rejected',
    },
    {
      label: 'a genuine decision carrying event metadata',
      streamResult: JSON.stringify({ status: 'failed', event: 'loop-end', reason: 'gate-red' }),
      file: handoff(formatError),
      failure: 'halted: handoff rejected',
    },
    { label: 'file-only format error', file: handoff(formatError), retry: true },
    {
      label: 'stream format error',
      streamResult: handoff(formatError),
      file: handoff('gate-red'),
      retry: true,
    },
    {
      label: 'stream decision with a live child',
      streamResult: handoff('gate-red'),
      file: handoff(formatError),
      shutdown: keepAlive,
      failure: 'halted: handoff rejected',
    },
    { label: 'file-only decision', file: handoff('gate-red'), failure: 'halted: handoff rejected' },
    { label: 'malformed file', file: '{broken', failure: 'halted: handoff rejected' },
    { label: 'missing file', failure: 'halted: handoff rejected' },
    {
      label: 'unclean exit',
      file: handoff(formatError),
      shutdown: 'process.exitCode = 1',
      failure: 'last-message finalization did not exit cleanly',
    },
    {
      label: 'finalization timeout',
      iterationTimeout: '1',
      file: handoff(formatError),
      shutdown: keepAlive,
      failure: 'stalled: no terminal event within 1s',
    },
  ])('#704 F12/F13: handles a Codex loop HALT with $label', async row => {
    const { file, streamResult, shutdown, failure, retry, iterationTimeout = '5' } = row
    const prompts: string[] = []
    const { out } = capture()
    const code = await handleRunCommand(
      parseRunCommand({ root: '212', engine: 'codex', iterationTimeout }),
      projectFs(),
      {
        runIteration: input => {
          prompts.push(input.promptText)
          const first = prompts.length === 1
          const text = first
            ? ['pair-loop: HALT — handoff rejected', streamResult].join('\n')
            : 'done'
          const events = [
            ...(first
              ? [
                  {
                    type: 'item.completed',
                    item: { type: 'command_execution', aggregated_output: progress, exit_code: 0 },
                  },
                ]
              : []),
            { type: 'item.completed', item: { type: 'agent_message', text } },
            { type: 'turn.completed' },
          ]
          const stream = events.map(event => JSON.stringify(event)).join('\n') + '\n'
          const program = `const fs = require('node:fs')
            const output = process.argv[process.argv.indexOf('--output-last-message') + 1]
            const file = ${first ? JSON.stringify(file) : 'undefined'}
            if (file !== undefined) fs.writeFileSync(output, file)
            fs.writeFileSync(1, ${JSON.stringify(stream)})
            ${first ? (shutdown ?? '') : ''}`
          return spawnIteration({
            ...input,
            cwd: tmpdir(),
            engine: {
              ...input.engine,
              command: process.execPath,
              headlessArgs: ['-e', program, '--'],
            },
          })
        },
        runAudit: () => undefined,
      },
    )

    expect(prompts).toHaveLength(retry ? 2 : 1)
    expect(code).toBe(retry ? 0 : 1)
    if (retry) {
      expect(prompts[1]).toContain(`handoff validation: ${formatError}.`)
      expect(prompts[1]).toContain(prompts[0]!)
    } else {
      expect(out()).toContain(failure)
    }
  })

  it('counts a prepared terminal card separately from failures', async () => {
    const runIteration: IterationRunner = input => {
      input.onRunEvent?.({ event: 'card-end', card: '596', status: 'prepared' })
      return replay('claude-success.jsonl')(input)
    }
    const { out } = capture()
    const code = await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(code).toBe(0)
    expect(out()).toContain('0 merged · 0 parked · 1 prepared · 0 failed')
  })

  it.each(['escalated', 'escalate'])(
    'counts a %s card-end as failed in the loop summary',
    async status => {
      const runIteration: IterationRunner = input => {
        input.onRunEvent?.({ event: 'card-end', card: '596', status })
        return replay('claude-success.jsonl')(input)
      }
      const { out } = capture()
      await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
        runIteration,
        runAudit: () => undefined,
      })
      expect(out()).toContain('Cards: 0 merged · 0 parked · 0 prepared · 1 failed')
    },
  )

  it('counts a card-end without status as failed in the loop summary', async () => {
    const runIteration: IterationRunner = input => {
      input.onRunEvent?.({ event: 'card-end', card: '596' })
      return replay('claude-success.jsonl')(input)
    }
    const { out } = capture()
    await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(out()).toContain('Cards: 0 merged · 0 parked · 0 prepared · 1 failed')
  })

  it.each(['awaiting-human', 'ready-for-merge', 'target-ready'])(
    'counts a %s card-end as parked in the loop summary',
    async status => {
      const runIteration: IterationRunner = input => {
        input.onRunEvent?.({ event: 'card-end', card: '596', status })
        return replay('claude-success.jsonl')(input)
      }
      const { out } = capture()
      await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
        runIteration,
        runAudit: () => undefined,
      })
      expect(out()).toContain('Cards: 0 merged · 1 parked · 0 prepared · 0 failed')
    },
  )

  it('counts the latest escalation after preparation as failed', async () => {
    const runIteration: IterationRunner = input => {
      input.onRunEvent?.({ event: 'card-end', card: '596', status: 'prepared' })
      input.onRunEvent?.({ event: 'card-end', card: '596', status: 'escalated' })
      return replay('claude-success.jsonl')(input)
    }
    const { out } = capture()
    await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(out()).toContain('Cards: 0 merged · 0 parked · 0 prepared · 1 failed')
  })

  it('keeps an unknown card-end out of the failed count', async () => {
    const runIteration: IterationRunner = input => {
      input.onRunEvent?.({ event: 'card-end', card: '596', status: 'unknown' })
      return replay('claude-success.jsonl')(input)
    }
    const { out } = capture()
    await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(out()).toContain('Cards: 0 merged · 0 parked · 0 prepared · 0 failed · 1 unknown')
  })

  it.each([
    ['merged', '1 merged · 0 parked · 0 prepared · 0 failed'],
    ['failed', '0 merged · 0 parked · 0 prepared · 1 failed'],
  ])('a card prepared then %s counts once under its latest result', async (last, line) => {
    const runIteration: IterationRunner = input => {
      input.onRunEvent?.({ event: 'card-end', card: '596', status: 'prepared' })
      input.onRunEvent?.({ event: 'card-end', card: '596', status: last })
      return replay('claude-success.jsonl')(input)
    }
    const { out } = capture()
    await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(out()).toContain(line)
  })

  it('the audit opens with loop-start (root + effective policy) and carries every event, then loop-end', async () => {
    const { audit } = await drive('claude-workflow-events.jsonl')
    expect(audit[0]).toMatchObject({ event: 'loop-start', card: null, detail: { root: cwd } })
    expect((audit[0]!['detail'] as { policy: unknown }).policy).toMatchObject({
      eligibility: 'risk:green',
      idleTimeout: { seconds: 900, source: '## Stop Predicate idle-timeout' },
    })
    expect(audit.filter(l => l['card'] === 'ENG-12').map(l => l['event'])).toEqual([
      'card-start',
      'stage',
      'stage',
      'card-end',
    ])
    expect(audit.at(-1)).toMatchObject({ event: 'loop-end', detail: { status: 'completed' } })
  })

  it('a workflow HALT under a successful engine turn exits non-zero and says halted (AC6)', async () => {
    const { code, out, audit } = await drive('claude-workflow-halt.jsonl')
    expect(code).toBe(1)
    expect(out()).toMatch(/stopped: an iteration failed .*halted: audit write/)
    expect(audit.at(-1)).toMatchObject({ event: 'loop-end', detail: { status: 'halted' } })
  })

  it('--json: stdout is NDJSON events only; the banner goes to stderr', async () => {
    const { out, err } = await drive('claude-workflow-events.jsonl', { json: true })
    const lines = out().trim().split('\n')
    expect(lines.length).toBeGreaterThan(5)
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
    expect(err()).toContain('Audit:')
  })

  it("--quiet: today's iteration line, no live event lines", async () => {
    const { out } = await drive('claude-workflow-events.jsonl', { quiet: true })
    expect(out()).toContain('Iteration 1: success')
    expect(out()).not.toContain('card-start')
  })

  it('an engine stream with no intermediate events degrades to start/end lines, stated once', async () => {
    const { out } = await drive('claude-success.jsonl', { maxIterations: '2' })
    expect(out().match(/progress degrades to start\/end lines/g)).toHaveLength(1)
    expect(out()).toMatch(/iteration 1 start\n/)
    expect(out()).toMatch(
      /iteration 1 success — terminal event: success — no parseable result in the last agent message: …done\n/,
    )
  })
})

describe('pair run — the loop path hands the engine a max fix rounds (r2-6, fix-max-wiring)', () => {
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('r2-6-w6: every iteration input carries an integer maxFixRounds >= 1', async () => {
    const seen: unknown[] = []
    const runIteration: IterationRunner = input => {
      seen.push((input as { maxFixRounds?: unknown }).maxFixRounds)
      return replay('claude-workflow-events.jsonl')(input)
    }
    capture()
    await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
      runIteration,
      runAudit: () => undefined,
    })
    expect(seen.length).toBeGreaterThan(0)
    for (const max of seen) {
      expect(Number.isInteger(max)).toBe(true)
      expect(max as number).toBeGreaterThanOrEqual(1)
    }
  })
})
