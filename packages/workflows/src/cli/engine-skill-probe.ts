import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import AdmZip from 'adm-zip'
import type { RunFiles } from '../engine'
import { inventoryRequest } from '../worktree/inventory-process'
import { isPlainObject } from './project-config'
import { findSkillFile, skillsLayout } from './skill-paths'
import {
  openCodeConfiguredSkills,
  openCodeSkillDirectories,
  type SkillFiles,
} from './opencode-skill-paths'

export type EngineSkillFiles = SkillFiles & { readFileBytesSync(path: string): Buffer }
const claudeManifest = '.claude-plugin/plugin.json'

function claudeManifestSkillPaths(fs: Pick<RunFiles, 'readFileSync'>, root: string): string[] {
  const skills = readJson(fs, join(root, claudeManifest))['skills']
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

function claudeRunnerPluginDirs(root: string, args: readonly string[]): string[] {
  return args.flatMap((arg, index) => {
    const path = arg === '--plugin-dir' ? args[index + 1] : /^--plugin-dir=(.+)$/.exec(arg)?.[1]
    return path ? [resolve(root, path)] : []
  })
}

function claudePluginSource(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  root: string,
  fallbackName = basename(root),
) {
  const name = readJson(fs, join(root, claudeManifest))['name'] ?? fallbackName
  return (plugin: string, skill: string) =>
    plugin === name && hasClaudePluginSkill(fs, check, root, skill)
}

function claudeZipSource(fs: EngineSkillFiles, archive: string) {
  // Read entries in place. Validation never extracts a plugin or starts its hooks.
  const zip = new AdmZip(fs.readFileBytesSync(archive))
  const top = new Set(zip.getEntries().map(entry => entry.entryName.split('/')[0]!))
  const [only] = top
  const wrapped =
    only !== undefined && top.size === 1 && !['.claude-plugin', 'skills'].includes(only)
  const root = wrapped ? join(archive, only) : archive
  const entryAt = (file: string) => zip.getEntry(relative(archive, file).split(sep).join('/'))
  const readFileSync = (file: string) => {
    const entry = entryAt(file)
    // Only the plugin manifest is read. Bound the decompression of that metadata.
    return entry && !entry.isDirectory && entry.header.size <= 1024 * 1024
      ? entry.getData().toString('utf8')
      : ''
  }
  const check = (file: string) => entryAt(file)?.isDirectory === false
  return claudePluginSource({ readFileSync }, check, root, basename(archive, '.zip'))
}

function claudeRunnerSources(fs: EngineSkillFiles, check: (path: string) => boolean, path: string) {
  try {
    if (path.endsWith('.zip') && check(path)) return [claudeZipSource(fs, path)]
    const direct = claudePluginSource(fs, check, path)
    if (check(join(path, claudeManifest))) return [direct]
    const children = fs.readdirSync(path)
    if (children.some(entry => ['skills', 'commands', 'agents', 'hooks'].includes(entry.name)))
      return [direct]
    return children.flatMap(entry => {
      const child = join(path, entry.name)
      return check(join(child, claudeManifest)) ? [claudePluginSource(fs, check, child)] : []
    })
  } catch {
    return []
  }
}

function claudeMode(args: readonly string[]) {
  const enabled = (key: string) => /^(1|true)$/i.test(process.env[key] ?? '')
  if (
    enabled('CLAUDE_CODE_SAFE_MODE') ||
    args.includes('--safe-mode') ||
    args.includes('--disable-slash-commands')
  )
    return 'disabled'
  return enabled('CLAUDE_CODE_SIMPLE') || args.includes('--bare') ? 'bare' : 'default'
}

function claudePluginSkill(
  fs: Pick<RunFiles, 'readFileSync'>,
  check: (path: string) => boolean,
  { configDir, root }: { configDir: string; root: string },
  { plugin, skill }: { plugin: string; skill: string },
): boolean {
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
    if (active !== true || id.split('@')[0] !== plugin) return false
    const entries = installed?.[id]
    return (
      Array.isArray(entries) &&
      entries.some(
        entry =>
          ((entry.scope !== 'project' && entry.scope !== 'local') || entry.projectPath === root) &&
          typeof entry.installPath === 'string' &&
          hasClaudePluginSkill(fs, check, entry.installPath, skill),
      )
    )
  })
}

