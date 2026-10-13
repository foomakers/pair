import { describe, it, expect, vi, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { parseRunCommand } from './parser'
import { buildCardProcessArgs } from './parallel'
import { handleRunCommand } from './handler'
import { forwardedAutonomy, forwardedFields, loopStartFields } from './loop-report'
import { POLICY_PATH } from './automation-policy'
import { isDorFallbackReason } from './card-entry'
import { resolveContext } from './run-context'
import { completeCandidates, resolveCards, type RootCandidate } from './root-plan'

const cand: RootCandidate = {
  id: '9',
  title: 't',
  branch: 'b',
  tier: 'risk:green',
  labels: [],
  mutexResources: [],
  prerequisites: [],
}

afterEach(() => vi.restoreAllMocks())

describe('loop carries --until/--prepare/--merge to each child card', () => {
  const gate = 'when; has: risk:red'

  it('parser accepts them with --parallel, with or without --watch', () => {
    for (const extra of [{}, { watch: true, interval: '15m' }]) {
      const config = parseRunCommand({
        filter: 'surface:cli',
        parallel: '2',
        until: 'merged',
        prepare: gate,
        merge: gate,
        ...extra,
      })
      expect(config.autonomy).toEqual({ until: 'merged', prepare: gate, merge: gate })
    }
  })

  it('still refuses them where meaningless (no --card, no --parallel)', () => {
    expect(() => parseRunCommand({ skill: 'pair-next', until: 'merged' })).toThrow(
      /--card or --parallel/,
    )
    expect(() => parseRunCommand({ root: '1', merge: 'never' })).toThrow(/--card or --parallel/)
  })

  it('child argv carries them as separate elements, keeping --engine/--autonomous', () => {
    const config = parseRunCommand({
      filter: 'surface:cli',
      parallel: '2',
      engine: 'claude',
      autonomous: true,
      merge: gate,
      until: 'merged',
      prepare: gate,
    })
    const args = buildCardProcessArgs(config, cand, '/p', 'surface:cli')
    expect(args).toEqual([
      'run',
      '--card',
      '9',
      '--engine',
      'claude',
      '--eligibility-filter',
      'surface:cli',
      '--cwd',
      '/p',
      '--autonomous',
      '--until',
      'merged',
      '--prepare',
      gate,
      '--merge',
      gate,
      '--iteration-timeout',
      '1800',
    ])
  })

  it('argv is identical whatever the flag order', () => {
    const a = parseRunCommand({ parallel: '2', root: '1', until: 'pr', merge: 'never' })
    const b = parseRunCommand({ merge: 'never', until: 'pr', root: '1', parallel: '2' })
    expect(buildCardProcessArgs(a, cand, '/p')).toEqual(buildCardProcessArgs(b, cand, '/p'))
  })

  it.each(['darwin', 'linux'] as const)('argv is platform-independent (platform %s)', platform => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: platform })
    try {
      const config = parseRunCommand({ root: '1', parallel: '2', prepare: gate })
      expect(buildCardProcessArgs(config, cand, '/p')).toContain(gate)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  })

  it('default path unchanged: none given adds none', () => {
    const args = buildCardProcessArgs(parseRunCommand({ root: '66', parallel: '2' }), cand, '/p')
    expect(args).toEqual(['run', '--card', '9', '--cwd', '/p', '--iteration-timeout', '1800'])
  })

  it('an invalid gate is refused (precedence print shows argument) before anything spawns', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const selectAnswer = vi.fn()
    const runCardProcess = vi.fn()
    const fs = new InMemoryFileSystemService(
      {
        '/w/config.json': JSON.stringify({
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
        '/w/.claude/skills/pair-workflow-cycle/SKILL.md': '',
        '/w/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs': '',
        '/w/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs': '',
        '/bin/claude': '',
      },
      '/w',
      '/w',
    )
    await expect(
      handleRunCommand(
        parseRunCommand({ cwd: '/w', parallel: '2', root: '1', autonomous: true, merge: 'bogus' }),
        fs,
        {
          resolveAutonomy: () =>
            ({
              ok: false,
              errors: [{ key: 'merge', reason: 'argument "bogus" is not a gate' }],
            }) as never,
          selectAnswer,
          runCardProcess,
        },
      ),
    ).rejects.toThrow(/`merge` argument "bogus"/)
    expect(selectAnswer).not.toHaveBeenCalled()
    expect(runCardProcess).not.toHaveBeenCalled()
  })

  it('effective-values print shows each forwarded value with (argument); audit line carries it', () => {
    const config = parseRunCommand({ root: '1', parallel: '2', until: 'merged', merge: 'never' })
    const fwd = forwardedAutonomy(config, undefined)
    expect(fwd).toEqual([
      ['until', 'merged (argument)'],
      ['merge', 'never (argument)'],
    ])
    const fields = loopStartFields(
      {
        watch: { value: 'off', source: 'KB default' },
        interval: { value: '5m', source: 'KB default', ms: 1 },
        cap: { value: 1, bound: 'x' },
      } as never,
      {},
      2,
      3,
    ) as Array<[string, string]>
    fields.push(...forwardedFields(fwd))
    expect(fields).toContainEqual(['child-until', 'merged (argument)'])
    expect(forwardedAutonomy(parseRunCommand({ root: '1', parallel: '2' }), undefined)).toEqual([])
  })

  describe('effective filter replaces the legacy ## Eligibility tier gate', () => {
    const policyText = '## Eligibility\n\nrisk:green\n\n## Max Parallelism\n\n3\n'
    const yellow: RootCandidate = { ...cand, id: '7', tier: 'risk:yellow', labels: ['risk:yellow'] }
    const fsWith = () =>
      new InMemoryFileSystemService(
        {
          '/w/config.json': JSON.stringify({
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
          '/bin/claude': '',
          '/w/.claude/skills/pair-workflow-cycle/SKILL.md': '',
          '/w/.claude/skills/pair-workflow-cycle/scripts/cycle-state.mjs': '',
          '/w/.claude/skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs': '',
          [`/w/${POLICY_PATH}`]: policyText,
        },
        '/w',
        '/w',
      )

    it('A: an argument filter is the only gate — a yellow card is planned and spawned with --filter', async () => {
      const prevPath = process.env['PATH']
      process.env['PATH'] = '/bin'
      const lines: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')))
      const argvs: string[][] = []
      const code = await handleRunCommand(
        parseRunCommand({ cwd: '/w', parallel: '2', filter: 'risk:yellow', autonomous: true }),
        fsWith(),
        {
          selectCandidates: async () => [yellow],
          runCardProcess: async ({ args }) => {
            argvs.push([...args])
            return { exitCode: 0, signal: null }
          },
          acquireLock: ({ card: id }) => ({
            kind: 'acquired',
            lock: { path: `/l/${id}`, release: () => {} },
          }),
          appendAudit: () => {},
        },
      )
      process.env['PATH'] = prevPath
      expect(code).toBe(0)
      expect(lines.join('\n')).not.toMatch(/not eligible/)
      expect(argvs).toHaveLength(1)
      expect(argvs[0]).toEqual(expect.arrayContaining(['--eligibility-filter', 'risk:yellow']))
    })

    it('A: the child with that --filter does not skip a yellow card on the legacy Eligibility', () => {
      const config = parseRunCommand({
        card: '7',
        cardTags: 'risk:yellow',
        eligibilityFilter: 'risk:yellow',
        autonomous: true,
      })
      const ctx = resolveContext(config, fsWith(), '/w')
      const d = ctx.dispatch
      expect(
        d?.kind === 'skip' &&
          isDorFallbackReason({
            reason: d.reason,
            policy: ctx.policy,
            tags: ['risk:yellow'],
            autonomous: true,
          }),
      ).toBe(true)
      expect(ctx.policy.eligibility).toBe('risk:yellow')
    })

    it('B: the merge posture line states the forwarded gate, the old line stays when nothing is forwarded', async () => {
      const run = async (flags: Record<string, unknown>) => {
        const prevPath = process.env['PATH']
        process.env['PATH'] = '/bin'
        const lines: string[] = []
        vi.spyOn(console, 'log').mockImplementation(
          (...a: unknown[]) => void lines.push(a.join(' ')),
        )
        await handleRunCommand(
          parseRunCommand({ cwd: '/w', parallel: '2', root: '1', autonomous: true, ...flags }),
          fsWith(),
          {
            selectCandidates: async () => [],
            runCardProcess: async () => ({ exitCode: 0, signal: null }),
            acquireLock: ({ card: id }) => ({
              kind: 'acquired',
              lock: { path: `/l/${id}`, release: () => {} },
            }),
            appendAudit: () => {},
            resolveAutonomy: () => undefined,
          },
        )
        process.env['PATH'] = prevPath
        vi.restoreAllMocks()
        return lines.join('\n')
      }
      expect(await run({})).toMatch(/Merge: the driver never merges/)
      const out = await run({ until: 'merged', merge: 'when; has: risk:red' })
      expect(out).not.toMatch(/the driver never merges/)
      expect(out).toMatch(/Merge: each card merges per its gate \(when; has: risk:red, argument\)/)
    })
  })

  describe('F: loop -> child argv -> child parse + eligibility, no --filter refusal', () => {
    const policyText = '## Eligibility\n\nrisk:green\n'
    const fsWith = () =>
      new InMemoryFileSystemService(
        {
          '/w/config.json': JSON.stringify({ asset_registries: {} }),
          [`/w/${POLICY_PATH}`]: policyText,
        },
        '/w',
        '/w',
      )
    const parseChildArgv = (args: string[]) => {
      const opt: Record<string, unknown> = {}
      for (let i = 1; i < args.length; i++) {
        const flag = args[i]!
        if (!flag.startsWith('--')) continue
        const key = flag.slice(2).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
        const next = args[i + 1]
        if (next === undefined || next.startsWith('--')) opt[key] = true
        else {
          opt[key] = next
          i++
        }
      }
      return parseRunCommand(opt)
    }

    it.each(['risk:green', 'risk:yellow', 'risk:red'])(
      'a %s card from a loop with --filter %s parses and is not skipped by the legacy Eligibility',
      tier => {
        const parent = parseRunCommand({ parallel: '2', filter: tier, autonomous: true })
        const args = buildCardProcessArgs(parent, { ...cand, tier, labels: [tier] }, '/w', tier)
        expect(args).not.toContain('--filter')
        const child = parseChildArgv(args)
        expect(child.scope.filter).toBeUndefined()
        const ctx = resolveContext(child, fsWith(), '/w')
        expect(ctx.policy.eligibility).toBe(tier)
      },
    )

    it('default path: no filter => no --eligibility-filter and the legacy Eligibility stays', () => {
      const parent = parseRunCommand({ parallel: '2', root: '1' })
      const args = buildCardProcessArgs(parent, cand, '/w')
      expect(args).not.toContain('--eligibility-filter')
      expect(resolveContext(parseChildArgv(args), fsWith(), '/w').policy.eligibility).toBe(
        'risk:green',
      )
    })
  })

  describe('E: cards without branch/title are completed, not excluded', () => {
    it('derives feature/US-<id>-<slug> from the title and reads a missing title live', () => {
      const out = completeCandidates(
        [
          { ...cand, id: '399', title: 'Add CLI Thing!', branch: '' },
          { ...cand, id: '353', title: '', branch: '' },
          { ...cand, id: '262', title: '', branch: 'bug/BUG-1-x' },
          { ...cand, id: '5', title: '', branch: '' },
        ],
        id => (id === '5' ? undefined : `Title of ${id}`),
      )
      expect(out.map(c => [c.id, c.title, c.branch])).toEqual([
        ['399', 'Add CLI Thing!', 'feature/US-399-add-cli-thing'],
        ['353', 'Title of 353', 'feature/US-353-title-of-353'],
        ['262', 'Title of 262', 'bug/BUG-1-x'],
        ['5', '', ''],
      ])
      expect(resolveCards(out).audit.map(a => a.id)).toEqual(['5'])
    })

    it('through the handler: a candidate with no branch is planned and spawned', async () => {
      const prev = process.env['PATH']
      process.env['PATH'] = '/bin'
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const started: string[] = []
      await handleRunCommand(
        parseRunCommand({ cwd: '/w', parallel: '2', root: '1', autonomous: true }),
        new InMemoryFileSystemService(
          { '/w/config.json': JSON.stringify({ asset_registries: {} }), '/bin/claude': '' },
          '/w',
          '/w',
        ),
        {
          selectCandidates: async () => [{ ...cand, id: '399', title: 'T', branch: '' }],
          runCardProcess: async ({ card: c }) => {
            started.push(c.branch)
            return { exitCode: 0, signal: null }
          },
          acquireLock: ({ card: id }) => ({
            kind: 'acquired',
            lock: { path: `/l/${id}`, release: () => {} },
          }),
          appendAudit: () => {},
        },
      )
      process.env['PATH'] = prev
      expect(started).toEqual(['feature/US-399-t'])
    })
  })

  describe('V: --predicate end to end through the handler', () => {
    it('is printed with its source in the loop header and is the predicate the loop evaluates (argument > adoption)', async () => {
      const prev = process.env['PATH']
      process.env['PATH'] = '/bin'
      const lines: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')))
      const asked: Array<string | undefined> = []
      const fs = new InMemoryFileSystemService(
        {
          '/w/config.json': JSON.stringify({ asset_registries: {} }),
          '/bin/claude': '',
          [`/w/${POLICY_PATH}`]:
            '## Eligibility\n\nrisk:green\n\n## Stop Predicate\n\ntag:risk:red ⇒ Done\nmax-iterations: 5\n',
        },
        '/w',
        '/w',
      )
      await handleRunCommand(
        parseRunCommand({
          cwd: '/w',
          parallel: '2',
          watch: true,
          filter: 'surface:cli',
          autonomous: true,
          predicate: 'tag:surface:cli ⇒ Done',
        }),
        fs,
        {
          selectAnswer: async (input: { loop?: { predicateSelector?: string } }) => {
            asked.push(input.loop?.predicateSelector)
            return {
              candidates: [],
              snapshot: [{ id: '9', tags: ['surface:cli'], macrostate: 'Done' }],
            }
          },
          runCardProcess: async () => ({ exitCode: 0, signal: null }),
          acquireLock: ({ card: id }: { card: string }) => ({
            kind: 'acquired',
            lock: { path: `/l/${id}`, release: () => {} },
          }),
          appendAudit: () => {},
          wait: async () => 'elapsed',
        } as never,
      )
      process.env['PATH'] = prev
      const out = lines.join('\n')
      expect(out).toMatch(/stop predicate: tag:surface:cli ⇒ Done \(--predicate\)/)
      expect(out).not.toMatch(/stop predicate: tag:risk:red/)
      expect(asked).toEqual(['tag:surface:cli'])
      expect(out).toMatch(
        /stopping: stop predicate satisfied \(1 card\(s\) match tag:surface:cli ⇒ Done, 1 hold it\)/,
      )
    })
  })
})
