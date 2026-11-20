// #646 AC-9 (r1-4): every stop `pair run`'s cycle driver can emit has exactly one STOP_CATALOG row with a class
// and a scripted resume — enumerated from the driver's own code and real outcomes, never a hand list.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROCESS_STOPS, runCycle, type CycleNext, type CycleStageResult } from './cycle'

interface Row {
  status: string
  class: string
  resume: string
}
const root = resolve(__dirname, '../../../../..')
const source = (file: string): string => readFileSync(resolve(root, file), 'utf8')
const url = pathToFileURL(
  resolve(root, 'packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-state.mjs'),
).href
const loaded = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `import { STOP_CATALOG } from ${JSON.stringify(url)}; process.stdout.write(JSON.stringify(STOP_CATALOG))`,
  ],
  { encoding: 'utf8' },
)
const CATALOG = JSON.parse(loaded.stdout) as Row[]

const covered = (rows: Row[], status: string): boolean => {
  const matches = rows.filter(row => row.status === status)
  return (
    matches.length === 1 &&
    ['process', 'decision', 'finding'].includes(matches[0]!.class) &&
    matches[0]!.resume.trim() !== ''
  )
}

const steps = [
  ...source('apps/pair-cli/src/commands/run/cycle.ts')
    .match(/const DISPATCHABLE_STEPS = new Set\(\[([^\]]+)\]/)![1]!
    .matchAll(/'([^']+)'/g),
].map(m => m[1]!)

const drive = async (step: string, stage: CycleStageResult, next?: CycleNext): Promise<string> => {
  const due = next ?? { step, phase: step === 'green' ? 'r1-g1' : 'a0', attempt: 1 }
  const outcome = await runCycle({
    resolve: async () => ({ status: 'in-progress', next: due }),
    worktree: async () => ({ path: '/w' }),
    packet: async () => ({ step, prompt: 'p', worktree: '/w' }),
    spawnStage: async () => stage,
    policy: { deadDispatchRetries: 0 },
  })
  return outcome.status
}

/** The driver's emitted stops: real outcomes per dispatchable step, plus every literal stop status in its code. */
async function emitted(): Promise<Set<string>> {
  const out = new Set<string>()
  for (const step of steps) {
    out.add(
      await drive(step, {
        processOutcome: 'success',
        final: { status: 'failed', reason: 'unprovable' },
      }),
    )
    out.add(await drive(step, { processOutcome: 'failed' }))
    out.add(await drive(step, { processOutcome: 'failed', stalled: true }))
    out.add(
      await drive(step, {
        processOutcome: 'success',
        final: { status: 'failed', reason: 'gate-flake' },
      }),
    )
  }
  out.add(
    await drive(
      'prepare',
      { processOutcome: 'success' },
      { step: 'blocked', reason: 'needs-human', budget: 'autoRecoveryRounds' },
    ),
  )
  for (const file of ['cycle.ts', 'cycle-wiring.ts'])
    for (const m of source(`apps/pair-cli/src/commands/run/${file}`).matchAll(
      /status: '((?:failed-|needs-|awaiting-|escalat)[^']*)'/g,
    ))
      out.add(m[1]!)
  return out
}

describe('AC-9 (r1-4): the pair run driver is inside the stop catalogue', () => {
  it('US-602 AC6: worktree conflict is one manual decision, outside process recovery', () => {
    expect(CATALOG.filter(row => row.status === 'worktree-conflict')).toEqual([
      expect.objectContaining({ class: 'decision', resume: expect.stringContaining('by hand') }),
    ])
    expect(PROCESS_STOPS.has('worktree-conflict')).toBe(false)
  })
  it('every stop status the driver emits has exactly one row with a class and a scripted resume', async () => {
    const statuses = await emitted()
    expect([...statuses].filter(s => !covered(CATALOG, s))).toEqual([])
    for (const step of steps) expect(statuses.has(`failed-${step}`)).toBe(true)
    expect(statuses.has('awaiting-human')).toBe(true)
  })

  it.each(steps)('control: dropping the failed-%s row fails coverage', step => {
    expect(covered(CATALOG, `failed-${step}`)).toBe(true)
    expect(
      covered(
        CATALOG.filter(row => row.status !== `failed-${step}`),
        `failed-${step}`,
      ),
    ).toBe(false)
  })

  it('PROCESS_STOPS is exactly the catalogue process class', () => {
    expect([...PROCESS_STOPS].sort()).toEqual(
      CATALOG.filter(row => row.class === 'process')
        .map(row => row.status)
        .sort(),
    )
  })
})
