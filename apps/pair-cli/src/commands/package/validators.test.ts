import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops'
import { validatePackageStructure } from './validators'
import type { Config } from '#registry'

describe('validatePackageStructure - path existence', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should fail when registry source path does not exist', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
      },
    }

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      "Registry 'knowledge' source path does not exist: /test/project/.pair/knowledge",
    )
  })
})

describe('validatePackageStructure - multiple missing paths', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should fail when multiple registry paths do not exist', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          target_path: '.pair/adoption',
          description: 'Adoption guides',
        },
      },
    }

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain("Registry 'knowledge' source path does not exist")
    expect(result.errors[1]).toContain("Registry 'adoption' source path does not exist")
  })
})

describe('validatePackageStructure - empty directory', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should fail when registry directory is empty', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
      },
    }

    await fsService.mkdir(`${projectRoot}/.pair/knowledge`, { recursive: true })

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'knowledge' directory is empty")
  })
})

describe('validatePackageStructure - all empty dirs', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should fail when all registries are empty', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          target_path: '.pair/adoption',
          description: 'Adoption guides',
        },
      },
    }

    await fsService.mkdir(`${projectRoot}/.pair/knowledge`, { recursive: true })
    await fsService.mkdir(`${projectRoot}/.pair/adoption`, { recursive: true })

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors).toContain("Registry 'knowledge' directory is empty")
    expect(result.errors).toContain("Registry 'adoption' directory is empty")
  })
})

describe('validatePackageStructure - malformed config', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should fail when config has no asset_registries', async () => {
    const config = {} as Config

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must have asset_registries')
  })

  it('should fail when registry has no source field', async () => {
    const config = {
      asset_registries: {
        knowledge: {
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
      },
    } as Config

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain("Registry 'knowledge' missing required field: source")
  })
})

describe('validatePackageStructure - valid non-empty', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should pass when all registries exist and are non-empty', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          behavior: 'mirror',
          target_path: '.pair/knowledge',
          description: 'Knowledge base',
        },
        adoption: {
          source: '.pair/adoption',
          behavior: 'add',
          target_path: '.pair/adoption',
          description: 'Adoption guides',
        },
      },
    }

    await fsService.mkdir(`${projectRoot}/.pair/knowledge`, { recursive: true })
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/file1.md`, 'content1')
    await fsService.writeFile(`${projectRoot}/.pair/knowledge/file2.md`, 'content2')
    await fsService.mkdir(`${projectRoot}/.pair/adoption`, { recursive: true })
    await fsService.writeFile(`${projectRoot}/.pair/adoption/guide.md`, 'guide content')

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('validatePackageStructure - file registry', () => {
  let fsService: InMemoryFileSystemService
  const projectRoot = '/test/project'

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/', projectRoot)
  })

  it('should handle file-based registries (AGENTS.md)', async () => {
    const config: Config = {
      asset_registries: {
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          target_path: 'AGENTS.md',
          description: 'AI agents guidance',
        },
      },
    }

    await fsService.writeFile(`${projectRoot}/AGENTS.md`, '# Agents guide')

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

describe('validatePackageStructure - error detection', () => {
  let fsService: InMemoryFileSystemService

  beforeEach(() => {
    fsService = new InMemoryFileSystemService({}, '/test-module', '/test-project')
  })

  it('detects missing .pair directory', async () => {
    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          target_path: '.pair-knowledge',
          behavior: 'mirror',
          description: 'KB',
        },
      },
    }

    const result = await validatePackageStructure(config, '/test-project', fsService)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('source path does not exist')
    expect(result.errors[0]).toContain('.pair/knowledge')
  })

  it('detects empty registry directories', async () => {
    const projectRoot = '/test-project'
    await fsService.mkdir(`${projectRoot}/.pair/knowledge`, { recursive: true })

    const config: Config = {
      asset_registries: {
        knowledge: {
          source: '.pair/knowledge',
          target_path: '.pair-knowledge',
          behavior: 'mirror',
          description: 'KB',
        },
      },
    }

    const result = await validatePackageStructure(config, projectRoot, fsService)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('directory is empty')
    expect(result.errors[0]).toContain('knowledge')
  })
})
