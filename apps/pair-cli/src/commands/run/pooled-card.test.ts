import { describe, it, expect, afterEach } from 'vitest'
import { buildCardProcessArgs, optionsOfArgv, runCardInProcess } from './parallel'
import { parseRunCommand } from './parser'
import { pooledCard } from './pooled-card'
import { runEventLine, type RunEvent } from './run-events'
import type { RootCandidate } from './root-plan'

const card = (id: string): RootCandidate => ({
  id,
  title: `Card ${id}`,
  branch: `feature/US-${id}-x`,
  tier: 'risk:green',
  labels: ['risk:green'],
  mutexResources: [],
  prerequisites: [],
})

const original = console.log
afterEach(() => {
  console.log = original
})

describe('the loop drives each card in its own process — no nested pair-cli run', () => {
  it('the card argv parses to the same --card run the child would have been', () => {
    const loop = parseRunCommand({ root: '578', watch: true, preset: 'escalate-red' })
    const args = buildCardProcessArgs(loop, card('572'), '/repo', '*')
    const config = parseRunCommand(
      optionsOfArgv(args.slice(1)) as Parameters<typeof parseRunCommand>[0],
    )
    expect(config).toMatchObject({ cwd: '/repo', eligibilityFilter: '*' })
    expect(config.dispatch).toMatchObject({ card: '572' })
    expect(config.parallel).toBeUndefined()
  })

  const platformCases = ['darwin', 'linux'] as const
  it.each(platformCases)(
    'two concurrent cards: each line under its own card, events relayed, status read (platform %s)',
    async platform => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!
      Object.defineProperty(process, 'platform', { value: platform })
      const printed: string[] = []
      console.log = (line: string) => void printed.push(line)
      const events: RunEvent[] = []
      const runner = runCardInProcess(async args => {
        const id = args[args.indexOf('--card') + 1]!
        expect(pooledCard()).toBeDefined()
        await new Promise(r => setTimeout(r, id === '1' ? 10 : 0))
        console.log(`  Engine: claude ${id}`)
        console.log(runEventLine({ event: 'stage', card: id, stage: 'review' }))
        console.log(`  Cycle status: failed-validate (3 stage(s) dispatched)`)
        return id === '1' ? 0 : 1
      })
      try {
        const [one, two] = await Promise.all(
          ['1', '2'].map(id =>
            runner({
              card: card(id),
              args: ['run', '--card', id],
              cwd: '/repo',
              onEvent: e => events.push(e),
            }),
          ),
        )
        expect(one).toMatchObject({ exitCode: 0, cycleStatus: 'failed-validate' })
        expect(two).toMatchObject({ exitCode: 1, cycleStatus: 'failed-validate' })
        expect(printed).toContain('  [#1]   Engine: claude 1')
        expect(printed).toContain('  [#2]   Engine: claude 2')
        expect(events.map(e => e.card).sort()).toEqual(['1', '2'])
        expect(pooledCard()).toBeUndefined()
      } finally {
        Object.defineProperty(process, 'platform', original)
      }
    },
  )

  it('a card that throws is reported under its card and fails, never the loop', async () => {
    const printed: string[] = []
    console.log = (line: string) => void printed.push(line)
    const exit = await runCardInProcess(async () => {
      throw new Error('boom')
    })({ card: card('9'), args: [], cwd: '/repo' })
    expect(exit).toMatchObject({ exitCode: 1, signal: null })
    expect(printed).toContain('  [#9]   boom')
  })
})
