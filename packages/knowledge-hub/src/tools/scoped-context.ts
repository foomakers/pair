/**
 * Reference implementation of the scoped context resolution convention
 * (skill-conventions/scoped-context-resolution.md): touched files → router
 * packages (longest prefix) → local `.pair` dirs to load. Pure; the skills
 * follow the same algorithm in prose, this keeps it executable and tested.
 */
export interface RouterRow {
  package: string
  localDir: string
}

export interface ScopedContext {
  active: boolean
  localDirs: string[]
  warnings: string[]
}

const ROUTER_HEADING = /^## Package-Local Adoption\s*$/m

export function parseRouter(centralAdoption: string | undefined): RouterRow[] {
  if (!centralAdoption) return []
  const m = ROUTER_HEADING.exec(centralAdoption)
  if (!m) return []
  const rest = centralAdoption.slice(m.index + m[0].length)
  const next = rest.search(/^## /m)
  const section = next === -1 ? rest : rest.slice(0, next)
  const rows: RouterRow[] = []
  for (const line of section.split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    if (cells.length < 4 || !cells[1] || /^-+$/.test(cells[1]) || cells[1] === 'Package') continue
    const pkg = cells[1].replace(/\/+$/, '')
    const dir = (cells[2] ?? '').replace(/`/g, '').replace(/\/+$/, '')
    rows.push({ package: pkg, localDir: dir })
  }
  return rows
}

export function resolveScopedContext(input: {
  centralAdoption: string | undefined
  touchedFiles: string[]
  dirExists: (dir: string) => boolean
}): ScopedContext {
  const router = parseRouter(input.centralAdoption)
  if (router.length === 0) return { active: false, localDirs: [], warnings: [] }

  const touched = new Map<string, RouterRow>()
  for (const file of input.touchedFiles) {
    let best: RouterRow | undefined
    for (const row of router) {
      const hit = file === row.package || file.startsWith(row.package + '/')
      if (hit && (!best || row.package.length > best.package.length)) best = row
    }
    if (best) touched.set(best.package, best)
  }

  const localDirs: string[] = []
  const warnings: string[] = []
  for (const row of touched.values()) {
    if (input.dirExists(row.localDir)) localDirs.push(row.localDir)
    else warnings.push(`dangling router entry: ${row.package} (${row.localDir} missing)`)
  }
  return { active: true, localDirs: localDirs.sort(), warnings }
}
