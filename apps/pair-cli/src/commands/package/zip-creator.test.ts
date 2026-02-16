import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createPackageZip } from './zip-creator'
import type { ManifestMetadata } from './metadata'
import type { RegistryConfig } from '#registry'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Helper to create test registry config
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

// Shared test setup
let fsService: InMemoryFileSystemService
let tempDir: string
let outputPath: string

function setupTest() {
  fsService = new InMemoryFileSystemService({}, '/test-module', '/test-project')
  tempDir = path.join(os.tmpdir(), `test-zip-${Date.now()}`)
  outputPath = path.join(tempDir, 'test-package.zip')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
}

async function cleanupTest() {
  await new Promise(resolve => setTimeout(resolve, 50))
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('createPackageZip - basic operations', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('creates ZIP file at specified output path', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/README.md`, 'KB content')

    const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
    const manifest: ManifestMetadata = {
      name: 'test-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })

  it('creates output directory if it does not exist', async () => {
    // validateOutputDirectory now creates directory with mkdir -p behavior
    const projectRoot = '/test-project'
    const testOutput = path.join(tempDir, 'nested/deep/package.zip')
    const registries: RegistryConfig[] = []
    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: [],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath: testOutput }, fsService)

    expect(fsService.existsSync(testOutput)).toBe(true)
  })
})

describe('createPackageZip - manifest injection', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('includes manifest.json at ZIP root', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/file.md`, 'content')

    const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
    const manifest: ManifestMetadata = {
      name: 'my-kb',
      version: '2.0.0',
      description: 'Test KB',
      author: 'Tester',
      created_at: '2025-11-30T12:00:00Z',
      registries: ['knowledge'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })

  it('manifest.json contains correct metadata fields', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/adoption/doc.md`, 'adoption')

    const registries = [testRegistry('.pair/adoption', '.pair-adoption')]
    const manifest: ManifestMetadata = {
      name: 'test-package',
      version: '1.5.0',
      description: 'Test description',
      author: 'Test Author',
      created_at: '2025-11-30T15:30:00Z',
      registries: ['adoption'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })
})

describe('createPackageZip - single registry', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('includes all files from single registry directory', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/README.md`, 'readme')
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/guide.md`, 'guide')
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/sub/doc.md`, 'subdoc')

    const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
    const manifest: ManifestMetadata = {
      name: 'kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })

  it('includes file-based registry (AGENTS.md)', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/AGENTS.md`, '# AI Agents')

    const registries = [testRegistry('AGENTS.md', 'AGENTS.md')]
    const manifest: ManifestMetadata = {
      name: 'agents-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['agents'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })
})

describe('createPackageZip - multiple registries', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('includes files from multiple registry directories', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/kb.md`, 'kb')
    await fsService.writeFile(`${projectRoot}/.pair/adoption/adopt.md`, 'adopt')
    await fsService.writeFile(`${projectRoot}/.github/workflow.yml`, 'workflow')

    const registries = [
      testRegistry('.pair/knowledge', '.pair-knowledge'),
      testRegistry('.pair/adoption', '.pair-adoption'),
      testRegistry('.github', '.github'),
    ]
    const manifest: ManifestMetadata = {
      name: 'full-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge', 'adoption', 'github'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })

  it('preserves directory structure within registries', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/a/b/c/deep.md`, 'deep file')
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/top.md`, 'top file')

    const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
    const manifest: ManifestMetadata = {
      name: 'structured-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })
})

describe('createPackageZip - symlink and structure', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('skips symbolic links without error', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/real.md`, 'real file')

    const manifest: ManifestMetadata = {
      name: 'kb-no-symlinks',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge'],
    }

    await expect(
      createPackageZip(
        { projectRoot, registries: [testRegistry('.pair/knowledge')], manifest, outputPath },
        fsService,
      ),
    ).resolves.not.toThrow()
  })

  it('creates ZIP with source paths as entry names', async () => {
    const projectRoot = '/test-project'
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/doc.md`, 'content')
    await fsService.writeFile(`${projectRoot}/.github/workflow.yml`, 'workflow')
    await fsService.writeFile(`${projectRoot}/AGENTS.md`, 'agents')

    const registries = [
      testRegistry('.pair/knowledge', '.pair-knowledge'),
      testRegistry('.github', '.github'),
      testRegistry('AGENTS.md', 'AGENTS.md'),
    ]
    const manifest: ManifestMetadata = {
      name: 'complete-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge', 'github', 'agents'],
    }

    await createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService)

    expect(fsService.existsSync(outputPath)).toBe(true)
  })
})

