import { afterEach, describe, it, expect, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'path'
import { fileSystemService as disk, InMemoryFileSystemService } from '@pair/content-ops'
import type { Config } from '#registry'
import {
  createSkillProbe,
  readInstalledSkill,
  workflowDefaultSkill,
  workflowSkillProbe,
} from './skill-probe'

import { locateCycleScripts } from './cycle-scripts'

const cwd = '/project'

const skillsConfig = (targets: string[], prefix?: string): Config =>
  ({
    asset_registries: {
      skills: {
        source: '.skills',
        behavior: 'overwrite',
        description: 'skills',
        include: [],
        flatten: true,
        ...(prefix && { prefix }),
        targets: targets.map(path => ({ path, mode: 'canonical' as const })),
      },
    },
  }) as unknown as Config

function probe(files: string[], config: Config) {
  const fs = new InMemoryFileSystemService(
    Object.fromEntries(files.map(file => [file, ''])),
    cwd,
    cwd,
  )
  return createSkillProbe(fs, config, cwd)
}

function fakeEngine(engine: 'codex' | 'pi', script: string): string {
  const root = disk.realpathSync(disk.mkdtempSync(join(tmpdir(), 'pair-skill-probe-')))
  vi.stubEnv('PATH', root)
  vi.stubEnv('HOME', join(root, 'home'))
  vi.stubEnv('CODEX_HOME', join(root, 'home/.codex'))
  vi.stubEnv('PI_CODING_AGENT_DIR', join(root, 'home/.pi/agent'))
  const executable = join(root, engine)
  disk.writeFileSync(
    executable,
    `#!${process.execPath}\nconst { createInterface } = require('node:readline');\n${script}`,
  )
  disk.chmodSync(executable, 0o755)
  return root
}

describe('createSkillProbe', () => {
  afterEach(() => vi.unstubAllEnvs())

  // #674 AC-2/AC-3: availability belongs to the engine that will launch the step.
  it.each([
    ['claude', '.claude/skills', '.claude/skills'],
    ['codex', '.agents/skills', '.agents/skills'],
    ['opencode', '.opencode/skills', '.config/opencode/skills'],
    ['pi', '.pi/skills', '.pi/agent/skills'],
  ])('finds project and user skills for %s', (engine, projectDir, userDir) => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/${projectDir}/project-skill/SKILL.md`]: '',
        [`/user/${userDir}/user-skill/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = Reflect.apply(createSkillProbe, undefined, [
      fs,
      skillsConfig([]),
      cwd,
      true,
      engine,
    ])
    expect([exists('project-skill'), exists('user-skill')]).toEqual([true, true])
    expect(exists('missing-skill')).toBe(false)
  })

  it('R764-08 (#674 AC-3): uses the active Claude config directory for personal and plugin skills', () => {
    vi.stubEnv('HOME', '/user')
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/alternate')
    const plugin = '/alternate/plugins/cache/market/example/1.0.0'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.claude/skills/project-skill/SKILL.md`]: '',
        '/user/.claude/skills/stale-skill/SKILL.md': '',
        '/alternate/skills/personal-skill/SKILL.md': '',
        '/alternate/settings.json': JSON.stringify({ enabledPlugins: { 'example@market': true } }),
        '/alternate/plugins/installed_plugins.json': JSON.stringify({
          plugins: { 'example@market': [{ scope: 'user', installPath: plugin }] },
        }),
        [`${plugin}/skills/inspect/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = workflowSkillProbe(fs, skillsConfig([]), cwd, 'claude')
    expect(
      ['project-skill', 'personal-skill', 'example:inspect', 'stale-skill'].map(exists),
    ).toEqual([true, true, true, false])
  })

  // #674 AC-3, R764-03: manifest directories extend the default plugin inventory.
  it.each([
    { skills: './extra-skills/' },
    { skills: ['./extra-skills/', '.'] },
    { skills: './extra-skills/audit' },
  ])('finds qualified Claude plugin skills with manifest paths $skills', ({ skills }) => {
    vi.stubEnv('HOME', '/user')
    const plugin = '/user/.claude/plugins/cache/market/example/1.0.0'
    const fs = new InMemoryFileSystemService(
      {
        '/user/.claude/settings.json': JSON.stringify({
          enabledPlugins: { 'example@market': true },
        }),
        '/user/.claude/plugins/installed_plugins.json': JSON.stringify({
          version: 2,
          plugins: {
            'example@market': [{ scope: 'user', installPath: plugin, version: '1.0.0' }],
          },
        }),
        [`${plugin}/.claude-plugin/plugin.json`]: JSON.stringify({ name: 'example', skills }),
        [`${plugin}/skills/inspect/SKILL.md`]: '',
        [`${plugin}/extra-skills/audit/SKILL.md`]: '',
        [`${plugin}/root-skill/SKILL.md`]: '',
        [`${plugin}/unlisted/hidden/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = Reflect.apply(createSkillProbe, undefined, [
      fs,
      skillsConfig([]),
      cwd,
      true,
      'claude',
    ])
    expect(exists('example:inspect')).toBe(true)
    expect(exists('example:audit')).toBe(true)
    expect(exists('example:root-skill')).toBe(Array.isArray(skills))
    expect(exists('example:hidden')).toBe(false)
  })

  // #674 AC-2/AC-3: project plugin settings apply to the launching project.
  it('finds a Claude plugin enabled by project settings', () => {
    vi.stubEnv('HOME', '/user')
    const plugin = '/user/.claude/plugins/cache/market/example/1.0.0'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.claude/settings.json`]: JSON.stringify({
          enabledPlugins: { 'example@market': true },
        }),
        '/user/.claude/plugins/installed_plugins.json': JSON.stringify({
          version: 2,
          plugins: {
            'example@market': [{ scope: 'project', projectPath: cwd, installPath: plugin }],
          },
        }),
        [`${plugin}/skills/inspect/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'claude')
    expect(exists('example:inspect')).toBe(true)
    expect(exists('example:missing')).toBe(false)
  })

  // OpenCode discovers compatible Claude and agent skills at project and user scope.
  it.each([
    ['.claude/skills', '.claude/skills'],
    ['.agents/skills', '.agents/skills'],
  ])('finds OpenCode compatibility skills in %s', (projectDir, userDir) => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/${projectDir}/project-skill/SKILL.md`]: '',
        [`/user/${userDir}/user-skill/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'opencode')
    expect([exists('project-skill'), exists('user-skill'), exists('missing')]).toEqual([
      true,
      true,
      false,
    ])
  })

  it('does not expose Claude-only skills to Codex', () => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.claude/skills/claude-only/SKILL.md`]: '',
        [`${cwd}/.agents/skills/codex-skill/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(
      fs,
      skillsConfig(['.claude/skills', '.agents/skills']),
      cwd,
      true,
      'codex',
    )
    expect(exists('codex-skill')).toBe(true)
    expect(exists('claude-only')).toBe(false)
  })

  // #674 AC-2/AC-3: configured Pi packages contribute skills; an unlisted package does not.
  it('finds skills from a configured Pi local package', () => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pi/settings.json`]: JSON.stringify({ packages: ['../packages/tools'] }),
        [`${cwd}/packages/tools/package.json`]: JSON.stringify({ name: 'tools' }),
        [`${cwd}/packages/tools/skills/inspect/SKILL.md`]: '',
        [`${cwd}/packages/unlisted/skills/hidden/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'pi')
    expect(exists('hidden')).toBe(false)
    expect(exists('inspect')).toBe(true)
  })

  // #674 AC-2/AC-3: Pi loads configured installed npm and git packages at their managed paths.
  it.each([
    ['npm:@example/tools', '.pi/npm/node_modules/@example/tools'],
    ['git:github.com/example/tools', '.pi/git/github.com/example/tools'],
  ])('finds an installed Pi package from %s', (source, path) => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pi/settings.json`]: JSON.stringify({ packages: [source] }),
        [`${cwd}/${path}/package.json`]: JSON.stringify({ name: 'tools', version: '1.0.0' }),
        [`${cwd}/${path}/skills/inspect/SKILL.md`]: '',
        [`${cwd}/.pi/npm/node_modules/unlisted/skills/hidden/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'pi')
    expect(exists('hidden')).toBe(false)
    expect(exists('inspect')).toBe(true)
  })

  // An explicit empty skills selector disables all skills from a configured package.
  it('ignores Pi package skills disabled by its selector', () => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pi/settings.json`]: JSON.stringify({
          packages: [{ source: '../packages/disabled', skills: [] }, '../packages/active'],
        }),
        [`${cwd}/packages/disabled/skills/hidden/SKILL.md`]: '',
        [`${cwd}/packages/active/skills/inspect/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'pi')
    expect(exists('inspect')).toBe(true)
    expect(exists('hidden')).toBe(false)
  })

  // #674 AC-2/AC-3: Pi applies selectors and resolves versioned Git packages itself.
  it('uses the offline Pi inventory for selected versioned package skills', () => {
    const root = fakeEngine(
      'pi',
      `
      if (!process.argv.includes('--offline') || !process.argv.includes('rpc')) process.exit(1);
      createInterface({ input: process.stdin }).on('line', line => {
        const { id, type } = JSON.parse(line);
        if (type !== 'get_commands') process.exit(1);
        const commands = ['selected', 'good-skill'].map(name => ({
          name: 'skill:' + name, source: 'skill', sourceInfo: { scope: 'project' },
        }));
        commands.push({ name: 'skill:prompt-only', source: 'prompt' });
        console.log(JSON.stringify({ id, type: 'response', command: type, success: true,
          data: { commands } }));
      });
    `,
    )
    try {
      const fs = new InMemoryFileSystemService(
        {
          [`${root}/.pi/settings.json`]: JSON.stringify({
            packages: [
              { source: 'npm:@example/tools@1.2.3', skills: ['skills/selected'] },
              'git:github.com/example/tools@v2.0.0',
            ],
          }),
          [`${root}/.pi/npm/node_modules/@example/tools/skills/selected/SKILL.md`]: '',
          [`${root}/.pi/npm/node_modules/@example/tools/skills/excluded/SKILL.md`]: '',
          [`${root}/.pi/git/github.com/example/tools/skills/good-skill/SKILL.md`]: '',
        },
        root,
        root,
      )
      const exists = createSkillProbe(fs, skillsConfig([]), root, true, 'pi')
      expect(['selected', 'good-skill', 'excluded', 'prompt-only'].map(exists)).toEqual([
        true,
        true,
        false,
        false,
      ])
    } finally {
      disk.rmSync(root, { recursive: true, force: true })
    }
  })

  // #674 AC-2/AC-3: cached Codex plugins must be enabled for the launching project.
  it('finds a skill in an enabled Codex plugin and ignores a disabled plugin', () => {
    vi.stubEnv('HOME', '/user')
    const cache = '/user/.codex/plugins/cache/local-repo'
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.agents/plugins/marketplace.json`]: JSON.stringify({
          name: 'local-repo',
          plugins: [
            {
              name: 'tools',
              source: { source: 'local', path: './plugins/tools' },
              policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
              category: 'Productivity',
            },
            {
              name: 'disabled',
              source: { source: 'local', path: './plugins/disabled' },
              policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
              category: 'Productivity',
            },
          ],
        }),
        [`${cwd}/.codex/config.toml`]:
          '[plugins."tools@local-repo"]\nenabled = true\n[plugins."disabled@local-repo"]\nenabled = false\n',
        [`${cache}/tools/local/plugin.json`]: JSON.stringify({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'tools',
          version: '1.0.0',
        }),
        [`${cache}/tools/local/skills/inspect/SKILL.md`]: '',
        [`${cache}/disabled/local/plugin.json`]: JSON.stringify({
          $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
          name: 'disabled',
          version: '1.0.0',
        }),
        [`${cache}/disabled/local/skills/hidden/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'codex')
    expect(exists('disabled:hidden')).toBe(false)
    expect(exists('tools:inspect')).toBe(true)
  })

  // #674 AC-2/AC-3: Codex loads the active versioned cache of an enabled local plugin.
  it('finds an enabled Codex plugin with a versioned cache', () => {
    vi.stubEnv('HOME', '/user')
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.agents/plugins/marketplace.json`]: JSON.stringify({
          name: 'local-repo',
          plugins: [
            {
              name: 'tools',
              source: { source: 'local', path: './plugins/tools' },
              policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
              category: 'Productivity',
            },
          ],
        }),
        [`${cwd}/.codex/config.toml`]: '[plugins."tools@local-repo"]\nenabled = true\n',
        [`${cwd}/plugins/tools/.codex-plugin/plugin.json`]: JSON.stringify({
          name: 'tools',
          version: '1.2.3',
        }),
        '/user/.codex/plugins/cache/local-repo/tools/1.2.3/.codex-plugin/plugin.json':
          JSON.stringify({ name: 'tools', version: '1.2.3' }),
        '/user/.codex/plugins/cache/local-repo/tools/1.2.3/skills/inspect/SKILL.md': '',
        '/user/.codex/plugins/cache/local-repo/unlisted/1.2.3/skills/hidden/SKILL.md': '',
      },
      cwd,
      cwd,
    )
    const exists = createSkillProbe(fs, skillsConfig([]), cwd, true, 'codex')
    expect(exists('unlisted:hidden')).toBe(false)
    expect(exists('tools:inspect')).toBe(true)
  })

  // #674 AC-2/AC-3: Codex reports exact names from active managed plugins.
  it('uses Codex inventory for the active managed plugin version', () => {
    const root = fakeEngine(
      'codex',
      `
      if (process.argv[2] !== 'app-server') process.exit(1);
      createInterface({ input: process.stdin }).on('line', line => {
        const { id, method, params } = JSON.parse(line);
        if (method === 'initialize') console.log(JSON.stringify({ id, result: {} }));
        if (method !== 'skills/list') return;
        if (!params?.cwds?.includes(process.cwd())) process.exit(1);
        const path = process.env.CODEX_HOME + '/plugins/cache/remote-market/tools/2.0.0/skills/';
        const skills = [
          { name: 'tools:Inspect', path: path + 'Inspect/SKILL.md', enabled: true,
            pluginId: 'tools@remote-market' },
          { name: 'tools:disabled', path: path + 'disabled/SKILL.md', enabled: false,
            pluginId: 'tools@remote-market' },
        ];
        console.log(JSON.stringify({ id, result: { data: [{ cwd: process.cwd(), skills }] } }));
      });
    `,
    )
    try {
      const codexHome = join(root, 'home/.codex')
      const cache = join(codexHome, 'plugins/cache/remote-market/tools')
      const fs = new InMemoryFileSystemService(
        {
          [`${codexHome}/config.toml`]: '[plugins."tools@remote-market"]\nenabled = true\n',
          [`${cache}/2.0.0/skills/Inspect/SKILL.md`]: '',
          [`${cache}/2.0.0/skills/disabled/SKILL.md`]: '',
          [`${cache}/1.0.0/skills/stale/SKILL.md`]: '',
        },
        root,
        root,
      )
      const exists = createSkillProbe(fs, skillsConfig([]), root, true, 'codex')
      expect(
        ['tools:Inspect', 'tools:inspect', 'tools:disabled', 'tools:stale'].map(exists),
      ).toEqual([true, false, false, false])
    } finally {
      disk.rmSync(root, { recursive: true, force: true })
    }
  })

  // #674 AC-2/AC-5, R764-01: a registry target does not add to Codex's inventory.
  it.each(['.claude/skills', 'custom/skills', '.agents/skills'])(
    'rejects a registry-only skill in %s',
    target => {
      const root = fakeEngine(
        'codex',
        `
      createInterface({ input: process.stdin }).on('line', line => {
        const { id, method } = JSON.parse(line);
        if (method === 'initialize') console.log(JSON.stringify({ id, result: {} }));
        if (method === 'skills/list') console.log(JSON.stringify({ id, result: { data: [{
          cwd: process.cwd(), skills: [{ name: 'control', enabled: true }],
        }] } }));
      });
    `,
      )
      try {
        const fs = new InMemoryFileSystemService(
          {
            [`${root}/${target}/registry-only/SKILL.md`]: '',
            [`${root}/.agents/skills/control/SKILL.md`]: '',
          },
          root,
          root,
        )
        const exists = workflowSkillProbe(fs, skillsConfig([target]), root, 'codex')
        expect(exists('control')).toBe(true)
        expect(exists('registry-only')).toBe(false)
      } finally {
        disk.rmSync(root, { recursive: true, force: true })
      }
    },
  )

  it('R754-06: prepares workflow runs with the configured built-in cycle skill', () => {
    const directory = join(cwd, 'team/skills/team-workflow-cycle')
    const fs = new InMemoryFileSystemService({ [join(directory, 'SKILL.md')]: '' }, cwd, cwd)
    expect(locateCycleScripts(fs, skillsConfig(['team/skills'], 'team'), cwd).scriptsDir).toBe(
      join(directory, 'scripts'),
    )
  })

  it('R754-06: uses a legacy install manifest until its recorded skill is removed', () => {
    const old = 'pair-process-refine-story'
    const active = 'team-process-refine-story'
    const directory = `${cwd}/team/skills`
    const fs = new InMemoryFileSystemService(
      {
        [`${cwd}/.pair/.skill-name-map.json`]: JSON.stringify({
          version: 1,
          skills: { 'refine-story': active },
        }),
        [`${directory}/${old}/SKILL.md`]: '',
        [`${directory}/${active}/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    const resolve = workflowDefaultSkill(fs, skillsConfig(['team/skills'], 'pair'), cwd)
    expect(resolve(old)).toBe(active)
    fs.rmSync(`${directory}/${active}/SKILL.md`)
    expect(resolve(old)).toBeUndefined()
  })

  it('finds a prefixed skill under the registry target', () => {
    const isInstalled = probe(
      [`${cwd}/.claude/skills/pair-loop/SKILL.md`],
      skillsConfig(['.claude/skills/'], 'pair'),
    )

    expect(isInstalled('pair-loop')).toBe(true)
    expect(isInstalled('pair-next')).toBe(false)
  })

  it('finds a skill installed under the bare dataset name', () => {
    const isInstalled = probe(
      [`${cwd}/.claude/skills/loop/SKILL.md`],
      skillsConfig(['.claude/skills/'], 'pair'),
    )

    expect(isInstalled('pair-loop')).toBe(true)
  })

  it('probes every declared target, not just the canonical one', () => {
    const isInstalled = probe(
      [`${cwd}/.agents/skills/pair-next/SKILL.md`],
      skillsConfig(['.claude/skills/', '.agents/skills/'], 'pair'),
    )

    expect(isInstalled('pair-next')).toBe(true)
  })

  it('reads a process-step marker from a redirected installed skill (AC-3)', () => {
    const marker = '<!-- process-step: id=refine-story -->'
    const fs = new InMemoryFileSystemService(
      { [`${cwd}/.agents/skills/pair-process-refine-story/SKILL.md`]: marker },
      cwd,
      cwd,
    )
    expect(
      readInstalledSkill(
        fs,
        skillsConfig(['.agents/skills/'], 'pair'),
        cwd,
        'pair-process-refine-story',
      ),
    ).toBe(marker)
    expect(
      readInstalledSkill(fs, skillsConfig(['.agents/skills/'], 'pair'), cwd, '../../../outside'),
    ).toBeUndefined()
  })

  /**
   * Round 7, Major (second half): `existsSync(join(root, target, name, 'SKILL.md'))` answers "is
   * there a file there", which is NOT a containment check — `name` is a path segment, so a
   * traversing name resolves to a real file OUTSIDE the project and the probe says "installed".
   * `--skill` is now `isSafeId`-checked at parse time, but the probe must hold the boundary itself:
   * it is also reachable with the cascade names, and defence belongs where the path is built.
   */
  it('refuses a name that escapes the registry target, even though a SKILL.md exists there', () => {
    // The path is computed, not guessed: `/project/.claude/skills/` + `../../../` lands on `/`, so
    // the traversing name resolves to a REAL file outside the project and `existsSync` says yes.
    const escaping = '../../../outside/pair-next'
    const fs = new InMemoryFileSystemService(
      {
        '/outside/pair-next/SKILL.md': '',
        [`${cwd}/.claude/skills/pair-loop/SKILL.md`]: '',
      },
      cwd,
      cwd,
    )
    expect(fs.existsSync(join(cwd, '.claude/skills/', escaping, 'SKILL.md'))).toBe(true)

    const isInstalled = createSkillProbe(fs, skillsConfig(['.claude/skills/'], 'pair'), cwd)

    expect(isInstalled(escaping)).toBe(false)
    // The legitimate name in the same fixture still resolves.
    expect(isInstalled('pair-loop')).toBe(true)
  })

  it('reports nothing installed when the registry is missing from the config', () => {
    const isInstalled = probe([`${cwd}/.claude/skills/pair-loop/SKILL.md`], {
      asset_registries: {},
    } as unknown as Config)

    // Falls back to the conventional location, which is where this fixture put the skill.
    expect(isInstalled('pair-loop')).toBe(true)
    expect(isInstalled('pair-next')).toBe(false)
  })
})
