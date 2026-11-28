import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import type { RunFiles } from '../engine'
import { applyProjectConfig } from './project-config'
import type { EngineSkillFiles } from './engine-skill-probe'

export const readText = (file: string): string => readFileSync(file, 'utf8')

export const sessionFiles: RunFiles & EngineSkillFiles = {
  existsSync,
  readFileSync: readText,
  readFileBytesSync: path => readFileSync(path),
  readdirSync: path => readdirSync(path, { withFileTypes: true }),
  realpathSync,
  statSync,
  chmod,
  async mkdir(path, options) {
    await mkdir(path, options)
  },
  rename,
  unlink,
  writeFile,
}

export function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
    throw error
  }
}

export const readOptional = (file: string): string | undefined =>
  isFile(file) ? readText(file) : undefined

export const yamlFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name))
        .map(entry => entry.name)
    : []

export const loadSessionProjectConfig = (root: string): Record<string, unknown> | undefined =>
  applyProjectConfig(sessionFiles, {}, root)

/** A final message can be a file or a stream, including stdin from a parent process. */
export const readMessage = (file: string): string =>
  file === '-' ? readFileSync(0, 'utf8') : readText(file)
