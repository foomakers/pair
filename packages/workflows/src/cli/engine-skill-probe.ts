import { basename, isAbsolute, join, resolve } from 'node:path'
import type { RunFiles } from '../engine'
import { inventoryRequest } from '../worktree/inventory-process'
import { isPlainObject } from './project-config'
import { findSkillFile, skillsLayout } from './skill-paths'

function claudeManifestSkillPaths(fs: Pick<RunFiles, 'readFileSync'>, root: string): string[] {
  const skills = readJson(fs, join(root, '.claude-plugin/plugin.json'))['skills']
  const paths: unknown[] = Array.isArray(skills) ? skills : [skills]
  return paths.filter(
    (path): path is string =>
      typeof path === 'string' &&
      (path === '.' || path.startsWith('./')) &&
      !path.split(/[/\\]/).includes('..'),
  )
}

function hasClaudePluginSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  root: string,
  name: string,
): boolean {
  const manifestPaths = claudeManifestSkillPaths(fs, root)
  return (
    findSkillFile(check, root, { targets: ['skills', ...manifestPaths] }, name) !== undefined ||
    manifestPaths.some(path => {
      const directory = resolve(root, path)
      return basename(directory) === name && check(join(directory, 'SKILL.md'))
    })
  )
}

function claudePluginSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  { configDir, root }: { configDir: string; root: string },
  name: string,
): boolean {
  const match = /^([\w-]+):([\w-]+)$/.exec(name)
  if (!match) return false
  const settings = [
    join(configDir, 'settings.json'),
    join(root, '.claude/settings.json'),
    join(root, '.claude/settings.local.json'),
  ]
  const enabled = Object.assign(
    {},
    ...settings.map(path => readJson(fs, path)['enabledPlugins'] ?? {}),
  ) as Record<string, boolean>
  const installed = readJson(fs, join(configDir, 'plugins/installed_plugins.json'))['plugins'] as
    | Record<string, { installPath?: string; scope?: string; projectPath?: string }[]>
    | undefined
  return Object.entries(enabled).some(([id, active]) => {
    if (active !== true || id.split('@')[0] !== match[1]) return false
    const entries = installed?.[id]
    return (
      Array.isArray(entries) &&
      entries.some(
        entry =>
          ((entry.scope !== 'project' && entry.scope !== 'local') || entry.projectPath === root) &&
          typeof entry.installPath === 'string' &&
          hasClaudePluginSkill(fs, check, entry.installPath, match[2]!),
      )
    )
  })
}

function readJson(fs: Pick<RunFiles, 'readFileSync'>, path: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(path))
    return isPlainObject(value) ? value : {}
  } catch {
    return {}
  }
}

function piPackageDirectory(base: string, source: string): string | undefined {
  if (source.startsWith('.') || isAbsolute(source)) return resolve(base, source)
  if (source.startsWith('npm:'))
    return join(base, 'npm/node_modules', source.slice(4).replace(/(?<!^)@[^/]*$/, ''))
  if (source.startsWith('git:')) return join(base, 'git', source.slice(4))
  return undefined
}

function piPackageSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  { root, home }: { root: string; home: string | undefined },
  name: string,
): boolean {
  const settings = [
    join(root, '.pi/settings.json'),
    ...(home ? [join(home, '.pi/agent/settings.json')] : []),
  ]
  return settings.some(file => {
    const packages = readJson(fs, file)['packages']
    if (!Array.isArray(packages)) return false
    return packages.some((entry: unknown) => {
      const source =
        typeof entry === 'string' ? entry : (entry as Record<string, unknown> | null)?.['source']
      const selector =
        typeof entry === 'object' && entry !== null
          ? (entry as Record<string, unknown>)['skills']
          : undefined
      if (Array.isArray(selector) && selector.length === 0) return false
      if (typeof source !== 'string') return false
      const directory = piPackageDirectory(resolve(file, '..'), source)
      return (
        directory !== undefined &&
        findSkillFile(check, directory, { targets: ['skills'] }, name) !== undefined
      )
    })
  })
}

function codexPluginEnabled(
  fs: Pick<RunFiles, 'readFileSync'>,
  files: string[],
  id: string,
): boolean {
  let enabled = false
  for (const file of files) {
    let config: string
    try {
      config = fs.readFileSync(file)
    } catch {
      continue
    }
    let section = ''
    for (const line of config.split(/\r?\n/)) {
      const header = /^\s*\[plugins\."([^"\n]+)"\]\s*(?:#.*)?$/.exec(line)
      if (header) {
        section = header[1]!
        continue
      }
      if (/^\s*\[/.test(line)) {
        section = ''
        continue
      }
      const value = /^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/.exec(line)
      if (section === id && value) enabled = value[1] === 'true'
    }
  }
  return enabled
}

function codexCacheVersion(
  fs: Pick<RunFiles, 'readFileSync'>,
  root: string,
  sourcePath: unknown,
): string {
  if (typeof sourcePath !== 'string') return 'local'
  const version = readJson(fs, join(root, sourcePath, '.codex-plugin/plugin.json'))['version']
  return typeof version === 'string' ? version : 'local'
}

function codexPluginSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  { root, home }: { root: string; home: string },
  name: string,
): boolean {
  const match = /^([\w-]+):([\w-]+)$/.exec(name)
  if (!match) return false
  const marketplace = readJson(fs, join(root, '.agents/plugins/marketplace.json'))
  if (typeof marketplace['name'] !== 'string' || !Array.isArray(marketplace['plugins']))
    return false
  const plugin = marketplace['plugins'].find(
    (item: Record<string, unknown>) => item['name'] === match[1],
  )
  if (!plugin || plugin['source']?.['source'] !== 'local') return false
  const id = `${match[1]}@${marketplace['name']}`
  const enabled = codexPluginEnabled(
    fs,
    [join(home, '.codex/config.toml'), join(root, '.codex/config.toml')],
    id,
  )
  const version = codexCacheVersion(fs, root, plugin['source']?.['path'])
  const cache = join(home, '.codex/plugins/cache', marketplace['name'], match[1]!, version)
  return enabled && findSkillFile(check, cache, { targets: ['skills'] }, match[2]!) !== undefined
}

function packageSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  context: { root: string; home: string | undefined; engine: string },
  name: string,
): boolean {
  const { root, home, engine } = context
  if (engine === 'pi') return piPackageSkill(fs, check, { root, home }, name)
  if (!home) return false
  if (engine === 'codex') return codexPluginSkill(fs, check, { root, home }, name)
  return false
}

type SkillRunner = { command: string; runnerArgs?: readonly string[] | undefined }

function codexSkills(root: string, runner: SkillRunner): Set<string> | undefined {
  const reply = inventoryRequest(
    root,
    runner.command,
    [...(runner.runnerArgs ?? []), 'app-server', '--listen', 'stdio://'],
    [
      { id: 1, method: 'initialize', params: { clientInfo: { name: 'pair', version: '1' } } },
      { method: 'initialized' },
      { id: 2, method: 'skills/list', params: { cwds: [root] } },
    ],
  )
  const result = isPlainObject(reply) ? reply['result'] : undefined
  const data = isPlainObject(result) ? result['data'] : undefined
  if (!Array.isArray(data)) return undefined
  return new Set(
    data.flatMap(entry => {
      const skills = isPlainObject(entry) ? entry['skills'] : undefined
      return Array.isArray(skills)
        ? skills.flatMap(skill =>
            isPlainObject(skill) && skill['enabled'] === true && typeof skill['name'] === 'string'
              ? [skill['name']]
              : [],
          )
        : []
    }),
  )
}

function piSkills(root: string, runner: SkillRunner): Set<string> | undefined {
  const reply = inventoryRequest(
    root,
    runner.command,
    [...(runner.runnerArgs ?? []), '--offline', '--mode', 'rpc', '--no-session', '--no-extensions'],
    [{ id: 'skills', type: 'get_commands' }],
  )
  if (!isPlainObject(reply) || reply['type'] !== 'response' || reply['success'] !== true)
    return undefined
  const data = reply['data']
  const commands = isPlainObject(data) ? data['commands'] : undefined
  if (!Array.isArray(commands)) return undefined
  return new Set(
    commands.flatMap(command => {
      if (!isPlainObject(command) || command['source'] !== 'skill') return []
      const name = command['name']
      return typeof name === 'string' && name.startsWith('skill:') ? [name.slice(6)] : []
    }),
  )
}

function cachedNativeSkill(
  root: string,
  engine: string,
  runner: SkillRunner = { command: engine },
) {
  const list = engine === 'codex' ? codexSkills : engine === 'pi' ? piSkills : undefined
  let inventory: Set<string> | undefined | null = null
  return (name: string) => {
    if (inventory === null) inventory = list?.(root, runner)
    return inventory?.has(name)
  }
}

const skillDirectories = new Map<string, [string[], string[]]>([
  ['claude', [['.claude/skills'], ['skills']]],
  ['codex', [['.agents/skills'], ['.agents/skills']]],
  [
    'opencode',
    [
      ['.opencode/skills', '.claude/skills', '.agents/skills'],
      ['.config/opencode/skills', '.claude/skills', '.agents/skills'],
    ],
  ],
  [
    'pi',
    [
      ['.pi/skills', '.agents/skills'],
      ['.pi/agent/skills', '.agents/skills'],
    ],
  ],
])

export function engineSkillProbe(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  projectRoot: string,
  {
    config,
    exact = true,
    engine,
    runner,
  }: {
    config: unknown
    exact?: boolean
    engine?: string | undefined
    runner?: SkillRunner | undefined
  },
): (name: string) => boolean {
  const layout = skillsLayout(config)
  const prefix = exact ? undefined : layout.prefix
  if (engine === undefined)
    return name =>
      findSkillFile(check, projectRoot, { targets: layout.targets, prefix }, name) !== undefined
  const directories = skillDirectories.get(engine)
  if (!directories) return () => false
  const [project, global] = directories
  const home = process.env['HOME']
  const claudeDir = process.env['CLAUDE_CONFIG_DIR']
  const globalRoot =
    engine === 'claude'
      ? claudeDir
        ? resolve(projectRoot, claudeDir)
        : home && join(home, '.claude')
      : home
  const nativeSkill = cachedNativeSkill(projectRoot, engine, runner)
  return name => {
    // A successful native inventory includes selectors and disabled skills that paths cannot infer.
    const native = nativeSkill(name)
    if (native !== undefined) return native
    return Boolean(
      findSkillFile(check, projectRoot, { targets: project, prefix }, name) ||
        (globalRoot && findSkillFile(check, globalRoot, { targets: global }, name)) ||
        (engine === 'claude'
          ? globalRoot &&
            claudePluginSkill(fs, check, { root: projectRoot, configDir: globalRoot }, name)
          : packageSkill(fs, check, { root: projectRoot, home, engine }, name)),
    )
  }
}
