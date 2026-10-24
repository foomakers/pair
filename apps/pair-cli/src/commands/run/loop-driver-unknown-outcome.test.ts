import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand, type IterationRunner } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import { readIterationOutcome, toLines } from './stream-reader'
import { cardLine, type CardView } from './run-renderer'
import type { RunEvent } from './run-events'

/**
 * r3-8: a card closed with the explicit `unknown` status (claude progress-opened, no readable
 * returned status) is its own outcome — never counted in the summary's `failed`, never painted ✖.
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
  (fixture: string, extra: readonly RunEvent[] = []): IterationRunner =>
  input => {
    for (const event of extra) input.onRunEvent?.(event)
    const content = readFileSync(join(__dirname, '__fixtures__', fixture), 'utf-8')
    const chunks = (async function* () {
      yield content
    })()
    return readIterationOutcome(toLines(chunks), input.engine, undefined, input.onRunEvent)
  }

async function drive(runIteration: IterationRunner) {
  const out: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => (out.push(String(chunk)), true))
  vi.spyOn(console, 'log').mockImplementation((...args) => void out.push(`${args.join(' ')}\n`))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const code = await handleRunCommand(parseRunCommand({ root: '212' }), projectFs(), {
    runIteration,
    runAudit: () => undefined,
  })
  const summary =
    out
      .join('')
      .split('\n')
      .find(line => line.includes('Cards:')) ?? ''
  return { code, summary }
}

const ended = (card: string, status: string): RunEvent[] => [
  { event: 'card-start', card },
  { event: 'card-end', card, status },
]

const T0 = 1_000_000
const closed = (status: string): CardView => ({ id: '573', status, startedAt: T0, endedAt: T0 })
const line = (status: string) => cardLine(closed(status), { columns: 80, color: true, now: T0 })
const RED_CROSS = '\x1b[31m✖'

describe('pair run — the unknown card outcome (r3-8)', () => {
  beforeEach(() => vi.stubEnv('PATH', '/bin'))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('W1: the live claude run (exit 0) does not report its unknown card as failed', async () => {
    const { code, summary } = await drive(replay('claude-live-workflow-progress.jsonl'))
    expect(code).toBe(0)
    expect(summary).not.toMatch(/\b1 failed\b/)
    expect(summary).toMatch(/\b1 unknown\b/)
  })

  it('C1: a real failed card is still counted failed', async () => {
    const { summary } = await drive(replay('claude-success.jsonl', ended('9', 'failed')))
    expect(summary).toMatch(/\b1 failed\b/)
    expect(summary).not.toMatch(/\b[1-9] unknown\b/)
  })

  it('I1: merged + failed + unknown each land in their own bucket', async () => {
    const extra = [...ended('7', 'merged'), ...ended('8', 'failed'), ...ended('9', 'unknown')]
    const { summary } = await drive(replay('claude-success.jsonl', extra))
    expect(summary).toMatch(/\b1 merged\b/)
    expect(summary).toMatch(/\b0 parked\b/)
    expect(summary).toMatch(/\b1 failed\b/)
    expect(summary).toMatch(/\b1 unknown\b/)
  })

  it('W2: an unknown card line is not painted with the red failure cross', () => {
    expect(line('unknown')).not.toContain(RED_CROSS)
    expect(line('unknown')).toContain('unknown')
  })

  it('C2: a failed card line keeps the red cross, a merged one the check', () => {
    expect(line('failed')).toContain(RED_CROSS)
    expect(line('merged')).toContain('✔')
  })
})
