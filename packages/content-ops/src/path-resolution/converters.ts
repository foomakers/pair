import { relative, resolve } from 'path'

/** Convert absolute path to relative path from baseDir. Returns a posix-style path.
 * If the target is the same as baseDir, returns './<filename>'
 */
export function convertToRelative(baseDir: string, targetPath: string) {
  const rel = relative(baseDir, targetPath)
  if (!rel) return './'
  // normalize windows backslashes
  return rel.replace(/\\/g, '/')
}

/** Convert relative path (from baseDir) to absolute path using resolve semantics */
export function convertToAbsolute(baseDir: string, relativePath: string) {
  return resolve(baseDir, relativePath)
}
