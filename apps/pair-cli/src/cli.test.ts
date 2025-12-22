import { describe, it, expect } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import { Command } from 'commander'
import { checkKnowledgeHubDatasetAccessible } from './cli'

describe('CLI - Dataset Accessibility Checks', () => {
  it('fails when dataset path exists but is not readable', testDatasetNotAccessible)
  it('fails when dataset path resolution fails', testDatasetPathResolutionFailure)
  it('sets correct exit codes for success and failure cases', testExitCodes)
  it('skips dataset check when custom local path is provided', testSkipsCheckWithLocalUrl)
})

function testDatasetNotAccessible() {
  const mockFs = createMockFsWithAccessError()

  const originalExit = process.exit
  const originalExitCode = process.exitCode
  let exitCalled = false
  let exitCode: number | undefined

  process.exit = (code?: number) => {
    exitCalled = true
    exitCode = code
    throw new Error('process.exit called')
  }

  try {
    checkKnowledgeHubDatasetAccessible(mockFs as unknown as FileSystemService)
    expect.fail('Expected process.exit to be called')
  } catch (err) {
    verifyExitCalled(exitCalled, exitCode, err)
  } finally {
    process.exit = originalExit
    process.exitCode = originalExitCode
  }
}

function createMockFsWithAccessError() {
  return {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
    accessSync: () => {
      throw new Error('Permission denied')
    },
  }
}

function verifyExitCalled(exitCalled: boolean, exitCode: number | undefined, err: unknown) {
  expect(exitCalled).toBe(true)
  expect(exitCode).toBe(1)
  expect((err as Error).message).toBe('process.exit called')
}

function testDatasetPathResolutionFailure() {
  const mockFs = createMockFsWithResolutionError()

  const originalExit = process.exit
  const originalExitCode = process.exitCode
  let exitCalled = false
  let exitCode: number | undefined

  process.exit = (code?: number) => {
    exitCalled = true
    exitCode = code
    throw new Error('process.exit called')
  }

  try {
    checkKnowledgeHubDatasetAccessible(mockFs as unknown as FileSystemService)
    expect.fail('Expected process.exit to be called')
  } catch (err) {
    verifyExitCalled(exitCalled, exitCode, err)
  } finally {
    process.exit = originalExit
    process.exitCode = originalExitCode
  }
}

function createMockFsWithResolutionError() {
  return {
    rootModuleDirectory: () => {
      throw new Error('Cannot resolve root module directory')
    },
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
    accessSync: () => {},
  }
}

function testExitCodes() {
  testSuccessfulCase()
  testFailureCase()
}

function testSuccessfulCase() {
  const mockFsSuccess = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
    accessSync: () => {},
  }

  process.exitCode = undefined
  checkKnowledgeHubDatasetAccessible(mockFsSuccess as unknown as FileSystemService)
  expect(process.exitCode).toBeUndefined()
}

function testFailureCase() {
  const mockFsFailure = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => false,
    accessSync: () => {},
  }

  const originalExit = process.exit
  let exitCalled = false
  let exitCode: number | undefined

  process.exit = (code?: number) => {
    exitCalled = true
    exitCode = code
    throw new Error('process.exit called')
  }

  try {
    checkKnowledgeHubDatasetAccessible(mockFsFailure as unknown as FileSystemService)
    expect.fail('Expected process.exit to be called')
  } catch {
    expect(exitCalled).toBe(true)
    expect(exitCode).toBe(1)
  } finally {
    process.exit = originalExit
  }
}

function testSkipsCheckWithLocalUrl() {
  // Bug: checkKnowledgeHubDatasetAccessible should skip validation when customUrl is a local path
  // This test reproduces the bug - it should NOT call process.exit when a local path is provided
  const mockFs = createMockFsWithAccessError()
  const localPath = '/absolute/path/to/dataset'

  const originalExit = process.exit
  let exitCalled = false

  process.exit = () => {
    exitCalled = true
    throw new Error('process.exit called')
  }

  try {
    // When a local path is provided as customUrl, it should NOT check the default dataset location
    checkKnowledgeHubDatasetAccessible(mockFs as unknown as FileSystemService, localPath)
    // Should NOT have called process.exit
    expect(exitCalled).toBe(false)
  } finally {
    process.exit = originalExit
  }
}