function claudeSkills(
  fs: EngineSkillFiles,
  check: (path: string) => boolean,
  {
    root,
    home,
    prefix,
    runnerArgs = [],
  }: {
    root: string
    home: string | undefined
    prefix: string | undefined
    runnerArgs?: readonly string[] | undefined
  },
) {
  const end = runnerArgs.indexOf('--')
  const args = end < 0 ? runnerArgs : runnerArgs.slice(0, end)
  const mode = claudeMode(args)
  if (mode === 'disabled') return () => false
  const configured = process.env['CLAUDE_CONFIG_DIR']
  const configDir = configured ? resolve(root, configured) : home && join(home, '.claude')
  let sources: ReturnType<typeof claudeRunnerSources> | undefined
  return (name: string) => {
    const match = /^([\w-]+):([\w-]+)$/.exec(name)
    if (match) {
      const plugin = match[1]!
      const skill = match[2]!
      sources ??= claudeRunnerPluginDirs(root, args).flatMap(path =>
        claudeRunnerSources(fs, check, path),
      )
      return (
        sources.some(source => source(plugin, skill)) ||
        Boolean(
          mode === 'default' &&
            configDir &&
            claudePluginSkill(fs, check, { root, configDir }, { plugin, skill }),
        )
      )
    }
    return (
      mode === 'default' &&
      Boolean(
        findSkillFile(check, root, { targets: ['.claude/skills'], prefix }, name) ||
          (configDir && findSkillFile(check, configDir, { targets: ['skills'] }, name)),
      )
    )
  }
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
  ['codex', [['.agents/skills'], ['.agents/skills']]],
  [
    'pi',
    [
      ['.pi/skills', '.agents/skills'],
      ['.pi/agent/skills', '.agents/skills'],
    ],
  ],
])

type EngineSkillOptions = {
  config: unknown
  exact?: boolean
  engine?: string | undefined
  runner?: SkillRunner | undefined
}

export function engineSkillProbe(
  fs: EngineSkillFiles,
  check: (path: string) => boolean,
  projectRoot: string,
  { config, exact = true, engine, runner }: EngineSkillOptions,
): (name: string) => boolean {
  const layout = skillsLayout(config)
  const prefix = exact ? undefined : layout.prefix
  if (engine === undefined)
    return name =>
      findSkillFile(check, projectRoot, { targets: layout.targets, prefix }, name) !== undefined
  const home = process.env['HOME']
  if (engine === 'claude')
    return claudeSkills(fs, check, {
      root: projectRoot,
      home,
      prefix,
      runnerArgs: runner?.runnerArgs,
    })
  const directories =
    engine === 'opencode' ? openCodeSkillDirectories() : skillDirectories.get(engine)
  if (!directories) return () => false
  const [project, global] = directories
  const nativeSkill = cachedNativeSkill(projectRoot, engine, runner)
  let configuredSkills: Set<string> | undefined
  return name => {
    // A successful native inventory includes selectors and disabled skills that paths cannot infer.
    const native = nativeSkill(name)
    if (native !== undefined) return native
    return Boolean(
      findSkillFile(check, projectRoot, { targets: project, prefix }, name) ||
        (home && findSkillFile(check, home, { targets: global }, name)) ||
        packageSkill(fs, check, { root: projectRoot, home, engine }, name) ||
        (engine === 'opencode' &&
          (configuredSkills ??= openCodeConfiguredSkills(fs, projectRoot, home)).has(name)),
    )
  }
}
