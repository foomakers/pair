import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import { readIterationOutcome, toLines } from './stream-reader'

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
    expect(out()).toContain('Cards: 0 merged · 1 parked · 0 failed')
    expect(out()).toMatch(
      /stopped: the skill reported itself finished.*, 0 eligible card\(s\) left/,
    )
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
    expect(out()).toMatch(/iteration 1 success — terminal event: success\n/)
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
