import type { FileSystemService } from '@pair/content-ops'

/** US-576 AC7: run state under `.pair/working/` is local — never committed. */
export const WORKING_IGNORE_LINE = '.pair/working/'
const EQUIVALENT = new Set(['.pair/working', '.pair/working/', '/.pair/working', '/.pair/working/'])

/** Adds `.pair/working/` to `<root>/.gitignore` when no line ignores it yet; returns whether it wrote. */
export async function ensureWorkingIgnored(fs: FileSystemService, root: string): Promise<boolean> {
  const path = fs.resolve(root, '.gitignore')
  const current = fs.existsSync(path) ? fs.readFileSync(path) : ''
  if (current.split(/\r?\n/).some(line => EQUIVALENT.has(line.trim()))) return false
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : ''
  await fs.writeFile(path, `${current}${separator}${WORKING_IGNORE_LINE}\n`)
  return true
}
