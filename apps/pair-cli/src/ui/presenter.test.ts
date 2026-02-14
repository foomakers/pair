import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCliPresenter, createSilentPresenter, type RegistryResult } from './presenter'
import type { LogEntry } from '#diagnostics'

type PushLog = (level: LogEntry['level'], message: string) => void

describe('createCliPresenter', () => {
  let pushLog: PushLog
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushLog = vi.fn()
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('startOperation prints header and calls pushLog', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.startOperation('install', 4)

    expect(consoleSpy).toHaveBeenCalledTimes(2)
    expect(pushLog).toHaveBeenCalledWith('info', 'Installing 4 registries')
  })

  it('startOperation uses singular for 1 registry', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.startOperation('update', 1)

    expect(pushLog).toHaveBeenCalledWith('info', 'Updating 1 registry')
  })

  it('registryStart prints counter and paths', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.registryStart({
      name: 'github',
      index: 0,
      total: 4,
      source: '.github',
      target: '.github',
    })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(pushLog).toHaveBeenCalledWith('info', '[1/4] github: .github → .github')
  })

  it('registryDone prints check mark', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.registryDone('github')

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(pushLog).toHaveBeenCalledWith('info', "Successfully processed registry 'github'")
  })

  it('registryError prints error', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.registryError('broken', 'file not found')

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(pushLog).toHaveBeenCalledWith(
      'error',
      "Failed to process registry 'broken': file not found",
    )
  })

  it('phase prints message', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.phase('Creating backup...')

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(pushLog).toHaveBeenCalledWith('info', 'Creating backup...')
  })

  it('summary prints success when all ok', () => {
    const presenter = createCliPresenter(pushLog)
    const results: RegistryResult[] = [
      { name: 'a', target: '/a', ok: true },
      { name: 'b', target: '/b', ok: true },
    ]
    presenter.summary(results, 'install', 1234)

    expect(consoleSpy).toHaveBeenCalledTimes(3)
    expect(pushLog).toHaveBeenCalledWith('info', 'Installation complete: 2 ok, 0 failed (1.2s)')
  })

  it('summary prints warning when some failed', () => {
    const presenter = createCliPresenter(pushLog)
    const results: RegistryResult[] = [
      { name: 'a', target: '/a', ok: true },
      { name: 'b', target: '/b', ok: false, error: 'bad' },
    ]
    presenter.summary(results, 'update', 500)

    expect(pushLog).toHaveBeenCalledWith('info', 'Update complete: 1 ok, 1 failed (500ms)')
  })

  it('summary formats sub-second elapsed as ms', () => {
    const presenter = createCliPresenter(pushLog)
    presenter.summary([{ name: 'a', target: '/a', ok: true }], 'install', 42)

    expect(pushLog).toHaveBeenCalledWith('info', 'Installation complete: 1 ok, 0 failed (42ms)')
  })
})

describe('createSilentPresenter', () => {
  let pushLog: PushLog

  beforeEach(() => {
    pushLog = vi.fn()
  })

  it('does not write to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const presenter = createSilentPresenter(pushLog)

    presenter.startOperation('install', 2)
    presenter.registryStart({ name: 'x', index: 0, total: 2, source: '/src', target: '/dst' })
    presenter.registryDone('x')
    presenter.phase('backup')
    presenter.summary([{ name: 'x', target: '/dst', ok: true }], 'install', 100)

    expect(consoleSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('still calls pushLog for all operations', () => {
    const presenter = createSilentPresenter(pushLog)

    presenter.startOperation('install', 2)
    presenter.registryStart({ name: 'x', index: 0, total: 2, source: '/src', target: '/dst' })
    presenter.registryDone('x')
    presenter.registryError('y', 'fail')
    presenter.phase('backup')
    presenter.summary(
      [
        { name: 'x', target: '/dst', ok: true },
        { name: 'y', target: '/dst2', ok: false },
      ],
      'install',
      100,
    )

    expect(pushLog).toHaveBeenCalledTimes(6)
  })
})
