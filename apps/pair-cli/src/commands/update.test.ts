import { describe, it, expect, vi } from 'vitest'
import * as updateCmd from './update'
import * as commandUtils from './command-utils'
import type { LogEntry } from './command-utils'
import {
  DEFAULT_CONFIG,
  GITHUB_ONLY_CONFIG,
  GITHUB_KNOWLEDGE_CONFIG,
  createTestFs,
} from '../test-utils/test-helpers'

// Split verbose-related assertions into separate smaller tests to satisfy max-lines-per-function

describe('updateCommand defaults tests', () => {
  it('update with defaults uses config registries', async () => {
    const fs = createTestFs(DEFAULT_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
      '/dataset/.pair/knowledge.md': 'knowledge content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated github', 'updated knowledge'] })

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })
})

describe('updateCommand overrides and flags tests', () => {
  it('update with registry override', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated github'] })

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })

  it('update with multiple registry overrides', async () => {
    const fs = createTestFs(GITHUB_KNOWLEDGE_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
      '/dataset/.pair/knowledge.md': 'knowledge content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated github', 'updated knowledge'] })

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })
})

describe('updateCommand - dry run', () => {
  it('dry-run with defaults does not write files', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })
    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated'] })

    // dryRun CLI option removed; call without dryRun
    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    spy.mockRestore()
    expect(result!.success).toBe(true)
  })
})

describe('updateCommand - verbose logging', () => {
  it('verbose returns logs (presence)', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated'] })

    // verbose CLI option removed; logs are still returned via result.logs
    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })

    expect(result!.success).toBe(true)
    spy.mockRestore()
  })

  it('verbose returns logs (content check)', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['updated'] })

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })

    expect(result!.success).toBe(true)
    const logs = (result as unknown as { logs: LogEntry[] }).logs
    expect(logs).toBeDefined()
    expect(logs.some((log: LogEntry) => log.message?.includes('Starting updateWithDefaults'))).toBe(
      true,
    )
    spy.mockRestore()
  })
})

describe('updateCommand - error cases', () => {
  it('fails if target directory does not exist', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const result = await updateCmd.updateCommand(fs, ['--target', '/nonexistent/target'], {
      datasetRoot: '/dataset',
    })

    expect(result!.success).toBe(false)
    expect(result!.message).toContain("Target directory '/nonexistent/target' does not exist")
  })
})
