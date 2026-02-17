import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileSystemService } from '@pair/content-ops'
import { handleKbInfoCommand } from './handler'
import { createPackageZip } from '../package/zip-creator'
import type { ManifestMetadata } from '../package/metadata'
import type { RegistryConfig } from '#registry'
import fs from 'fs'
import path from 'path'
import os from 'os'

function testRegistry(source: string): RegistryConfig {
  return {
    source,
    behavior: 'mirror',
    description: 'Test registry',
    include: [],
    flatten: false,
    targets: [{ path: source, mode: 'canonical' }],
  }
}

describe('handleKbInfoCommand', () => {
  let testDir: string
  let projectRoot: string
  let packagePath: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-info-${Date.now()}`)
    projectRoot = path.join(testDir, 'project')
    packagePath = path.join(testDir, 'test.zip')
    fs.mkdirSync(projectRoot, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  const baseManifest: ManifestMetadata = {
    name: 'test-kb',
    version: '1.0.0',
    description: 'Test KB',
    author: 'Tester',
    tags: ['ai'],
    license: 'MIT',
    created_at: '2026-01-01T00:00:00.000Z',
    registries: ['knowledge'],
  }

  async function createTestPackage(manifest: ManifestMetadata) {
    fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/test.md'), 'test content')

    await createPackageZip(
      {
        projectRoot,
        registries: [testRegistry('.pair/knowledge')],
        manifest,
        outputPath: packagePath,
      },
      fileSystemService,
    )
  }

  it('displays standard metadata and returns 0', async () => {
    await createTestPackage(baseManifest)
    let output = ''
    const origLog = console.log
    console.log = (msg: string) => {
      output += msg
    }

    try {
      const exitCode = await handleKbInfoCommand(
        { command: 'kb-info', packagePath, json: false },
        fileSystemService,
      )

      expect(exitCode).toBe(0)
      expect(output).toContain('test-kb')
      expect(output).toContain('1.0.0')
      expect(output).toContain('Package Information')
    } finally {
      console.log = origLog
    }
  })

  it('displays org metadata when present', async () => {
    const manifest: ManifestMetadata = {
      ...baseManifest,
      organization: {
        name: 'Acme Corp',
        team: 'Platform',
        compliance: ['SOC2'],
        distribution: 'private',
      },
    }
    await createTestPackage(manifest)
    let output = ''
    const origLog = console.log
    console.log = (msg: string) => {
      output += msg
    }

    try {
      const exitCode = await handleKbInfoCommand(
        { command: 'kb-info', packagePath, json: false },
        fileSystemService,
      )

      expect(exitCode).toBe(0)
      expect(output).toContain('Organization')
      expect(output).toContain('Acme Corp')
      expect(output).toContain('Platform')
    } finally {
      console.log = origLog
    }
  })

  it('does not show org section for standard packages', async () => {
    await createTestPackage(baseManifest)
    let output = ''
    const origLog = console.log
    console.log = (msg: string) => {
      output += msg
    }

    try {
      await handleKbInfoCommand({ command: 'kb-info', packagePath, json: false }, fileSystemService)

      expect(output).not.toContain('Organization')
    } finally {
      console.log = origLog
    }
  })

  it('outputs JSON with --json flag', async () => {
    await createTestPackage(baseManifest)
    let output = ''
    const origLog = console.log
    console.log = (msg: string) => {
      output += msg
    }

    try {
      const exitCode = await handleKbInfoCommand(
        { command: 'kb-info', packagePath, json: true },
        fileSystemService,
      )

      expect(exitCode).toBe(0)
      const parsed = JSON.parse(output)
      expect(parsed.name).toBe('test-kb')
      expect(parsed.version).toBe('1.0.0')
    } finally {
      console.log = origLog
    }
  })

  it('returns 1 for non-existent file', async () => {
    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', packagePath: '/nonexistent/file.zip', json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })

  it('returns 1 for invalid ZIP', async () => {
    fs.writeFileSync(packagePath, 'not a zip file')

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })
})
