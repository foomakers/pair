import path from 'path'
import type { FileSystemService } from '@pair/content-ops'

// Consolidated e2e asserts and helper builders.
// This file contains both small builder helpers (used to compute deterministic
// candidate paths) and the public assertion helpers used across tests.

function buildCiDirectCandidates(
  customTarget: string | undefined,
  registryTargetPath: string,
): string[] {
  if (!customTarget) return []
  return [
    `${customTarget}/${registryTargetPath}/workflows/ci.yml`,
    `./${customTarget}/${registryTargetPath}/workflows/ci.yml`,
    `${customTarget}/${customTarget}/${registryTargetPath}/workflows/ci.yml`,
  ]
}

function buildCiBaseCandidates(
  baseTarget: string | undefined,
  registryTargetPath: string,
): string[] {
  if (!baseTarget) return []
  return [
    `${baseTarget}/${registryTargetPath}/workflows/ci.yml`,
    `./${baseTarget}/${registryTargetPath}/workflows/ci.yml`,
  ]
}

function buildCiResolvedCandidates(resolvedAbs: string, registryTargetPath: string): string[] {
  const out: string[] = []
  out.push(path.join(resolvedAbs, registryTargetPath, 'workflows', 'ci.yml'))
  out.push(path.join(resolvedAbs, registryTargetPath, registryTargetPath, 'workflows', 'ci.yml'))
  out.push(path.join(resolvedAbs, 'workflows', 'ci.yml'))
  out.push(path.join(process.cwd(), resolvedAbs, 'workflows', 'ci.yml'))
  out.push(
    path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'workflows', 'ci.yml'),
  )
  out.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'workflows', 'ci.yml'))
  try {
    const repoRoot = path.dirname(path.dirname(process.cwd()))
    const relCwd = path.relative(repoRoot, process.cwd())
    out.push(path.join(relCwd, resolvedAbs, registryTargetPath, 'workflows', 'ci.yml'))
  } catch (e) {
    void e
  }
  return out
}

function buildIndexDirectAndBase(
  customTarget: string | undefined,
  baseTarget: string | undefined,
  registryTargetPath: string,
): string[] {
  const out: string[] = []
  if (customTarget) out.push(`${customTarget}/${registryTargetPath}/index.md`)
  if (baseTarget) out.push(`${baseTarget}/${registryTargetPath}/index.md`)
  return out
}

function buildIndexResolvedAndKnownFiles(
  resolvedAbs: string,
  registryTargetPath: string,
): string[] {
  const paths: string[] = []
  paths.push(path.join(resolvedAbs, registryTargetPath, 'index.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, 'getting-started.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, 'way-of-working.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, registryTargetPath, 'index.md'))
  paths.push(path.join(resolvedAbs, 'index.md'))
  paths.push(path.join(resolvedAbs, 'getting-started.md'))
  paths.push(path.join(resolvedAbs, 'way-of-working.md'))
  paths.push(path.join(process.cwd(), resolvedAbs, 'index.md'))
  paths.push(path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'index.md'))
  paths.push(
    path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'getting-started.md'),
  )
  paths.push(
    path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'way-of-working.md'),
  )
  paths.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'index.md'))
  paths.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'getting-started.md'))
  paths.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'way-of-working.md'))
  try {
    const repoRoot = path.dirname(path.dirname(process.cwd()))
    const relCwd = path.relative(repoRoot, process.cwd())
    paths.push(path.join(relCwd, resolvedAbs, registryTargetPath, 'index.md'))
  } catch (e) {
    void e
  }
  return paths
}

function buildAdoptionDirectAndBase(
  customTarget: string | undefined,
  baseTarget: string | undefined,
  registryTargetPath: string,
): string[] {
  const out: string[] = []
  if (customTarget) out.push(`${customTarget}/${registryTargetPath}/onboarding.md`)
  if (baseTarget) out.push(`${baseTarget}/${registryTargetPath}/onboarding.md`)
  return out
}

function buildAdoptionResolvedAndProductFiles(
  resolvedAbs: string,
  registryTargetPath: string,
): string[] {
  const paths: string[] = []
  paths.push(path.join(resolvedAbs, registryTargetPath, 'onboarding.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, 'product', 'PRD.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, 'product', 'subdomain', 'README.md'))
  paths.push(path.join(resolvedAbs, registryTargetPath, registryTargetPath, 'onboarding.md'))
  paths.push(path.join(resolvedAbs, 'onboarding.md'))
  paths.push(path.join(resolvedAbs, 'product', 'PRD.md'))
  paths.push(path.join(resolvedAbs, 'product', 'subdomain', 'README.md'))
  paths.push(path.join(process.cwd(), resolvedAbs, 'onboarding.md'))
  paths.push(
    path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'onboarding.md'),
  )
  paths.push(
    path.join(resolvedAbs, path.basename(resolvedAbs), registryTargetPath, 'product', 'PRD.md'),
  )
  paths.push(
    path.join(
      resolvedAbs,
      path.basename(resolvedAbs),
      registryTargetPath,
      'product',
      'subdomain',
      'README.md',
    ),
  )
  paths.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'onboarding.md'))
  paths.push(path.join(process.cwd(), resolvedAbs, registryTargetPath, 'product', 'PRD.md'))
  paths.push(
    path.join(process.cwd(), resolvedAbs, registryTargetPath, 'product', 'subdomain', 'README.md'),
  )
  try {
    const repoRoot = path.dirname(path.dirname(process.cwd()))
    const relCwd = path.relative(repoRoot, process.cwd())
    paths.push(path.join(relCwd, resolvedAbs, registryTargetPath, 'onboarding.md'))
  } catch (e) {
    void e
  }
  return paths
}

