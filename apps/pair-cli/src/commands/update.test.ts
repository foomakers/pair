import { describe, it, expect } from 'vitest'
import * as updateCmd from './update'
import type { LogEntry } from './command-utils'
import {
  DEFAULT_CONFIG,
  GITHUB_ONLY_CONFIG,
  GITHUB_KNOWLEDGE_CONFIG,
  createTestFs,
} from '../test-utils/test-helpers'

const realCwd = '/development/path/pair/apps/pair-cli'

describe('updateCommand defaults tests', () => {
  it('update with defaults uses config registries', async () => {
    const datasetRoot = realCwd + '/dataset'
    const fs = createTestFs(
      DEFAULT_CONFIG,
      {
        [`${datasetRoot}/.github/workflows/ci.yml`]: 'workflow content',
        [`${datasetRoot}/.pair/knowledge/knowledge.md`]: 'knowledge content',
        [`${datasetRoot}/.pair/adoption/guide.md`]: 'adoption content',
      },
      realCwd,
    )

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result!.success).toBe(true)

    // Verify files were copied to correct locations
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')
    expect(await fs.readFile('.pair-knowledge/knowledge.md')).toBe('knowledge content')
    expect(await fs.readFile('.pair-adoption/guide.md')).toBe('adoption content')
  })
})

describe('updateCommand overrides and flags tests', () => {
  it('update with registry override', async () => {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })
    expect(result!.success).toBe(true)

    // Verify only github registry was updated
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')
    expect(await fs.exists('.pair-knowledge/knowledge.md')).toBe(false)
  })

  it('update with multiple registry overrides', async () => {
    const fs = createTestFs(
      GITHUB_KNOWLEDGE_CONFIG,
      {
        [`${realCwd}/dataset/.github/workflows/ci.yml`]: 'workflow content',
        [`${realCwd}/dataset/.pair/knowledge/knowledge.md`]: 'knowledge content',
        [`${realCwd}/.github/workflows/ci.yml`]: 'original workflow content',
        [`${realCwd}/.pair-knowledge/knowledge.md`]: 'original knowledge content',
      },
      realCwd,
    )

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: 'dataset',
      useDefaults: true,
    })
    expect(result!.success).toBe(true)

    // Verify both registries were updated
    expect(await fs.readFile(`${realCwd}/.github/workflows/ci.yml`)).toBe('workflow content')
    expect(await fs.readFile(`${realCwd}/.pair-knowledge/knowledge.md`)).toBe('knowledge content')
  })
})

describe('updateCommand - dry run', () => {
  it('dry-run with defaults does not write files', async () => {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    // dryRun CLI option removed; call without dryRun
    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })
    expect(result!.success).toBe(true)

    // Verify file was actually copied (since dry-run was removed)
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('workflow content')
  })
})

describe('updateCommand - verbose logging', () => {
  it('verbose returns logs (presence)', async () => {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    // verbose CLI option removed; logs are still returned via result.logs
    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })

    expect(result!.success).toBe(true)
  })

  it('verbose returns logs (content check)', async () => {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot: fs.currentWorkingDirectory(),
      useDefaults: true,
    })

    expect(result!.success).toBe(true)
    const logs = (result as { logs?: LogEntry[] }).logs ?? []
    expect(logs).toBeDefined()
    expect(logs.some((log: LogEntry) => log.message?.includes('Starting updateWithDefaults'))).toBe(
      true,
    )
  })
})

describe('updateCommand - error cases', () => {
  it('fails if target directory does not exist', async () => {
    const fs = createTestFs(
      GITHUB_ONLY_CONFIG,
      {
        [`${realCwd}/.github/workflows/ci.yml`]: 'workflow content',
      },
      realCwd,
    )

    const result = await updateCmd.updateCommand(fs, ['--target', '/nonexistent/target'], {
      datasetRoot: fs.currentWorkingDirectory(),
    })

    expect(result!.success).toBe(false)
    expect(result!.message).toContain("Target directory '/nonexistent/target' does not exist")
  })
})

describe('updateCommand - root file update', () => {
  it('update overwrites existing root file like AGENTS.md in project root', async () => {
    const datasetRoot = `${realCwd}/dataset`
    const fs = setupAgentsFs(datasetRoot, 'updated agents content', true)

    // Verify it exists with original content
    expect(await fs.readFile('AGENTS.md')).toBe('original content')

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    // Verify AGENTS.md now has updated content from dataset
    expect(await fs.readFile('AGENTS.md')).toBe('updated agents content')
  })

  it('update creates root file like AGENTS.md in project root when it does not exist', async () => {
    const datasetRoot = `${realCwd}/dataset`
    const fs = setupAgentsFs(datasetRoot, 'agents content', false)

    // Verify AGENTS.md does not exist in project root before update
    expect(await fs.exists('AGENTS.md')).toBe(false)

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result).toBeDefined()
    expect(result!.success).toBe(true)

    // Verify AGENTS.md now exists in project root with correct content
    expect(await fs.readFile('AGENTS.md')).toBe('agents content')
  })
})
const setupAgentsFs = (datasetRoot: string, content: string, withExistingFile = false) => {
  const fs = createTestFs(
    {
      asset_registries: {
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror' as const,
          target_path: 'AGENTS.md',
          description: 'AI agents guidance and session context',
        },
      },
    },
    {
      [`${datasetRoot}/AGENTS.md`]: content,
    },
    realCwd,
  )

  if (withExistingFile) {
    fs.writeFile('AGENTS.md', 'original content')
  }

  return fs
}

