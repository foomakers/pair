import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { handleKbVerifyCommand } from './handler'
import { createPackageZip } from '../package/zip-creator'
import type { ManifestMetadata } from '../package/metadata'
import type { RegistryConfig } from '#registry'
import fs from 'fs'
import path from 'path'
import os from 'os'

function testRegistry(source: string, targetPath = source): RegistryConfig {
  return {
    source,
    behavior: 'mirror',
    description: 'Test registry',
    include: [],
    flatten: false,
    targets: [{ path: targetPath, mode: 'canonical' }],
  }
}

describe('handleKbVerifyCommand', () => {
  let testDir: string
  let projectRoot: string
  let packagePath: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-verify-${Date.now()}`)
    projectRoot = path.join(testDir, 'project')
    packagePath = path.join(testDir, 'test.zip')
    fs.mkdirSync(projectRoot, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('returns 0 for valid package', async () => {
    // Create a valid package
    fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/test.md'), 'test content')

    const manifest: ManifestMetadata = {
      name: 'test-kb',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      registries: ['knowledge'],
    }

    await createPackageZip(
      {
        projectRoot,
        registries: [testRegistry('.pair/knowledge')],
        manifest,
        outputPath: packagePath,
      },
      fileSystemService,
    )

    const exitCode = await handleKbVerifyCommand(
      { command: 'kb-verify', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(0)
  })

  it('returns 1 for nonexistent file', async () => {
    const exitCode = await handleKbVerifyCommand(
      { command: 'kb-verify', packagePath: '/nonexistent/file.zip', json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })

  it('returns 1 for invalid ZIP', async () => {
    // Create a non-ZIP file
    fs.writeFileSync(packagePath, 'not a zip file')

    const exitCode = await handleKbVerifyCommand(
      { command: 'kb-verify', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })

  it('outputs JSON when --json flag is set', async () => {
    // Create a valid package
    fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/test.md'), 'test content')

    const manifest: ManifestMetadata = {
      name: 'test-kb',
      version: '1.0.0',
      created_at: new Date().toISOString(),
      registries: ['knowledge'],
    }

    await createPackageZip(
      {
        projectRoot,
        registries: [testRegistry('.pair/knowledge')],
        manifest,
        outputPath: packagePath,
      },
      fileSystemService,
    )

    // Capture console output
    const consoleLog = console.log
    let output = ''
    console.log = (msg: string) => {
      output += msg
    }

    try {
      await handleKbVerifyCommand(
        { command: 'kb-verify', packagePath, json: true },
        fileSystemService,
      )

      // Verify output is valid JSON
      const parsed = JSON.parse(output)
      expect(parsed.package).toBe(packagePath)
      expect(parsed.overall).toBe('PASS')
      expect(parsed.checks).toBeDefined()
    } finally {
      console.log = consoleLog
    }
  })
})
