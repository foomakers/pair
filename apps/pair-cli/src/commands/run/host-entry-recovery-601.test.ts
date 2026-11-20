import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { expect, it, vi } from 'vitest'
import { CardUnreadableError } from './cycle-wiring'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { POLICY_PATH } from './automation-policy'
import { acquireCardLock } from './card-lock'
import { acquireRunLock } from './run-lock'

it.each(['labels', 'readiness'] as const)(
  '#601 r0-2: %s host outage parks durably and allows resume',
  async route => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-entry-'))
    const scriptDir = join(root, '.claude/skills/pair-workflow-cycle/scripts')
    cpSync(resolve(process.cwd(), '../../.claude/skills/pair-workflow-cycle/scripts'), scriptDir, {
      recursive: true,
    })
    const fs = new InMemoryFileSystemService(
      {
        [join(root, 'config.json')]: JSON.stringify({
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
        [join(root, POLICY_PATH)]: '# Automation\n',
        [join(root, '.claude/skills/pair-workflow-cycle/SKILL.md')]: '',
        [join(scriptDir, 'cycle-state.mjs')]: '',
        [join(scriptDir, 'cycle-dispatch.mjs')]: '',
        '/bin/claude': '',
      },
      root,
      root,
    )
    const output: string[] = []
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => output.push(args.map(String).join(' ')))
    const opts =
      route === 'labels' ? { card: '493', autonomous: true } : { card: '493', cardTags: '' }
    const error = new CardUnreadableError(
      'card-unreadable: host-transient: HTTP 503 Retry-After: 31',
    )
    const release = vi.fn()
    const lock = vi.fn(() => ({ kind: 'acquired' as const, lock: { path: '/locks/493', release } }))
    try {
      const code = await handleRunCommand(parseRunCommand(opts), fs, {
        readCardLabels: async () => {
          throw error
        },
        cardReadiness: async () => {
          throw error
        },
        acquireLock: lock,
        appendAudit: () => {},
      })
      expect(code).toBe(1)
      expect(output.join('\n')).toMatch(/awaiting-human/)
      expect(output.join('\n')).toMatch(/resolve:run:host-transient/)
      const runDir = join(root, '.pair/working/runs/story-493/493')
      const recovery = JSON.parse(readFileSync(join(runDir, 'recovery.json'), 'utf8')) as {
        rounds: unknown[]
      }
      expect(recovery.rounds).toHaveLength(1)
      expect(lock).toHaveBeenCalledOnce()
      expect(release).toHaveBeenCalledOnce()
      expect(existsSync(join(runDir, '.lock'))).toBe(false)
      const resumed = vi.fn(async () => ({ status: 'ready-for-merge', stagesRun: 0 }))
      const codeAfterRecovery = await handleRunCommand(parseRunCommand(opts), fs, {
        readCardLabels: async () => [],
        cardReadiness: async () => 'ready',
        acquireLock: ({ card }) => ({
          kind: 'acquired',
          lock: { path: `/locks/${card}`, release: () => {} },
        }),
        driveCycle: resumed,
        appendAudit: () => {},
      })
      expect(codeAfterRecovery).toBe(0)
      expect(resumed).toHaveBeenCalledOnce()
      const after = JSON.parse(readFileSync(join(runDir, 'recovery.json'), 'utf8')) as {
        rounds: unknown[]
      }
      expect(after.rounds).toHaveLength(1)
      const stateScript = join(scriptDir, 'cycle-state.mjs')
      const source = readFileSync(stateScript, 'utf8')
      const firstLine = source.indexOf('\n') + 1
      writeFileSync(
        stateScript,
        `${source.slice(0, firstLine)}if (process.argv[2] === 'recover') { process.stderr.write('fixture failure'); process.exit(1) }\n${source.slice(firstLine)}`,
      )
      await expect(
        handleRunCommand(parseRunCommand(opts), fs, {
          readCardLabels: async () => {
            throw error
          },
          cardReadiness: async () => {
            throw error
          },
          acquireLock: lock,
          appendAudit: () => {},
        }),
      ).rejects.toThrow()
      expect(release).toHaveBeenCalledTimes(2)
      expect(existsSync(join(runDir, 'run.lock'))).toBe(false)
    } finally {
      log.mockRestore()
    }
  },
)

it.each([
  ['labels', 'card'],
  ['readiness', 'card'],
  ['labels', 'run'],
  ['readiness', 'run'],
] as const)(
  '#601 r0-2: %s outage respects live %s lock without spending recovery',
  async (route, lockType) => {
    const root = mkdtempSync(join(tmpdir(), 'pair-601-entry-held-'))
    const scriptDir = join(root, '.claude/skills/pair-workflow-cycle/scripts')
    cpSync(resolve(process.cwd(), '../../.claude/skills/pair-workflow-cycle/scripts'), scriptDir, {
      recursive: true,
    })
    const fs = new InMemoryFileSystemService(
      {
        [join(root, 'config.json')]: JSON.stringify({
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
        [join(root, POLICY_PATH)]: '# Automation\n',
        [join(root, '.claude/skills/pair-workflow-cycle/SKILL.md')]: '',
        [join(scriptDir, 'cycle-state.mjs')]: '',
        [join(scriptDir, 'cycle-dispatch.mjs')]: '',
      },
      root,
      root,
    )
    const runDir = join(root, '.pair/working/runs/story-493/493')
    mkdirSync(runDir, { recursive: true })
    const recoveryFile = join(runDir, 'recovery.json')
    const original = JSON.stringify({
      rounds: [{ kind: 'stage-retry', detail: 'owner', at: '2026-01-01T00:00:00.000Z' }],
    })
    writeFileSync(recoveryFile, original)
    const held =
      lockType === 'card'
        ? acquireCardLock({ workingArea: join(root, '.pair/working'), card: '493' })
        : acquireRunLock(runDir)
    expect(held.kind).toBe('acquired')
    if (held.kind !== 'acquired') throw new Error('fixture lock unavailable')
    const heldFile = 'lock' in held ? join(held.lock.path, 'holder.json') : join(runDir, 'run.lock')
    const heldNote = readFileSync(heldFile, 'utf8')
    const lines: string[] = []
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => lines.push(args.map(String).join(' ')))
    const error = new CardUnreadableError(
      'card-unreadable: host-transient: HTTP 503 Retry-After: 31',
    )
    try {
      const code = await handleRunCommand(
        parseRunCommand(
          route === 'labels' ? { card: '493', autonomous: true } : { card: '493', cardTags: '' },
        ),
        fs,
        {
          readCardLabels: async () => {
            throw error
          },
          cardReadiness: async () => {
            throw error
          },
          appendAudit: () => {},
        },
      )
      expect(code).toBe(lockType === 'card' ? 0 : 1)
      expect(lines.join('\n')).toMatch(lockType === 'card' ? /run-in-progress/ : /run-locked/)
      expect(readFileSync(recoveryFile, 'utf8')).toBe(original)
      expect(readFileSync(heldFile, 'utf8')).toBe(heldNote)
    } finally {
      log.mockRestore()
      if ('lock' in held) held.lock.release()
      else held.release()
    }
  },
)