// Check whether a file contains the seeded CI content
export async function fileHasCi(fs: FileSystemService, p: string): Promise<boolean> {
  try {
    if (!p) return false
    if (!(await fs.exists(p))) return false
    const c = await fs.readFile(p)
    return String(c).includes('workflow: ci')
  } catch {
    return false
  }
}

// Generate a set of likely paths where a registry's ci.yml may end up.
// This mirrors how the installer resolves targets (baseTarget + customTarget)
export function getExpectedCiPaths(opts: {
  registryTargetPath: string
  customTarget?: string
  baseTarget?: string
}): string[] {
  const { registryTargetPath, customTarget, baseTarget } = opts
  const paths: string[] = []
  // compose small top-level helpers to stay under lint limits
  const resolvedAbs = baseTarget
    ? path.resolve(baseTarget, customTarget || '')
    : path.resolve(customTarget || registryTargetPath || '.')

  paths.push(...buildCiDirectCandidates(customTarget, registryTargetPath))
  paths.push(...buildCiBaseCandidates(baseTarget, registryTargetPath))
  try {
    paths.push(...buildCiResolvedCandidates(resolvedAbs, registryTargetPath))
  } catch (e) {
    void e
  }

  return Array.from(new Set(paths))
}

export async function anyPathHasCi(fs: FileSystemService, paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await fileHasCi(fs, p)) return true
  }
  return false
}

// Generic existence check across candidate paths
export async function existsAnyPath(fs: FileSystemService, paths: string[]): Promise<boolean> {
  for (const p of paths) {
    try {
      if (await fs.exists(p)) return true
    } catch (e) {
      void e
    }
  }
  return false
}

// Generic content check: any path contains substring
export async function anyPathHasContent(
  fs: FileSystemService,
  paths: string[],
  substring: string,
): Promise<boolean> {
  for (const p of paths) {
    try {
      if (!(await fs.exists(p))) continue
      const c = await fs.readFile(p)
      if (String(c).includes(substring)) return true
    } catch {
      // ignore
    }
  }
  return false
}

// Expected index.md paths for knowledge registry under a given base/custom target
export function getExpectedIndexPaths(opts: {
  registryTargetPath: string
  customTarget?: string
  baseTarget?: string
}): string[] {
  const { registryTargetPath, customTarget, baseTarget } = opts
  const paths: string[] = []
  paths.push(...buildIndexDirectAndBase(customTarget, baseTarget, registryTargetPath))
  try {
    const resolvedAbs = baseTarget
      ? path.resolve(baseTarget, customTarget || '')
      : path.resolve(customTarget || registryTargetPath || '.')
    paths.push(...buildIndexResolvedAndKnownFiles(resolvedAbs, registryTargetPath))
  } catch (e) {
    void e
  }

  return Array.from(new Set(paths))
}

// Expected onboarding.md paths for adoption registry under a given base/custom target
export function getExpectedAdoptionPaths(opts: {
  registryTargetPath: string
  customTarget?: string
  baseTarget?: string
}): string[] {
  const { registryTargetPath, customTarget, baseTarget } = opts
  const paths: string[] = []
  paths.push(...buildAdoptionDirectAndBase(customTarget, baseTarget, registryTargetPath))
  try {
    const resolvedAbs = baseTarget
      ? path.resolve(baseTarget, customTarget || '')
      : path.resolve(customTarget || registryTargetPath || '.')
    paths.push(...buildAdoptionResolvedAndProductFiles(resolvedAbs, registryTargetPath))
  } catch (e) {
    void e
  }

  return Array.from(new Set(paths))
}

// Breadth-first search for a filename under a root (generic)
export async function bfsSearchForFile(
  fs: FileSystemService,
  root: string,
  filename: string,
  depth = 4,
): Promise<string | null> {
  async function searchRec(cur: string, remaining: number): Promise<string | null> {
    if (remaining < 0) return null
    try {
      if (!(await fs.exists(cur))) return null
    } catch {
      return null
    }
    const entries = await fs.readdir(cur).catch(() => [])
    for (const e of entries) {
      const name = e.name
      const child = cur.endsWith('/') ? `${cur}${name}` : `${cur}/${name}`
      if (name === filename) return child
      if (e.isDirectory()) {
        const f = await searchRec(child, remaining - 1)
        if (f) return f
      }
    }
    return null
  }
  return await searchRec(root, depth)
}

// Find file by name (same as bfsSearchForFile but returns first match)
export async function findFileByName(
  fs: FileSystemService,
  root: string,
  filename: string,
  depth = 6,
): Promise<string | null> {
  return await bfsSearchForFile(fs, root, filename, depth)
}