const setupBackupTestFs = (datasetRoot: string, newContent = 'new workflow') => {
  const fs = createTestFs(
    {
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'additive' as const,
          target_path: '.github',
          description: 'GitHub Actions workflows',
        },
      },
    },
    {
      [`${datasetRoot}/.github/workflows/ci.yml`]: newContent,
    },
    realCwd,
  )
  fs.writeFile('.github/workflows/ci.yml', 'existing workflow')
  return fs
}

const setupMultiRegistryFs = (datasetRoot: string) => {
  const fs = createTestFs(
    {
      asset_registries: {
        github: {
          source: '.github',
          behavior: 'additive' as const,
          target_path: '.github',
          description: 'GitHub Actions',
        },
        docs: {
          source: 'docs',
          behavior: 'mirror' as const,
          target_path: 'documentation',
          description: 'Documentation',
        },
      },
    },
    {
      [`${datasetRoot}/.github/workflows/ci.yml`]: 'workflow',
      [`${datasetRoot}/docs/README.md`]: 'readme',
    },
    realCwd,
  )
  fs.writeFile('.github/workflows/ci.yml', 'old workflow')
  fs.writeFile('documentation/README.md', 'old readme')
  return fs
}

describe('updateCommand - backup behavior', () => {
  it('creates backup during update and deletes after success (default persistBackup=false)', async () => {
    const datasetRoot = `${realCwd}/dataset`
    const fs = setupBackupTestFs(datasetRoot)

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
    })

    expect(result!.success).toBe(true)

    const backupDirExistsAfter = await fs.exists('.pair/backups')
    if (backupDirExistsAfter) {
      const backupsAfter = await fs.readdir('.pair/backups')
      expect(backupsAfter.map(e => e.name)).toEqual([])
    }

    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('new workflow')
  })
})

describe('updateCommand - backup persistence', () => {
  it('keeps backup after success when persistBackup=true', async () => {
    const datasetRoot = `${realCwd}/dataset`
    const fs = setupBackupTestFs(datasetRoot)

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
      persistBackup: true,
    })

    expect(result!.success).toBe(true)

    const backupDirExists = await fs.exists('.pair/backups')
    expect(backupDirExists).toBe(true)

    const backupEntries = await fs.readdir('.pair/backups')
    const backups = backupEntries.map(e => e.name)
    expect(backups.length).toBeGreaterThan(0)

    const sessionFolder = backups.find((name: string) => name.startsWith('root-'))
    expect(sessionFolder).toBeDefined()

    const backupContents = (await fs.readdir(`.pair/backups/${sessionFolder}`)).map(e => e.name)
    expect(backupContents).toContain('.github')

    const backedUpContent = await fs.readFile(
      `.pair/backups/${sessionFolder}/.github/workflows/ci.yml`,
    )
    expect(backedUpContent).toBe('existing workflow')
    expect(await fs.readFile('.github/workflows/ci.yml')).toBe('new workflow')
  })
})

describe('updateCommand - backup multi-registry', () => {
  it('backup contains all registries when updating all registries', async () => {
    const datasetRoot = `${realCwd}/dataset`
    const fs = setupMultiRegistryFs(datasetRoot)

    const result = await updateCmd.updateCommand(fs, [], {
      datasetRoot,
      useDefaults: true,
      persistBackup: true,
    })

    expect(result!.success).toBe(true)

    const backups = (await fs.readdir('.pair/backups')).map(e => e.name)
    const sessionFolder = backups.find((name: string) => name.startsWith('root-'))
    expect(sessionFolder).toBeDefined()
    const backupContents = (await fs.readdir(`.pair/backups/${sessionFolder}`)).map(e => e.name)

    expect(backupContents).toContain('.github')
    expect(backupContents).toContain('documentation')

    expect(await fs.readFile(`.pair/backups/${sessionFolder}/.github/workflows/ci.yml`)).toBe(
      'old workflow',
    )
    expect(await fs.readFile(`.pair/backups/${sessionFolder}/documentation/README.md`)).toBe(
      'old readme',
    )
  })
})
