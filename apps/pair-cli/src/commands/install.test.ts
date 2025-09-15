import { describe, it, expect, vi } from 'vitest'
import { installCommand } from './install'
import { resolve } from 'path'
import * as commandUtils from './command-utils'
import {
  DEFAULT_CONFIG,
  GITHUB_ONLY_CONFIG,
  GITHUB_KNOWLEDGE_CONFIG,
  OVERLAPPING_CONFIG,
  CLEAN_CONFIG,
  createTestFs,
} from '../test-utils/test-helpers'

describe('installCommand new functionality tests', () => {
  it('install with defaults uses config registries', async () => {
    const fs = createTestFs(DEFAULT_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
      '/dataset/.pair/knowledge.md': 'knowledge content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['installed github', 'installed knowledge'] })

    const result = await installCommand(fs, [], { datasetRoot: '/dataset', useDefaults: true })
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })

  it('install with registry override', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['installed github'] })

    const result = await installCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })
})

describe('installCommand - multiple registries', () => {
  it('install with multiple registry overrides', async () => {
    const fs = createTestFs(GITHUB_KNOWLEDGE_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
      '/dataset/.pair/knowledge.md': 'knowledge content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['installed github', 'installed knowledge'] })

    const result = await installCommand(fs, [], {
      datasetRoot: '/dataset',
      useDefaults: true,
    })
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)
    spy.mockRestore()
  })
})

describe('installCommand - idempotency / existing target', () => {
  it('fails when installing twice to the same existing target', async () => {
    const fs = createTestFs(GITHUB_ONLY_CONFIG, {
      '/dataset/.github/workflows/ci.yml': 'workflow content',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['installed github'] })

    // First install should succeed
    const first = await installCommand(fs, [], { datasetRoot: '/dataset', useDefaults: true })
    expect(first).toBeDefined()
    expect(first!.success).toBe(true)

    // Simulate that the previous install created files in the target by creating the dir
    const absGithub = resolve('.github')
    await fs.mkdir(absGithub, { recursive: true })
    await fs.writeFile(`${absGithub}/marker`, 'x')

    // Second install should return a failure result because destination exists
    const second = await installCommand(fs, [], { datasetRoot: '/dataset', useDefaults: true })
    expect(second).toBeDefined()
    expect(second!.success).toBe(false)
    expect(second!.message).toMatch(/Destination already exists/)

    spy.mockRestore()
  })
})

describe('installCommand - overlapping targets', () => {
  it('fails when registries have overlapping targets under a base target', async () => {
    // Use a filesystem with minimal dataset and overlapping config
    const fs = createTestFs(OVERLAPPING_CONFIG, {
      '/dataset/.github/README.md': 'x',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({ logs: ['installed'] })

    // Call installCommand as if user ran: install .smoke_test
    const result = await installCommand(fs, ['--target', '.smoke_test'], {
      datasetRoot: '/dataset',
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(false)
    // The CLI should surface a precheck error about overlapping targets
    expect(result!.message).toMatch(/Overlapping registry targets|Conflicting registry targets/)

    spy.mockRestore()
  })
})

describe('installCommand - clean non-overlapping install', () => {
  it('succeeds when base target is empty and registry targets do not overlap', async () => {
    const fs = createTestFs(CLEAN_CONFIG, {
      '/dataset/.github/README.md': 'gh',
      '/dataset/.pair/knowledge/doc.md': 'k',
      '/dataset/.pair/adoption/guide.md': 'a',
    })

    const spy = vi.spyOn(commandUtils, 'doCopyAndUpdateLinks')
    spy.mockResolvedValue({
      logs: ['installed github', 'installed knowledge', 'installed adoption'],
    })

    // Use a non-overlapping mocked config (the global mock already uses non-overlapping targets)
    const result = await installCommand(fs, ['--target', '.clean_test'], {
      datasetRoot: '/dataset',
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(true)
    // Ensure copy was invoked at least once
    expect(spy.mock.calls.length).toBeGreaterThan(0)

    spy.mockRestore()
  })
})
