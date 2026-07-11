import { describe, it, expect } from 'vitest'
import { InMemoryFileSystemService } from '@pair/content-ops/test-utils/in-memory-fs'
import { installCommand, handleUpdateCommand, handleUpdateLinkCommand } from './commands'

describe('pair-cli e2e - install from local sources', () => {
  describe('install from local ZIP', () => {
    it('installs from absolute path ZIP', async () => {
      const cwd = '/test-absolute-zip'
      const zipPath = 'kb.zip'

      // Create filesystem with ZIP file (simulated as binary content)
      const seed: Record<string, string> = {}
      seed['/test-absolute-zip/kb.zip'] =
        'PK\x03\x04\x14\x00\x00\x00\x00\x00\x8d\x8f\x8bN\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0e\x00\x00\x00AGENTS.mdthis is agents.md' // Minimal ZIP content
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', zipPath], { useDefaults: true })
    })

    it('installs from relative path ZIP', async () => {
      const cwd = '/test-relative-zip'
      const zipPath = './downloads/kb.zip'

      const seed: Record<string, string> = {}
      seed['/test-relative-zip/downloads/kb.zip'] =
        'PK\x03\x04\x14\x00\x00\x00\x00\x00\x8d\x8f\x8bN\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0e\x00\x00\x00AGENTS.mdthis is agents.md'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', zipPath], { useDefaults: true })
    })
  })

  describe('install from local directory', () => {
    it('installs from absolute path directory', async () => {
      const cwd = '/test-absolute-dir'
      const dirPath = 'dataset'

      const seed: Record<string, string> = {}
      seed[`${cwd}/${dirPath}/AGENTS.md`] = 'this is agents.md'
      seed[`${cwd}/${dirPath}/.pair/knowledge/index.md`] = '# Knowledge Base'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', dirPath], { useDefaults: true })
    })

    it('installs from relative path directory', async () => {
      const cwd = '/test-relative-dir'
      const dirPath = './dataset'

      const seed: Record<string, string> = {}
      seed['/test-relative-dir/dataset/AGENTS.md'] = 'this is agents.md'
      seed['/test-relative-dir/dataset/.pair/knowledge/index.md'] = '# Knowledge Base'
      seed[`${cwd}/config.json`] = JSON.stringify({
        asset_registries: {
          github: {
            source: '.github',
            behavior: 'mirror',
            include: ['/agents', '/prompts'],
            targets: [{ path: '.github', mode: 'canonical' }],
            description: 'GitHub workflows and configuration files',
          },
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: '.pair/knowledge', mode: 'canonical' }],
            description: 'Knowledge base and documentation',
          },
          adoption: {
            source: '.pair/adoption',
            behavior: 'add',
            targets: [{ path: '.pair/adoption', mode: 'canonical' }],
            description: 'Adoption guides and onboarding materials',
          },
          agents: {
            source: 'AGENTS.md',
            behavior: 'add',
            targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            description: 'AI agents guidance and session context',
          },
        },
      })

      const fs = new InMemoryFileSystemService(seed, cwd, cwd)

      await installCommand(fs, ['--source', dirPath], { useDefaults: true })
    })
  })
})

describe('pair-cli e2e - disjoint installation (source and target disjoint)', () => {
  it('installs KB to a disjoint absolute path', async () => {
    const projectRoot = '/test-project'
    const disjointTarget = '/opt/pair/kb'
    const kbSourceDir = '/mnt/external/kb-dataset'

    // 1. Setup Filesystem
    const seed: Record<string, string> = {
      // Configuration in the "project root"
      [`${projectRoot}/config.json`]: JSON.stringify({
        asset_registries: {
          knowledge: {
            source: '.pair/knowledge',
            behavior: 'mirror',
            targets: [{ path: 'knowledge', mode: 'canonical' }],
            description: 'Core knowledge',
          },
        },
      }),
      [`${projectRoot}/package.json`]: JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
      }),
      // KB Source content in a disjoint directory
      [`${kbSourceDir}/AGENTS.md`]: '# KB source marker',
      [`${kbSourceDir}/knowledge/index.md`]: '# Knowledge Index',
      [`${kbSourceDir}/knowledge/guide.md`]: 'Follow the [Index](./index.md)',
    }

    const fs = new InMemoryFileSystemService(seed, projectRoot, projectRoot)

    // 2. Perform installation to disjoint target
    // pair install /opt/pair/kb --source /mnt/external/kb-dataset
    await installCommand(fs, ['--source', kbSourceDir], {
      baseTarget: disjointTarget,
      useDefaults: true,
    })

    // 3. Verify installation in disjoint target
    // The target path for the 'knowledge' registry should be /opt/pair/kb/knowledge
    const installedFile = `${disjointTarget}/knowledge/index.md`
    expect(fs.existsSync(installedFile)).toBe(true)
    expect(fs.readFileSync(installedFile)).toBe('# Knowledge Index')

    // 4. Test disjoint update
    // Add new file to source
    await fs.writeFile(`${kbSourceDir}/knowledge/new.md`, 'New content')

    // pair update /opt/pair/kb --source /mnt/external/kb-dataset
    await handleUpdateCommand(
      {
        command: 'update',
        resolution: 'local',
        path: kbSourceDir,
        kb: true,
        offline: true,
        target: disjointTarget,
      },
      fs,
    )

    expect(fs.existsSync(`${disjointTarget}/knowledge/new.md`)).toBe(true)

    // 5. Test disjoint update-link
    // pair update-link /opt/pair/kb
    await handleUpdateLinkCommand(
      {
        command: 'update-link',
        target: disjointTarget,
        dryRun: false,
        logLevel: 'debug',
      },
      fs,
    )

    // Verify rollback setup is working even in disjoint paths (implicitly tested by logic running)
    const installedGuide = `${disjointTarget}/knowledge/guide.md`
    expect(fs.existsSync(installedGuide)).toBe(true)
  })
})
