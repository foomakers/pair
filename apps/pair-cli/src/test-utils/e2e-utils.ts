import { join, dirname } from 'path'
import InMemoryFileSystemService from '@pair/content-ops/test-utils/in-memory-fs'

export function seedDatasetForMonorepo(initial: Record<string, string>, cwd: string) {
  // Build seed that contains both /dataset and monorepo packages/knowledge-hub/dataset
  const monorepoRoot = dirname(dirname(cwd))
  const realDatasetPath = join(monorepoRoot, 'packages', 'knowledge-hub', 'dataset')

  const seed: Record<string, string> = {}
  for (const [p, content] of Object.entries(initial)) {
    // p is a path under dataset, e.g. '.github/workflows/ci.yml'
    seed[join('/dataset', p)] = content
    seed[join(realDatasetPath, p)] = content
  }

  // Ensure the knowledge-hub package.json exists in the seeded FS so
  // getKnowledgeHubDatasetPath can locate the package when walking up.
  seed[join(monorepoRoot, 'packages', 'knowledge-hub', 'package.json')] = JSON.stringify({
    name: '@pair/knowledge-hub',
  })
  // Also add a node_modules fallback package.json location
  seed[join(monorepoRoot, 'node_modules', '@pair', 'knowledge-hub', 'package.json')] =
    JSON.stringify({ name: '@pair/knowledge-hub' })

  // Add seed markers for top-level folders so cleanup can distinguish
  // seeded input fixtures from test-created targets.
  const topLevelFolders = new Set<string>()
  for (const p of Object.keys(initial)) {
    const top = p.split('/')[0]
    if (top && top.length > 0) topLevelFolders.add(top)
  }
  for (const top of topLevelFolders) {
    seed[join('/dataset', top, '.seed')] = 'seed'
    seed[join(realDatasetPath, top, '.seed')] = 'seed'
  }

  return seed
}

export function makeFsWithSeed(initial: Record<string, string>, cwd: string) {
  const seed = seedDatasetForMonorepo(initial, cwd)
  // Also place config.json in the working directory for tests
  if (initial['config.json']) {
    seed[`${cwd}/config.json`] = initial['config.json']
  }

  // Place all initial files in the working directory as well. Tests that
  // simulate a manual release bundle (where getKnowledgeHubDatasetPath() ->
  // '') expect the dataset files to be present directly under cwd.
  for (const [path, content] of Object.entries(initial)) {
    if (path !== 'config.json') {
      seed[`${cwd}/${path}`] = content
    }
  }

  // Add a seed marker under cwd so cleanup can skip seeded test environments
  seed[`${cwd}/.seed`] = 'seed'

  return new InMemoryFileSystemService(seed, cwd, cwd)
}

export default { seedDatasetForMonorepo, makeFsWithSeed }
