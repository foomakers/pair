import { describe, it, expect } from 'vitest'
import { installCommand } from './install'
import type { FileSystemService } from '@pair/content-ops/file-system'
import {
  GITHUB_ONLY_CONFIG,
  GITHUB_KNOWLEDGE_CONFIG,
  OVERLAPPING_CONFIG,
  CLEAN_CONFIG,
  createTestFs,
} from '../test-utils/test-helpers'

const realCwd = '/development/path/pair/apps/pair-cli'

const TEST_DEFAULT_CONFIG = {
  asset_registries: {
    github: {
      source: '.github',
      behavior: 'mirror' as const,
      include: ['/agents', '/workflows'],
      target_path: '.github-copy',
      description: 'GitHub workflows and configuration files',
    },
    knowledge: {
      source: '.pair/knowledge',
      behavior: 'mirror' as const,
      target_path: '.pair-knowledge',
      description: 'Knowledge base and documentation',
    },
    adoption: {
      source: '.pair/adoption',
      behavior: 'add' as const,
      target_path: '.pair-adoption',
      description: 'Adoption guides and onboarding materials',
    },
  },
}

describe('installCommand new functionality tests', function () {
  it('install with defaults uses config registries', async function () {
    const datasetRoot = `${realCwd}/node_modules/knowledge-hub/dataset`
    const fs = createTestFs(
      TEST_DEFAULT_CONFIG,
      {
        [`${datasetRoot}/.github/workflows/ci.yml`]: 'workflow content',
        [`${datasetRoot}/.pair/knowledge/knowledge.md`]: 'knowledge content',
        [`${datasetRoot}/.pair/adoption/guide.md`]: 'adoption content',
      },
      realCwd,
    )

    const result = await installCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })
    expect(result!.success).toBe(true)

    // Verify files were copied to correct locations
    expect(await fs.readFile('.github-copy/workflows/ci.yml')).toBe('workflow content')
    expect(await fs.readFile('.pair-knowledge/knowledge.md')).toBe('knowledge content')
    expect(await fs.readFile('.pair-adoption/guide.md')).toBe('adoption content')
  })

  it('install with registry override', async function () {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    const result = await installCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    // Verify only github registry was installed
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')
    expect(await fs.exists('.pair-knowledge/knowledge.md')).toBe(false)
  })
})

describe('installCommand - multiple registries', function () {
  it('install with multiple registry overrides', async function () {
    const fs = createTestFs(
      GITHUB_KNOWLEDGE_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
        [`${realCwd}/.pair/knowledge/knowledge.md`]: 'knowledge content',
      },
      realCwd,
    )

    const result = await installCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })
    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    // Verify both registries were installed
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')
    expect(await fs.readFile('.pair-knowledge/knowledge.md')).toBe('knowledge content')
  })
})

describe('installCommand - idempotency / existing target', function () {
  it('fails when installing twice to the same existing target', async function () {
    // Simulate a dataset located at /dataset so installs copy into the cwd target
    const datasetRoot = realCwd + '/dataset'
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [datasetRoot + '/.github/workflows/ci.yml']: 'workflow content',
      },
      realCwd,
    )

    // First install should succeed (copy from /dataset into project cwd)
    const first = await installCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })
    expect(first).toBeDefined()
    expect(first!.success).toBe(true)

    // Verify file was copied
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')

    // Second install should return a failure result because destination exists
    const second = await installCommand(fs, [], { datasetRoot: '/dataset', useDefaults: true })
    expect(second).toBeDefined()
    expect(second!.success).toBe(false)
    expect(second!.message).toMatch(/Destination already exists/)
  })
})

describe('installCommand - overlapping targets', function () {
  it('fails when registries have overlapping targets under a base target', async function () {
    // Use a filesystem with minimal dataset and overlapping config
    const fs = createTestFs(
      OVERLAPPING_CONFIG,
      {
        [`${realCwd}/.github/README.md`]: 'x',
      },
      realCwd,
    )

    // Call installCommand as if user ran: install .smoke_test
    const result = await installCommand(fs, ['--target', '.smoke_test'], {
      datasetRoot: fs.currentWorkingDirectory(),
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(false)
    // The CLI should surface a precheck error about overlapping targets
    expect(result!.message).toMatch(/Overlapping registry targets|Conflicting registry targets/)
  })
})

describe('installCommand - clean non-overlapping install', function () {
  it('succeeds when base target is empty and registry targets do not overlap', async function () {
    const fs = createTestFs(
      CLEAN_CONFIG,
      {
        [`${realCwd}/.github/README.md`]: 'gh',
        [`${realCwd}/.pair/knowledge/doc.md`]: 'k',
        [`${realCwd}/.pair/adoption/guide.md`]: 'a',
      },
      realCwd,
    )

    // Use a non-overlapping mocked config (the global mock already uses non-overlapping targets)
    const result = await installCommand(fs, ['--target', '.clean_test'], {
      datasetRoot: fs.currentWorkingDirectory(),
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    await verifyCleanInstall(fs)
  })
})

describe('installCommand - root file installation', function () {
  it('install copies root file like AGENTS.md to project root when it does not exist', async function () {
    const datasetRoot = `${realCwd}/dataset`
    const fs = createTestFs(
      AGENTS_CONFIG,
      {
        [`${datasetRoot}/AGENTS.md`]: 'agents content',
      },
      realCwd,
    )

    // Verify AGENTS.md does not exist in project root before install
    expect(await fs.exists('AGENTS.md')).toBe(false)

    const result = await installCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    // Verify AGENTS.md now exists in project root with correct content
    expect(await fs.readFile('AGENTS.md')).toBe('agents content')
  })
})

describe('installCommand - root file installation (existing target)', function () {
  it('install fails when root file like AGENTS.md already exists in project root', async function () {
    const datasetRoot = `${realCwd}/dataset`
    const fs = createTestFs(
      AGENTS_CONFIG,
      {
        [`${datasetRoot}/AGENTS.md`]: 'new agents content',
      },
      realCwd,
    )

    // Pre-create AGENTS.md in project root
    await fs.writeFile('AGENTS.md', 'existing content')

    const result = await installCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(false)
    expect(result!.message).toContain('Destination already exists')

    // Verify content was not changed
    expect(await fs.readFile('AGENTS.md')).toBe('existing content')
  })
})

async function verifyCleanInstall(fs: FileSystemService) {
  expect(await fs.readFile('.clean_test/.github/README.md')).toBe('gh')
  expect(await fs.readFile('.clean_test/.pair-knowledge/doc.md')).toBe('k')
  expect(await fs.readFile('.clean_test/.pair-adoption/guide.md')).toBe('a')
}

const AGENTS_CONFIG = {
  asset_registries: {
    agents: {
      source: 'AGENTS.md',
      behavior: 'mirror' as const,
      target_path: 'AGENTS.md',
      description: 'AI agents guidance and session context',
    },
  },
}