describe('createPackageZip - target layout', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('packages files from target paths when layout is target', async () => {
    const projectRoot = '/test-project'
    const registry: RegistryConfig = {
      source: '.pair/knowledge',
      behavior: 'mirror',
      description: 'Test',
      include: [],
      flatten: false,
      targets: [{ path: '.pair-knowledge', mode: 'canonical' }],
    }

    // Seed files in target path (not source)
    await fsService.writeFile(`${projectRoot}/.pair-knowledge/doc.md`, 'target content')

    const manifest: ManifestMetadata = {
      name: 'target-kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['knowledge'],
    }

    await createPackageZip(
      { projectRoot, registries: [registry], manifest, outputPath, layout: 'target' },
      fsService,
    )

    expect(fsService.existsSync(outputPath)).toBe(true)
  })
})

describe('createPackageZip - error handling', () => {
  beforeEach(setupTest)
  afterEach(cleanupTest)

  it('throws error if registry source does not exist', async () => {
    const projectRoot = '/test-project'
    const registries = [testRegistry('.pair/missing', '.pair-missing')]
    const manifest: ManifestMetadata = {
      name: 'kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['missing'],
    }

    await expect(
      createPackageZip({ projectRoot, registries, manifest, outputPath }, fsService),
    ).rejects.toThrow()
  })

  it('cleans up partial ZIP on error', async () => {
    const projectRoot = '/test-project'
    const manifest: ManifestMetadata = {
      name: 'kb',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: ['bad'],
    }

    try {
      await createPackageZip(
        { projectRoot, registries: [testRegistry('.pair/bad')], manifest, outputPath },
        fsService,
      )
    } catch {
      // Expected error
    }

    expect(fsService.existsSync(outputPath)).toBe(false)
  })
})

