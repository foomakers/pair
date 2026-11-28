import type { Dirent } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse as parseJsonc, type ParseError } from 'jsonc-parser'
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from './project-config'

export interface SkillFiles {
  readFileSync(path: string): string
  readdirSync(path: string): readonly Dirent[]
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

function configuredPaths(fs: SkillFiles, root: string, home: string | undefined): string[] {
  const env = process.env
  const global = env['XDG_CONFIG_HOME'] || (home && join(home, '.config'))
  const configFiles = ['opencode.json', 'opencode.jsonc']
  const projectDisabled = /^(1|true)$/i.test(env['OPENCODE_DISABLE_PROJECT_CONFIG'] ?? '')
  const files = [
    ...(global ? ['config.json', ...configFiles].map(file => join(global, 'opencode', file)) : []),
    ...(env['OPENCODE_CONFIG'] ? [resolve(root, env['OPENCODE_CONFIG'])] : []),
    ...(projectDisabled
      ? []
      : [root, join(root, '.opencode')].flatMap(dir => configFiles.map(file => join(dir, file)))),
    ...(env['OPENCODE_CONFIG_DIR']
      ? configFiles.map(file => resolve(root, env['OPENCODE_CONFIG_DIR']!, file))
      : []),
  ]
  const inline = pathsFrom(env['OPENCODE_CONFIG_CONTENT'])
  if (inline !== undefined) return inline
  for (const file of files.reverse()) {
    try {
      const paths = pathsFrom(fs.readFileSync(file))
      if (paths !== undefined) return paths
    } catch {
      // This config source is absent or unreadable.
    }
  }
  return []
}

function discover(fs: SkillFiles, directory: string, names: Set<string>): void {
  let entries: readonly Dirent[]
  try {
    entries = fs.readdirSync(directory)
  } catch {
    return
  }
  for (const entry of entries) {
    const file = join(directory, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      discover(fs, file, names)
    } else if (entry.name === 'SKILL.md') {
      try {
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(fs.readFileSync(file))
        if (frontmatter === null) continue
        const skill: unknown = parseYaml(frontmatter[1]!)
        if (isPlainObject(skill) && typeof skill['name'] === 'string') names.add(skill['name'])
      } catch {
        // OpenCode skips unreadable or malformed skill files.
      }
    }
  }
}

/** OpenCode's local skills.paths discovery without starting its config/plugin installers. */
export function openCodeConfiguredSkills(fs: SkillFiles, root: string, home: string | undefined) {
  const names = new Set<string>()
  for (const path of configuredPaths(fs, root, home)) {
    const directory = path.startsWith('~/')
      ? home && resolve(home, path.slice(2))
      : resolve(root, path)
    if (directory) discover(fs, directory, names)
  }
  return names
}