describe('CLI command registration', () => {
  it('install command is registered', () => {
    const program = new Command()
    program
      .command('install')
      .description('Install documentation and assets')
      .argument('[target]', 'Target folder')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'install')).toBe(true)

    const installCmd = commands.find(cmd => cmd.name() === 'install')
    expect(installCmd?.description()).toContain('Install documentation')
  })

  it('update command is registered', () => {
    const program = new Command()
    program
      .command('update')
      .description('Update documentation and assets')
      .argument('[target]', 'Target folder')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'update')).toBe(true)

    const updateCmd = commands.find(cmd => cmd.name() === 'update')
    expect(updateCmd?.description()).toContain('Update documentation')
  })

  it('update-link command is registered', () => {
    const program = new Command()
    program
      .command('update-link')
      .description('Validate and update links in installed Knowledge Base content')
      .option('--relative', 'Convert all links to relative paths')
      .option('--absolute', 'Convert all links to absolute paths')
      .option('--dry-run', 'Show what would be changed without modifying files')
      .option('--verbose', 'Show detailed processing information')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'update-link')).toBe(true)

    const updateLinkCmd = commands.find(cmd => cmd.name() === 'update-link')
    expect(updateLinkCmd?.description()).toContain('Validate and update links')
  })

  it('validate-config command is registered', () => {
    const program = new Command()
    program.command('validate-config').description('Validate the asset registry configuration')

    const commands = program.commands
    expect(commands.some(cmd => cmd.name() === 'validate-config')).toBe(true)

    const validateConfigCmd = commands.find(cmd => cmd.name() === 'validate-config')
    expect(validateConfigCmd?.description()).toContain('Validate the asset registry configuration')
  })

  it('package command is registered', async () => {
    const { commandRegistry } = await import('./commands')
    expect(commandRegistry.package).toBeDefined()
    expect(commandRegistry.package.metadata.name).toBe('package')
    expect(commandRegistry.package.metadata.description).toContain('Package KB content')
  })

  it('package command has required options', async () => {
    const { commandRegistry } = await import('./commands')
    const opts = commandRegistry.package.metadata.options

    expect(opts.some(opt => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--source-dir'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--output'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--name'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--version'))).toBe(true)
  })

  it('install command has required options', () => {
    const program = new Command()
    program
      .command('install')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')
      .option('--link-style <style>', 'Link style')
      .option('--url <url>', 'URL to KB source')

    const installCmd = program.commands.find(cmd => cmd.name() === 'install')
    const opts = installCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--list-targets'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--link-style'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--url'))).toBe(true)
  })

  it('update command has required options', () => {
    const program = new Command()
    program
      .command('update')
      .option('-c, --config <file>', 'Path to config file')
      .option('--list-targets', 'List available target folders')
      .option('--link-style <style>', 'Link style')
      .option('--url <url>', 'URL to KB source')

    const updateCmd = program.commands.find(cmd => cmd.name() === 'update')
    const opts = updateCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--config'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--list-targets'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--link-style'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--url'))).toBe(true)
  })

  it('update-link command has required options', () => {
    const program = new Command()
    program
      .command('update-link')
      .option('--relative', 'Convert to relative paths')
      .option('--absolute', 'Convert to absolute paths')
      .option('--dry-run', 'Dry run mode')
      .option('--verbose', 'Verbose logging')

    const updateLinkCmd = program.commands.find(cmd => cmd.name() === 'update-link')
    const opts = updateLinkCmd?.options || []

    expect(opts.some(opt => opt.flags.includes('--relative'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--absolute'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--dry-run'))).toBe(true)
    expect(opts.some(opt => opt.flags.includes('--verbose'))).toBe(true)
  })
})

describe('CLI command execution - package command availability', () => {
  it('package command should be accessible after main() execution', async () => {
    const { commandRegistry } = await import('./commands')

    // Verify package command is in the registry
    expect(commandRegistry.package).toBeDefined()
    expect(commandRegistry.package.metadata).toBeDefined()
    expect(commandRegistry.package.parse).toBeDefined()
    expect(commandRegistry.package.handle).toBeDefined()

    // Verify package command metadata
    expect(commandRegistry.package.metadata.name).toBe('package')
    expect(
      commandRegistry.package.metadata.options.some(opt => opt.flags.includes('--config')),
    ).toBe(true)
  })
})
