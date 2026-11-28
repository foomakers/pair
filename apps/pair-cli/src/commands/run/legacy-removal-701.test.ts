import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'

const dispatch = vi.fn()
vi.mock('../dispatcher', async importOriginal => ({
  ...(await importOriginal<typeof import('../dispatcher')>()),
  dispatchCommand: dispatch,
}))

const fs = () =>
  new InMemoryFileSystemService(
    {
      '/project/config.json': JSON.stringify({
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
      '/project/.claude/skills/pair-next/SKILL.md': '',
      '/bin/claude': '',
    },
    '/project',
    '/project',
  )

afterEach(() => {
  dispatch.mockReset()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('US-701 AC-5: removed loop flags', () => {
  it.each([
    ['watch', ['--watch']],
    ['no-watch', ['--no-watch']],
    ['interval', ['--interval', '60s']],
    ['predicate', ['--predicate', 'tag:risk:red ⇒ Done']],
    ['state order', ['--state-order', 'Ready,Done']],
    ['multiple cards', ['--cards', '12,15']],
    ['iteration cap', ['--max-iterations', '2']],
  ])('rejects %s before dispatch', async (_family, args) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { runCli } = await import('../../cli.js')
    await expect(
      runCli(['node', 'pair-cli', 'run', ...args], {
        fs: fs(),
        httpClient: { get: vi.fn(), request: vi.fn() } as never,
      }),
    ).rejects.toThrow(/unknown option/i)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('keeps workflow selection and parallelism available', async () => {
    const { runCli } = await import('../../cli.js')
    await runCli(['node', 'pair-cli', 'run', 'delivery', '--root', '641', '--parallel', '3'], {
      fs: fs(),
      httpClient: { get: vi.fn(), request: vi.fn() } as never,
    })
    expect(dispatch).toHaveBeenCalledOnce()
  })
})

describe('US-701 business rule: skill launches once', () => {
  it('ignores a continue token returned by the skill', async () => {
    vi.stubEnv('PATH', '/bin')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: 'success',
        detail: 'done',
        continueToken: 'pair-next --root 641',
      })
      .mockResolvedValue({ outcome: 'success', detail: 'done' })
    const code = await handleRunCommand(
      parseRunCommand({ skill: 'pair-next', root: '641' }),
      fs(),
      { runIteration: runner },
    )
    expect(code).toBe(0)
    expect(runner).toHaveBeenCalledOnce()
  })
})