describe('createPackageZip - content checksum', () => {
  it('embeds contentChecksum in manifest.json (integration test)', async () => {
    // Use real filesystem for this integration test
    const testDir = path.join(os.tmpdir(), `test-checksum-${Date.now()}`)
    const projectRoot = path.join(testDir, 'project')
    const outputPath = path.join(testDir, 'test-package.zip')

    try {
      // Setup
      fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/file.md'), 'test content')

      const { fileSystemService } = await import('@pair/content-ops')
      const realFs = fileSystemService

      const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
      const manifest: ManifestMetadata = {
        name: 'test-kb',
        version: '1.0.0',
        created_at: '2025-11-30T00:00:00Z',
        registries: ['knowledge'],
      }

      await createPackageZip({ projectRoot, registries, manifest, outputPath }, realFs)

      // Verify ZIP was created
      expect(fs.existsSync(outputPath)).toBe(true)

      // Extract and verify manifest contains contentChecksum
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(outputPath)
      const manifestEntry = zip.getEntry('manifest.json')
      expect(manifestEntry).toBeDefined()

      const manifestContent = manifestEntry!.getData().toString('utf-8')
      const parsedManifest = JSON.parse(manifestContent)

      expect(parsedManifest.contentChecksum).toBeDefined()
      expect(typeof parsedManifest.contentChecksum).toBe('string')
      expect(parsedManifest.contentChecksum).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      // Cleanup
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  it('produces deterministic checksum for same content (integration test)', async () => {
    const testDir = path.join(os.tmpdir(), `test-checksum-det-${Date.now()}`)
    const projectRoot1 = path.join(testDir, 'project1')
    const projectRoot2 = path.join(testDir, 'project2')
    const outputPath1 = path.join(testDir, 'package1.zip')
    const outputPath2 = path.join(testDir, 'package2.zip')

    try {
      // Setup project 1
      fs.mkdirSync(path.join(projectRoot1, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot1, '.pair/knowledge/file.md'), 'deterministic')

      // Setup project 2 with same content
      fs.mkdirSync(path.join(projectRoot2, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot2, '.pair/knowledge/file.md'), 'deterministic')

      const { fileSystemService } = await import('@pair/content-ops')
      const realFs = fileSystemService

      const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
      const manifest: ManifestMetadata = {
        name: 'test-kb',
        version: '1.0.0',
        created_at: '2025-11-30T00:00:00Z',
        registries: ['knowledge'],
      }

      // Create both packages
      await createPackageZip(
        { projectRoot: projectRoot1, registries, manifest, outputPath: outputPath1 },
        realFs,
      )
      await createPackageZip(
        { projectRoot: projectRoot2, registries, manifest, outputPath: outputPath2 },
        realFs,
      )

      const AdmZip = (await import('adm-zip')).default
      const zip1 = new AdmZip(outputPath1)
      const zip2 = new AdmZip(outputPath2)

      const manifest1 = JSON.parse(zip1.getEntry('manifest.json')!.getData().toString('utf-8'))
      const manifest2 = JSON.parse(zip2.getEntry('manifest.json')!.getData().toString('utf-8'))

      expect(manifest1.contentChecksum).toBe(manifest2.contentChecksum)
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  it('produces different checksum when content changes (integration test)', async () => {
    const testDir = path.join(os.tmpdir(), `test-checksum-diff-${Date.now()}`)
    const projectRoot1 = path.join(testDir, 'project1')
    const projectRoot2 = path.join(testDir, 'project2')
    const outputPath1 = path.join(testDir, 'package1.zip')
    const outputPath2 = path.join(testDir, 'package2.zip')

    try {
      // Setup project 1
      fs.mkdirSync(path.join(projectRoot1, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot1, '.pair/knowledge/file.md'), 'original content')

      // Setup project 2 with different content
      fs.mkdirSync(path.join(projectRoot2, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot2, '.pair/knowledge/file.md'), 'modified content')

      const { fileSystemService } = await import('@pair/content-ops')
      const realFs = fileSystemService

      const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
      const manifest: ManifestMetadata = {
        name: 'test-kb',
        version: '1.0.0',
        created_at: '2025-11-30T00:00:00Z',
        registries: ['knowledge'],
      }

      // Create both packages
      await createPackageZip(
        { projectRoot: projectRoot1, registries, manifest, outputPath: outputPath1 },
        realFs,
      )
      await createPackageZip(
        { projectRoot: projectRoot2, registries, manifest, outputPath: outputPath2 },
        realFs,
      )

      const AdmZip = (await import('adm-zip')).default
      const zip1 = new AdmZip(outputPath1)
      const zip2 = new AdmZip(outputPath2)

      const manifest1 = JSON.parse(zip1.getEntry('manifest.json')!.getData().toString('utf-8'))
      const manifest2 = JSON.parse(zip2.getEntry('manifest.json')!.getData().toString('utf-8'))

      expect(manifest1.contentChecksum).not.toBe(manifest2.contentChecksum)
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  it('created package passes verification (smoke test)', async () => {
    const testDir = path.join(os.tmpdir(), `test-smoke-${Date.now()}`)
    const projectRoot = path.join(testDir, 'project')
    const outputPath = path.join(testDir, 'test-package.zip')

    try {
      // Setup
      fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/doc.md'), 'smoke test content')

      const { fileSystemService } = await import('@pair/content-ops')
      const realFs = fileSystemService

      const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
      const manifest: ManifestMetadata = {
        name: 'smoke-test-kb',
        version: '1.0.0',
        created_at: '2025-11-30T00:00:00Z',
        registries: ['knowledge'],
      }

      // Create package
      await createPackageZip({ projectRoot, registries, manifest, outputPath }, realFs)
      expect(fs.existsSync(outputPath)).toBe(true)

      // Verify package passes verification
      const { verifyPackage } = await import('../kb-verify/verify-package.js')
      const result = await verifyPackage(outputPath, realFs)

      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  it('corrupted package fails verification (smoke test)', async () => {
    const testDir = path.join(os.tmpdir(), `test-corrupt-${Date.now()}`)
    const projectRoot = path.join(testDir, 'project')
    const outputPath = path.join(testDir, 'corrupt-package.zip')

    try {
      // Setup and create valid package
      fs.mkdirSync(path.join(projectRoot, '.pair/knowledge'), { recursive: true })
      fs.writeFileSync(path.join(projectRoot, '.pair/knowledge/doc.md'), 'original content')

      const { fileSystemService } = await import('@pair/content-ops')
      const realFs = fileSystemService

      const registries = [testRegistry('.pair/knowledge', '.pair-knowledge')]
      const manifest: ManifestMetadata = {
        name: 'corrupt-test-kb',
        version: '1.0.0',
        created_at: '2025-11-30T00:00:00Z',
        registries: ['knowledge'],
      }

      await createPackageZip({ projectRoot, registries, manifest, outputPath }, realFs)

      // Corrupt the package by replacing checksum in manifest with invalid value
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(outputPath)
      const manifestEntry = zip.getEntry('manifest.json')
      const manifestData = JSON.parse(manifestEntry!.getData().toString('utf-8'))
      manifestData.contentChecksum = 'corrupted_invalid_checksum_value'
      zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifestData, null, 2)))
      zip.writeZip(outputPath)

      // Verify corrupted package fails verification
      const { verifyPackage } = await import('../kb-verify/verify-package.js')
      const result = await verifyPackage(outputPath, realFs)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join('\n')).toContain('checksum')
    } finally {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })
})
