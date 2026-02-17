import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @inquirer/prompts before imports
vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  confirm: vi.fn(),
}))

import { runInteractiveFlow } from './interactive'
import { input, confirm } from '@inquirer/prompts'
import type { PackageCommandConfig } from './parser'
import { InMemoryFileSystemService } from '@pair/content-ops'

const mockedInput = vi.mocked(input)
const mockedConfirm = vi.mocked(confirm)

function makeConfig(overrides: Partial<PackageCommandConfig> = {}): PackageCommandConfig {
  return {
    command: 'package',
    interactive: true,
    tags: [],
    license: 'MIT',
    ...overrides,
  }
}

function makeFs(files: Record<string, string> = {}) {
  const defaultFiles: Record<string, string> = {
    '/project/.pair/config.json': JSON.stringify({ registries: {} }),
    '/project/package.json': JSON.stringify({
      name: 'test-project',
      version: '2.0.0',
      description: 'A test project',
    }),
    ...files,
  }
  return new InMemoryFileSystemService(defaultFiles, '/project', '/project')
}

describe('runInteractiveFlow', () => {
  const originalIsTTY = process.stdout.isTTY

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true })
  })

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true })
  })

  it('throws when not in TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true })

    await expect(runInteractiveFlow(makeConfig(), makeFs())).rejects.toThrow(
      'Interactive mode requires a terminal (TTY)',
    )
  })

  it('returns null when user declines confirmation', async () => {
    mockedInput
      .mockResolvedValueOnce('my-kb') // name
      .mockResolvedValueOnce('1.0.0') // version
      .mockResolvedValueOnce('desc') // description
      .mockResolvedValueOnce('author') // author
      .mockResolvedValueOnce('') // tags
      .mockResolvedValueOnce('MIT') // license
    mockedConfirm.mockResolvedValueOnce(false)

    const result = await runInteractiveFlow(makeConfig(), makeFs())

    expect(result).toBeNull()
  })

  it('returns merged config when user confirms', async () => {
    mockedInput
      .mockResolvedValueOnce('my-kb') // name
      .mockResolvedValueOnce('1.0.0') // version
      .mockResolvedValueOnce('My description') // description
      .mockResolvedValueOnce('Test Author') // author
      .mockResolvedValueOnce('ai, devops') // tags
      .mockResolvedValueOnce('Apache-2.0') // license
    mockedConfirm.mockResolvedValueOnce(true)

    const result = await runInteractiveFlow(makeConfig(), makeFs())

    expect(result).not.toBeNull()
    expect(result!.name).toBe('my-kb')
    expect(result!.version).toBe('1.0.0')
    expect(result!.description).toBe('My description')
    expect(result!.author).toBe('Test Author')
    expect(result!.tags).toEqual(['ai', 'devops'])
    expect(result!.license).toBe('Apache-2.0')
  })

  it('uses CLI flags as defaults for prompts', async () => {
    mockedInput
      .mockResolvedValueOnce('cli-name') // will receive cli-name as default
      .mockResolvedValueOnce('3.0.0') // will receive 3.0.0 as default
      .mockResolvedValueOnce('desc')
      .mockResolvedValueOnce('author')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('MIT')
    mockedConfirm.mockResolvedValueOnce(true)

    await runInteractiveFlow(makeConfig({ name: 'cli-name', version: '3.0.0' }), makeFs())

    // Check that input was called with CLI-provided defaults
    expect(mockedInput).toHaveBeenCalledWith(expect.objectContaining({ default: 'cli-name' }))
    expect(mockedInput).toHaveBeenCalledWith(expect.objectContaining({ default: '3.0.0' }))
  })

  it('returns null on Ctrl+C (ExitPromptError)', async () => {
    const exitError = new Error('User force closed')
    exitError.name = 'ExitPromptError'
    mockedInput.mockRejectedValueOnce(exitError)

    const result = await runInteractiveFlow(makeConfig(), makeFs())

    expect(result).toBeNull()
  })
})
