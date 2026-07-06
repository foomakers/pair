import { describe, expect, test } from 'vitest'
import { handleUpdateCommand } from './handler'
import type { UpdateCommandConfig } from './parser'
import { handleInstallCommand } from '../install/handler'
import type { InstallCommandConfig } from '../install/parser'
import { InMemoryFileSystemService, MockHttpClientService } from '@pair/content-ops'

/**
 * #238: Skill install — flatten + prefix + cross-reference rewriting from
 * nested dataset.
 *
 * These fixtures cover what the underlying "skillNameMap propagation" bug
 * fixes (see the `KB distribution pipeline — bug regression` describe in
 * handler.test.ts) did not: idempotency of the whole install/update
 * pipeline across repeated runs and across a prefix change (AC4), and the
 * same pipeline applying identically to an external KB installed via
 * `--source` (AC5).
 */
describe('#238: idempotent skill name registry (manifest-backed)', () => {
  const moduleDir = '/project'
  const datasetSrc = `${moduleDir}/packages/knowledge-hub/dataset`

  function skillsAgentsConfig(prefix: string) {
    return {
      asset_registries: {
        skills: {
          source: '.skills',
          behavior: 'mirror',
          flatten: true,
          prefix,
          description: 'Agent skills',
          targets: [{ path: '.claude/skills/', mode: 'canonical' }],
        },
        agents: {
          source: 'AGENTS.md',
          behavior: 'mirror',
          description: 'AI agents guidance',
          targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
        },
      },
    }
  }

  function seedFs(prefix: string) {
    return new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify(skillsAgentsConfig(prefix)),
        [`${datasetSrc}/.skills/process/next/SKILL.md`]:
          '---\nname: next\n---\n# /next\n\nComposes /verify-quality.\n',
        [`${datasetSrc}/.skills/capability/verify-quality/SKILL.md`]:
          '---\nname: verify-quality\n---\n# /verify-quality\n',
        [`${datasetSrc}/AGENTS.md`]: '# AGENTS\n\nRun /next to get started.\n',
      },
      moduleDir,
      moduleDir,
    )
  }

  test('AC4: install -> update -> update produces byte-identical skill, AGENTS.md and manifest content', async () => {
    const fs = seedFs('pair')
    const httpClient = new MockHttpClientService()

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleInstallCommand(installConfig, fs, { httpClient })

    const skillPath = `${moduleDir}/.claude/skills/pair-process-next/SKILL.md`
    const agentsPath = `${moduleDir}/AGENTS.md`
    const manifestPath = `${moduleDir}/.pair/.skill-name-map.json`

    const afterInstall = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }

    // Sanity: rewriting actually happened
    expect(afterInstall.agents).toContain('/pair-process-next')
    expect(afterInstall.manifest).toContain('pair-process-next')

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await handleUpdateCommand(updateConfig, fs, { httpClient, persistBackup: false })
    const afterUpdate1 = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }
    expect(afterUpdate1).toEqual(afterInstall)

    await handleUpdateCommand(updateConfig, fs, { httpClient, persistBackup: false })
    const afterUpdate2 = {
      skill: await fs.readFile(skillPath),
      agents: await fs.readFile(agentsPath),
      manifest: await fs.readFile(manifestPath),
    }
    expect(afterUpdate2).toEqual(afterUpdate1)
  })

  test('AC4 edge case: prefix change removes the old flattened dir and rewrites already-installed references recorded in the manifest', async () => {
    // Simulates the state left behind by a previous install/update run with
    // prefix "pair": the manifest, the flattened skill dir, and a stale
    // reference baked into an `add`-behavior adoption doc that is never
    // re-derived from source (so it can only be fixed via the recorded
    // mapping, not by re-copying).
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'foo', // prefix changed from "pair" to "foo"
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
            adoption: {
              source: 'adoption',
              behavior: 'add', // never re-copied once a file exists at target
              description: 'Adoption doc',
              targets: [{ path: '.pair/adoption/', mode: 'canonical' }],
            },
          },
        }),
        [`${datasetSrc}/.skills/process/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
        [`${datasetSrc}/adoption/ADOPTED.md`]:
          '# fresh adoption doc (never used — target pre-exists)\n',
        // Previous run's leftovers:
        [`${moduleDir}/.pair/.skill-name-map.json`]: JSON.stringify({
          version: 1,
          skills: { next: 'pair-process-next' },
        }),
        [`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`]:
          '---\nname: pair-process-next\n---\n# /pair-process-next\n',
        [`${moduleDir}/.pair/adoption/ADOPTED.md`]: 'Use /pair-process-next for planning.\n',
      },
      moduleDir,
      moduleDir,
    )

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleUpdateCommand(updateConfig, fs, { persistBackup: false })

    // Old prefixed directory is gone, new one exists
    await expect(
      fs.exists(`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`),
    ).resolves.toBe(false)
    await expect(fs.exists(`${moduleDir}/.claude/skills/foo-process-next/SKILL.md`)).resolves.toBe(
      true,
    )

    // The `add`-behavior file was never re-copied, but its stale reference
    // is rewritten via the recorded previous mapping.
    const adoptionContent = await fs.readFile(`${moduleDir}/.pair/adoption/ADOPTED.md`)
    expect(adoptionContent).toBe('Use /foo-process-next for planning.\n')

    // Manifest reflects the new mapping for the next run
    const manifest = JSON.parse(await fs.readFile(`${moduleDir}/.pair/.skill-name-map.json`))
    expect(manifest.skills.next).toBe('foo-process-next')
  })

  test('AC4 edge case: a reference to a removed skill is left as-is (not rewritten, not deleted)', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'pair',
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
            adoption: {
              source: 'adoption',
              behavior: 'add',
              description: 'Adoption doc',
              targets: [{ path: '.pair/adoption/', mode: 'canonical' }],
            },
          },
        }),
        // "oldskill" no longer exists in the source dataset — only "next" remains
        [`${datasetSrc}/.skills/process/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
        [`${datasetSrc}/adoption/ADOPTED.md`]:
          '# fresh adoption doc (never used — target pre-exists)\n',
        [`${moduleDir}/.pair/.skill-name-map.json`]: JSON.stringify({
          version: 1,
          skills: { next: 'pair-process-next', oldskill: 'pair-capability-oldskill' },
        }),
        [`${moduleDir}/.claude/skills/pair-process-next/SKILL.md`]:
          '---\nname: pair-process-next\n---\n# /pair-process-next\n',
        [`${moduleDir}/.pair/adoption/ADOPTED.md`]:
          'Use /pair-capability-oldskill for the legacy flow.\n',
      },
      moduleDir,
      moduleDir,
    )

    const updateConfig: UpdateCommandConfig = {
      command: 'update',
      resolution: 'default',
      kb: true,
      offline: false,
    }
    await handleUpdateCommand(updateConfig, fs, { persistBackup: false })

    // Left exactly as-is — there is no correct new name to rewrite it to
    const adoptionContent = await fs.readFile(`${moduleDir}/.pair/adoption/ADOPTED.md`)
    expect(adoptionContent).toBe('Use /pair-capability-oldskill for the legacy flow.\n')

    // The removed skill's own installed dir is gone (mirror cleanup)
    await expect(
      fs.exists(`${moduleDir}/.claude/skills/pair-capability-oldskill/SKILL.md`),
    ).resolves.toBe(false)
  })

  test('AC5: external KB installed via local --source path applies the same flatten/prefix/rewrite pipeline', async () => {
    const externalKbPath = '/external/kb'
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              prefix: 'ext',
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
            agents: {
              source: 'AGENTS.md',
              behavior: 'mirror',
              description: 'AI agents guidance',
              targets: [{ path: 'AGENTS.md', mode: 'canonical' }],
            },
          },
        }),
        // Minimal nested external KB — standard `.skills/<type>/<name>/` layout
        [`${externalKbPath}/AGENTS.md`]: '# AGENTS\n\nRun /next for the external KB.\n',
        [`${externalKbPath}/.skills/catalog/next/SKILL.md`]: '---\nname: next\n---\n# /next\n',
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'local',
      path: externalKbPath,
      offline: true,
      kb: true,
    }
    await handleInstallCommand(installConfig, fs)

    // Flattened + prefixed exactly like the official dataset pipeline
    await expect(
      fs.exists(`${moduleDir}/.claude/skills/ext-catalog-next/SKILL.md`),
    ).resolves.toBe(true)
    const skillContent = await fs.readFile(`${moduleDir}/.claude/skills/ext-catalog-next/SKILL.md`)
    expect(skillContent).toContain('name: ext-catalog-next')

    // Cross-registry rewrite applied without any source-side restructuring
    const agentsContent = await fs.readFile(`${moduleDir}/AGENTS.md`)
    expect(agentsContent).toContain('/ext-catalog-next')
  })

  test('name collision after flattening fails install with an explicit error', async () => {
    const fs = new InMemoryFileSystemService(
      {
        [`${moduleDir}/package.json`]: JSON.stringify({
          name: 'test-project',
          version: '0.1.0',
        }),
        [`${moduleDir}/packages/knowledge-hub/package.json`]: JSON.stringify({
          name: '@pair/knowledge-hub',
        }),
        [`${moduleDir}/config.json`]: JSON.stringify({
          asset_registries: {
            skills: {
              source: '.skills',
              behavior: 'mirror',
              flatten: true,
              description: 'Agent skills',
              targets: [{ path: '.claude/skills/', mode: 'canonical' }],
            },
          },
        }),
        // Two distinct source paths that flatten to the same target name
        [`${datasetSrc}/.skills/a/b/SKILL.md`]: '# Skill 1',
        [`${datasetSrc}/.skills/a-b/SKILL.md`]: '# Skill 2',
      },
      moduleDir,
      moduleDir,
    )

    const installConfig: InstallCommandConfig = {
      command: 'install',
      resolution: 'default',
      kb: true,
      offline: false,
    }

    await expect(handleInstallCommand(installConfig, fs)).rejects.toThrow(/collision/i)
  })
})
