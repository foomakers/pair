import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fileSystemService,
  InMemoryFileSystemService,
  MockHttpClientService,
  buildTestResponse,
  toIncomingMessage,
} from '@pair/content-ops'
import { handleKbInfoCommand } from './handler'
import { handleInstallCommand } from '../install/handler'
import { handleUpdateCommand } from '../update/handler'
import { createPackageZip } from '../package/zip-creator'
import type { ManifestMetadata } from '../package/metadata'
import type { RegistryConfig } from '#registry'
import fs from 'fs'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'

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
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test-info-${Date.now()}`)
    projectRoot = path.join(testDir, 'project')
    packagePath = path.join(testDir, 'test.zip')
    fs.mkdirSync(projectRoot, { recursive: true })
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  function capturedOutput(): string {
    return logSpy.mock.calls.map(args => args.join(' ')).join('\n')
  }

  it('displays standard metadata and returns 0', async () => {
    await createTestPackage(baseManifest)

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('test-kb')
    expect(output).toContain('1.0.0')
    expect(output).toContain('Package Information')
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

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('Organization')
    expect(output).toContain('Acme Corp')
    expect(output).toContain('Platform')
  })

  it('does not show org section for standard packages', async () => {
    await createTestPackage(baseManifest)

    await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(capturedOutput()).not.toContain('Organization')
  })

  it('outputs JSON with --json flag', async () => {
    await createTestPackage(baseManifest)

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: true },
      fileSystemService,
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(capturedOutput())
    expect(parsed.name).toBe('test-kb')
    expect(parsed.version).toBe('1.0.0')
  })

  it('returns 1 for non-existent file', async () => {
    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath: '/nonexistent/file.zip', json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })

  it('returns 1 for invalid ZIP', async () => {
    fs.writeFileSync(packagePath, 'not a zip file')

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
  })

  it('returns 1 for ZIP with malformed JSON in manifest', async () => {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from('not valid json{'))
    zip.writeZip(packagePath)

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'))
  })

  it('returns 1 for ZIP with no manifest.json', async () => {
    const zip = new AdmZip()
    zip.addFile('other.txt', Buffer.from('hello'))
    zip.writeZip(packagePath)

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing manifest.json'))
  })

  it('returns 1 for manifest missing required fields', async () => {
    const zip = new AdmZip()
    zip.addFile('manifest.json', Buffer.from(JSON.stringify({ description: 'no name or version' })))
    zip.writeZip(packagePath)

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'package', packagePath, json: false },
      fileSystemService,
    )

    expect(exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid manifest'))
  })
})

describe('handleKbInfoCommand - version-check mode', () => {
  const cwd = '/project'
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function capturedOutput(): string {
    return logSpy.mock.calls.map(args => args.join(' ')).join('\n')
  }

  function registryFs(files: Record<string, string> = {}): InMemoryFileSystemService {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
          version: '1.2.0',
        }),
        [`${cwd}/packages/knowledge-hub/dataset/.keep`]: '',
        ...files,
      },
      cwd,
      cwd,
    )
  }

  it('reports up-to-date when installed matches current registry version (match fixture)', async () => {
    const fsService = registryFs({
      [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.2.0' }),
    })

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'version-check', json: false },
      fsService,
      { baseTarget: cwd },
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('Up to date')
    expect(output).toContain('1.2.0')
  })

  it('reports drift with a migration URL when installed is older (drift fixture)', async () => {
    const fsService = registryFs({
      [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }),
    })

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'version-check', json: true },
      fsService,
      { baseTarget: cwd },
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(capturedOutput())
    expect(parsed.status).toBe('drift')
    expect(parsed.installed.version).toBe('1.1.0')
    expect(parsed.current.version).toBe('1.2.0')
    expect(parsed.migrationUrl).toContain('v1.1.0-to-v1.2.0')
  })

  it('degrades gracefully for a legacy install with no version metadata (legacy fixture)', async () => {
    const fsService = registryFs()

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'version-check', json: false },
      fsService,
      { baseTarget: cwd },
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('Unknown installed version')
    expect(output.toLowerCase()).toContain('re-install')
  })

  it('reports current-unavailable when source cannot be resolved (offline fixture)', async () => {
    // No packages/knowledge-hub anywhere — registry resolution fails, simulating
    // a release-mode CLI with no network client and no local dataset.
    const fsService = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }),
      },
      cwd,
      cwd,
    )

    const exitCode = await handleKbInfoCommand(
      { command: 'kb-info', mode: 'version-check', json: false },
      fsService,
      { baseTarget: cwd },
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('Current version unavailable')
    expect(output).toContain('1.1.0')
  })

  it('reports current-unavailable for a remote --source that is unreachable (offline fixture)', async () => {
    const fsService = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }),
      },
      cwd,
      cwd,
    )
    const httpClient = new MockHttpClientService()
    httpClient.setGetError(new Error('network unreachable'))

    const exitCode = await handleKbInfoCommand(
      {
        command: 'kb-info',
        mode: 'version-check',
        json: true,
        source: 'https://mirror.internal/kb.zip',
      },
      fsService,
      { baseTarget: cwd, httpClient },
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(capturedOutput())
    expect(parsed.status).toBe('current-unavailable')
    expect(parsed.current.available).toBe(false)
  })

  it('resolves current version from a reachable remote --source URL', async () => {
    const fsService = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.2.0' }),
      },
      cwd,
      cwd,
    )
    const httpClient = new MockHttpClientService()
    httpClient.setGetResponses([toIncomingMessage(buildTestResponse(200))])

    const exitCode = await handleKbInfoCommand(
      {
        command: 'kb-info',
        mode: 'version-check',
        json: true,
        source:
          'https://github.com/foomakers/pair/releases/download/v1.2.0/knowledge-base-1.2.0.zip',
      },
      fsService,
      { baseTarget: cwd, httpClient },
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(capturedOutput())
    expect(parsed.status).toBe('up-to-date')
    expect(parsed.current.version).toBe('1.2.0')
    expect(parsed.current.sourceKind).toBe('remote')
  })
  it('reports drift for a git --source whose clone carries a newer manifest (AC1)', async () => {
    const fsService = new InMemoryFileSystemService(
      { [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }) },
      cwd,
      cwd,
    )

    const exitCode = await handleKbInfoCommand(
      {
        command: 'kb-info',
        mode: 'version-check',
        json: true,
        source: 'https://github.com/org/kb.git#v1.2.0',
      },
      fsService,
      {
        baseTarget: cwd,
        gitCloner: (_source, destDir) => {
          void fsService.writeFile(`${destDir}/manifest.json`, JSON.stringify({ version: '1.2.0' }))
        },
      },
    )

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(capturedOutput())
    expect(parsed.status).toBe('drift')
    expect(parsed.current.sourceKind).toBe('git')
    expect(parsed.current.version).toBe('1.2.0')
    expect(parsed.current.available).toBe(true)
    expect(parsed.migrationUrl).toContain('v1.1.0-to-v1.2.0')
  })

  it('reports current-unavailable with exit code 0 when a git clone fails (AC3)', async () => {
    const fsService = new InMemoryFileSystemService(
      { [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }) },
      cwd,
      cwd,
    )

    const exitCode = await handleKbInfoCommand(
      {
        command: 'kb-info',
        mode: 'version-check',
        json: false,
        source: 'https://github.com/org/kb.git',
      },
      fsService,
      {
        baseTarget: cwd,
        gitCloner: () => {
          throw new Error('git executable not found. Install git to use git repository sources.')
        },
      },
    )

    expect(exitCode).toBe(0)
    const output = capturedOutput()
    expect(output).toContain('Current version unavailable')
    expect(output).toContain('git executable not found')
    expect(output).toContain('1.1.0')
  })

  it('never prints a git credential in human or JSON output (AC4)', async () => {
    const failing = () => {
      throw new Error("fatal: could not read from 'https://ghp_supersecret@github.com/org/kb.git'")
    }

    for (const json of [false, true]) {
      logSpy.mockClear()
      const fsService = new InMemoryFileSystemService(
        { [`${cwd}/.pair/.kb-version.json`]: JSON.stringify({ version: '1.1.0' }) },
        cwd,
        cwd,
      )

      const exitCode = await handleKbInfoCommand(
        {
          command: 'kb-info',
          mode: 'version-check',
          json,
          source: 'https://github.com/org/kb.git',
        },
        fsService,
        { baseTarget: cwd, gitCloner: failing },
      )

      expect(exitCode).toBe(0)
      expect(capturedOutput()).not.toContain('ghp_supersecret')
      expect(capturedOutput()).toContain('***@github.com')
    }
  })
})

/**
 * #261 DoD round-trip (co-located here — root of the call chain is
 * handleKbInfoCommand, whose version-check output this asserts on; install/update
 * are setup). Shares one in-memory FS across all three handlers so the recorded
 * marker (`.pair/.kb-version.json`) is exactly what kb-info reads back.
 */
describe('handleKbInfoCommand - install -> check(drift) -> update -> check(clean) round-trip', () => {
  const cwd = '/roundtrip-project'
  const kbPkg = `${cwd}/packages/knowledge-hub/package.json`
  const datasetFile = `${cwd}/packages/knowledge-hub/dataset/test-registry/file1.md`
  const marker = `${cwd}/.pair/.kb-version.json`

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeFs(): InMemoryFileSystemService {
    return new InMemoryFileSystemService(
      {
        [`${cwd}/package.json`]: JSON.stringify({ name: 'test', version: '0.1.0' }),
        [kbPkg]: JSON.stringify({ name: '@pair/knowledge-hub', version: '1.1.0' }),
        [`${cwd}/config.json`]: JSON.stringify({
          asset_registries: {
            'test-registry': {
              source: 'test-registry',
              behavior: 'mirror',
              targets: [{ path: '.pair/test-registry', mode: 'canonical' }],
              description: 'Test registry',
            },
          },
        }),
        [datasetFile]: '# Content v1',
      },
      cwd,
      cwd,
    )
  }

  function versionCheck(fs: InMemoryFileSystemService) {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    return handleKbInfoCommand({ command: 'kb-info', mode: 'version-check', json: true }, fs, {
      baseTarget: cwd,
    }).then(exitCode => {
      const output = logSpy.mock.calls.map(args => args.join(' ')).join('\n')
      logSpy.mockRestore()
      return { exitCode, result: JSON.parse(output) }
    })
  }

  it('drift is flagged after installing an older KB, then cleared by update', async () => {
    const fs = makeFs()

    await handleInstallCommand(
      { command: 'install', resolution: 'default', kb: true, offline: false },
      fs,
    )
    expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.1.0')

    await fs.writeFile(kbPkg, JSON.stringify({ name: '@pair/knowledge-hub', version: '1.2.0' }))
    await fs.writeFile(datasetFile, '# Content v2')

    const drift = await versionCheck(fs)
    expect(drift.exitCode).toBe(0)
    expect(drift.result.status).toBe('drift')
    expect(drift.result.installed.version).toBe('1.1.0')
    expect(drift.result.current.version).toBe('1.2.0')
    expect(drift.result.migrationUrl).toContain('v1.1.0-to-v1.2.0')

    await handleUpdateCommand(
      { command: 'update', resolution: 'default', kb: true, offline: false },
      fs,
    )
    expect(JSON.parse(await fs.readFile(marker)).version).toBe('1.2.0')

    const clean = await versionCheck(fs)
    expect(clean.exitCode).toBe(0)
    expect(clean.result.status).toBe('up-to-date')
    expect(clean.result.installed.version).toBe('1.2.0')
    expect(clean.result.current.version).toBe('1.2.0')
  })
})
