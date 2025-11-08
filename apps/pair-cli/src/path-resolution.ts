import { relative, resolve } from 'path'

// Local copy of convertToRelative used to keep behavior consistent with
// @pair/content-ops without importing package internals in this project.
export function convertToRelative(baseDir: string, targetPath: string) {
  const rel = relative(baseDir, targetPath)
  if (!rel) return './'
  return rel.replace(/\\/g, '/')
}

export function convertToAbsolute(baseDir: string, relativePath: string) {
  return resolve(baseDir, relativePath)
}
