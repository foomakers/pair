import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { chmod, mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunFiles } from '../engine'

export const readText = (file: string): string => readFileSync(file, 'utf8')

export const sessionFiles: RunFiles = {
  existsSync,
  readFileSync: readText,
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

export function projectConfig(
  root: string,
  file = 'pair.config.json',
): Record<string, unknown> | undefined {
  const text = readOptional(join(root, file))
  return text === undefined ? undefined : (JSON.parse(text) as Record<string, unknown>)
}

/** A final message can be a file or a stream, including stdin from a parent process. */
export const readMessage = (file: string): string =>
  file === '-' ? readFileSync(0, 'utf8') : readText(file)
