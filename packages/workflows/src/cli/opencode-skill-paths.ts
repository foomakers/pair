import type { Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from './project-config'

export interface SkillFiles {
  readFileSync(path: string): string
  readdirSync(path: string): readonly Dirent[]
  realpathSync(path: string): string
}

const envFlag = (name: string) => /^(1|true)$/i.test(process.env[name] ?? '')

function globalConfigDir(home: string | undefined): string | undefined {
  const config = process.env['XDG_CONFIG_HOME'] || (home && join(home, '.config'))
  return config ? join(config, 'opencode') : undefined
}

function openCodeSkillDirectories(root: string, home: string | undefined): string[] {
  const global = globalConfigDir(home)
  const custom = process.env['OPENCODE_CONFIG_DIR']
  const configDirs = [
    global,
    envFlag('OPENCODE_DISABLE_PROJECT_CONFIG') ? undefined : join(root, '.opencode'),
    home && join(home, '.opencode'),
    custom && resolve(root, custom),
  ].flatMap(dir => (dir ? [join(dir, 'skill'), join(dir, 'skills')] : []))
  if (envFlag('OPENCODE_DISABLE_EXTERNAL_SKILLS')) return configDirs
  const claudeDisabled =
    envFlag('OPENCODE_DISABLE_CLAUDE_CODE') || envFlag('OPENCODE_DISABLE_CLAUDE_CODE_SKILLS')
  const compatible = claudeDisabled ? ['.agents/skills'] : ['.claude/skills', '.agents/skills']
  return [
    ...configDirs,
    ...compatible.map(dir => join(root, dir)),
    ...(home ? compatible.map(dir => join(home, dir)) : []),
  ]
}

function pathsFrom(text: string | undefined): string[] | undefined {
  if (text === undefined) return
  const errors: ParseError[] = []
  const config: unknown = parseJsonc(text, errors, { allowTrailingComma: true })
  if (errors.length > 0 || !isPlainObject(config)) return
  const skills = config['skills']
  const paths = isPlainObject(skills) ? skills['paths'] : undefined
  return Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string')
    : undefined
}

function configCandidates(root: string, home: string | undefined): string[] {
  const env = process.env
  const global = globalConfigDir(home)
  const configFiles = ['opencode.json', 'opencode.jsonc']
  const projectDisabled = envFlag('OPENCODE_DISABLE_PROJECT_CONFIG')
  return [
    ...(global ? ['config.json', ...configFiles].map(file => join(global, file)) : []),
    ...(env['OPENCODE_CONFIG'] ? [resolve(root, env['OPENCODE_CONFIG'])] : []),
    ...(projectDisabled
      ? []
      : [root, join(root, '.opencode')].flatMap(dir => configFiles.map(file => join(dir, file)))),
    ...(env['OPENCODE_CONFIG_DIR']
      ? configFiles.map(file => resolve(root, env['OPENCODE_CONFIG_DIR']!, file))
      : []),
  ].reverse()
}

function configuredPaths(fs: SkillFiles, root: string, home: string | undefined): string[] {
  const inline = pathsFrom(process.env['OPENCODE_CONFIG_CONTENT'])
  if (inline !== undefined) return inline
  for (const file of configCandidates(root, home)) {
    try {
      const paths = pathsFrom(fs.readFileSync(file))
      if (paths !== undefined) return paths
    } catch {
      // This config source is absent or unreadable.
    }
  }
  return []
}

function skillName(fs: SkillFiles, file: string): string | undefined {
  try {
    const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fs.readFileSync(file))
    if (frontmatter === null) return
    const skill: unknown = parseYaml(frontmatter[1]!)
    if (!isPlainObject(skill) || typeof skill['name'] !== 'string') return
    if (skill['description'] !== undefined && typeof skill['description'] !== 'string') return
    return skill['name']
  } catch {
    // OpenCode skips unreadable or malformed skill files.
    return
  }
}

function canDescend(entry: Dirent): boolean {
  return (
    (entry.isDirectory() || entry.isSymbolicLink()) &&
    !entry.name.startsWith('.') &&
    entry.name !== 'node_modules'
  )
}

function discover(
  fs: SkillFiles,
  directory: string,
  names: Set<string>,
  visited: Set<string>,
): void {
  let entries: readonly Dirent[]
  try {
    const physical = fs.realpathSync(directory)
    if (visited.has(physical)) return
    entries = fs.readdirSync(physical)
    visited.add(physical)
  } catch {
    return
  }
  for (const entry of entries) {
    const file = join(directory, entry.name)
    if (entry.name === 'SKILL.md' && !entry.isDirectory()) {
      const name = skillName(fs, file)
      if (name !== undefined) names.add(name)
    } else if (canDescend(entry)) {
      discover(fs, file, names, visited)
    }
  }
}

/** Read OpenCode's registered names from local skill sources. */
export function openCodeSkills(fs: SkillFiles, root: string, home: string | undefined) {
  const names = new Set<string>()
  const visited = new Set<string>()
  for (const directory of openCodeSkillDirectories(root, home))
    discover(fs, directory, names, visited)
  for (const path of configuredPaths(fs, root, home)) {
    const directory = path.startsWith('~/')
      ? home && resolve(home, path.slice(2))
      : resolve(root, path)
    if (directory) discover(fs, directory, names, visited)
  }
  return names
}
