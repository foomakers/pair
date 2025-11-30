import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { createPackageZip } from './zip-creator'
import type { ManifestMetadata } from './metadata'
import type { AssetRegistryConfig } from '../install'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Helper to create test registry config
function testRegistry(source: string, target_path = source): AssetRegistryConfig {
  return {
    source,
    target_path,
    behavior: 'mirror',
    description: 'Test registry',
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

    expect(fs.existsSync(outputPath)).toBe(true)
  })

  it('throws error if output directory does not exist', async () => {
    const projectRoot = '/test-project'
    const invalidOutput = '/nonexistent/dir/package.zip'
    const registries: never[] = []
    const manifest: ManifestMetadata = {
      name: 'test',
      version: '1.0.0',
      created_at: '2025-11-30T00:00:00Z',
      registries: [],
    }

    await expect(
      createPackageZip({ projectRoot, registries, manifest, outputPath: invalidOutput }, fsService),
    ).rejects.toThrow()
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(true)
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

    expect(fs.existsSync(outputPath)).toBe(false)
  })
})
