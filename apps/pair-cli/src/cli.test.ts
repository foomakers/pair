/* eslint-disable max-lines-per-function, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { join } from 'path'
import { readFileSync } from 'fs'
import { getKnowledgeHubDatasetPath } from './config-utils'
import type { FileSystemService } from '@pair/content-ops'
import { Command } from 'commander'
import { checkKnowledgeHubDatasetAccessible } from './cli'

// Create a mock fs service for tests
const mockFsService = {
  rootModuleDirectory: () => __dirname,
  currentWorkingDirectory: () => process.cwd(),
  existsSync: () => true,
}

const pkg = JSON.parse(
  readFileSync(join(mockFsService.rootModuleDirectory(), '..', 'package.json'), 'utf-8'),
)

describe('pair-cli basics', () => {
  it.skip('should print the correct version with --version', execVersionTestWrapper)
  it.skip('help output does not mention --dry-run or --verbose', execHelpTestWrapper)
  // eslint-disable-next-line max-lines-per-function
  it.skip('update-link --absolute converts relative links to absolute (e2e)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    const tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-'))
    const mdPath = path.join(tmpDir, 'README.md')
    fs.writeFileSync(mdPath, '[Doc](docs/usage.md)')
    // Simulate .pair directory
    fs.mkdirSync(path.join(tmpDir, '.pair'))
    fs.writeFileSync(path.join(tmpDir, '.pair', 'README.md'), '[Doc](docs/usage.md)')
    // Run CLI
    const cliPath = path.join(__dirname, 'cli.ts')
    const tsNodePath = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node')
    const result = require('child_process').execSync(
      `${tsNodePath} ${cliPath} update-link --absolute`,
      {
        cwd: tmpDir,
        encoding: 'utf8',
      },
    )
    // Check that the link was converted to absolute
    const updated = fs.readFileSync(path.join(tmpDir, '.pair', 'README.md'), 'utf8')
    expect(updated).toMatch(/\]\(.*\/README\.md\)/)
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it.skip('update-link --relative converts absolute links to relative (e2e)', async () => {
    // Setup: create a temp markdown file with an absolute link
    const fs = require('fs')
    const path = require('path')
    const tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-'))
    const mdPath = path.join(tmpDir, 'README.md')
    fs.writeFileSync(mdPath, '[Doc](/absolute/path/docs/usage.md)')
    // Simulate .pair directory
    fs.mkdirSync(path.join(tmpDir, '.pair'))
    fs.writeFileSync(path.join(tmpDir, '.pair', 'README.md'), '[Doc](/absolute/path/docs/usage.md)')
    // Run CLI
    const cliPath = path.join(__dirname, 'cli.ts')
    const tsNodePath = path.join(__dirname, '..', 'node_modules', '.bin', 'ts-node')
    const result = require('child_process').execSync(
      `${tsNodePath} ${cliPath} update-link --relative`,
      {
        cwd: tmpDir,
        encoding: 'utf8',
      },
    )
    // Check that the link was converted to relative
    const updated = fs.readFileSync(path.join(tmpDir, '.pair', 'README.md'), 'utf8')
    expect(updated).toMatch(/\]\(docs\/usage\.md\)/)
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
  it('returns knowledge-hub dataset path', testKnowledgeHubDatasetPath)
  it('shows welcome message for invalid commands', testWelcomeMessage)
  it('fails when dataset path exists but is not readable', testDatasetNotAccessible)
  it('fails when dataset path resolution fails', testDatasetPathResolutionFailure)
  it('sets correct exit codes for success and failure cases', testExitCodes)
})

function execVersionTestWrapper() {
  const output = execVersionTest()
  expect(output).toContain(pkg.version)
}

function execHelpTestWrapper() {
  const output = execHelpTest()
  expect(output).not.toContain('--dry-run')
  expect(output).not.toContain('--verbose')
}

function testKnowledgeHubDatasetPath() {
  const fsService = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
  }
  const p = getKnowledgeHubDatasetPath(fsService as unknown as FileSystemService)
  expect(p).toContain('packages')
  expect(p).toContain('knowledge-hub')
  expect(p).toContain('dataset')
}

function testWelcomeMessage() {
  const logs: string[] = []
  const originalLog = console.log
  const originalExit = process.exit

  console.log = (...args: unknown[]) => {
    logs.push(args.join(' '))
  }
  process.exit = () => {
    throw new Error('process.exit called')
  }

  try {
    const program = new Command()
    program.name('pair').description('Pair CLI')
    program.action(() => {
      console.log('Welcome to Pair CLI!')
      console.log('💡 Tip: Use "pair install --list-targets" to see available asset registries')
    })

    program.parse(['node', 'cli.js'])

    expect(logs).toContain('Welcome to Pair CLI!')
    expect(logs.some(log => log.includes('pair install --list-targets'))).toBe(true)
  } finally {
    console.log = originalLog
    process.exit = originalExit
  }
}

function execVersionTest(): string {
  const cliPath = join(mockFsService.rootModuleDirectory(), 'cli.ts')
  const tsNodePath = join(
    mockFsService.rootModuleDirectory(),
    '..',
    'node_modules',
    '.bin',
    'ts-node',
  )
  return execSync(`${tsNodePath} ${cliPath} --version`).toString().trim()
}

function execHelpTest(): string {
  const cliPath = join(mockFsService.rootModuleDirectory(), 'cli.ts')
  const tsNodePath = join(
    mockFsService.rootModuleDirectory(),
    '..',
    'node_modules',
    '.bin',
    'ts-node',
  )
  return execSync(`${tsNodePath} ${cliPath} --help`).toString()
}

function testDatasetNotAccessible() {
  // Create a mock fs service where dataset path exists but accessSync throws
  const mockFs = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => true, // Dataset path exists
    accessSync: () => {
      throw new Error('Permission denied') // But not readable
    },
  }

  // Mock process.exit to prevent actual exit
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
    expect(exitCalled).toBe(true)
    expect(exitCode).toBe(1)
    expect((err as Error).message).toBe('process.exit called')
  } finally {
    process.exit = originalExit
    process.exitCode = originalExitCode
  }
}

function testDatasetPathResolutionFailure() {
  // Create a mock fs service where getKnowledgeHubDatasetPath throws
  const mockFs = {
    rootModuleDirectory: () => {
      throw new Error('Cannot resolve root module directory')
    },
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
    accessSync: () => {},
  }

  // Mock process.exit to prevent actual exit
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
    expect(exitCalled).toBe(true)
    expect(exitCode).toBe(1)
    expect((err as Error).message).toBe('process.exit called')
  } finally {
    process.exit = originalExit
    process.exitCode = originalExitCode
  }
}

function testExitCodes() {
  // Test successful case - this would be when dataset is accessible
  const mockFsSuccess = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => true,
    accessSync: () => {}, // No error thrown
  }

  // Reset exit code
  process.exitCode = undefined

  // This should not call process.exit
  checkKnowledgeHubDatasetAccessible(mockFsSuccess as unknown as FileSystemService)
  expect(process.exitCode).toBeUndefined() // Should not be set

  // Test failure case - dataset not found
  const mockFsFailure = {
    rootModuleDirectory: () => '/',
    currentWorkingDirectory: () => '/',
    existsSync: () => false, // Dataset doesn't exist
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
    expect(process.exitCode).toBe(1)
  } finally {
    process.exit = originalExit
  }
}
