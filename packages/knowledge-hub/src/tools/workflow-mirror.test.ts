import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// packages/knowledge-hub/src/tools -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

/**
 * US-219 AC2/AC3 — the dogfood copy cannot silently drift from the shipped one.
 *
 * Workflows and agent definitions now ship in the dataset and install into
 * `.claude/workflows/` and `.claude/agents/`. That creates two copies of the same
 * artifact in this repo: the dataset source and the live copy this project runs from.
 * Nothing structural keeps them equal — a fix applied to the copy the maintainer
 * actually edits would ship nothing, and a fix applied only to the dataset would leave
 * this repo running the old engine while claiming to dogfood the new one.
 *
 * Unlike the skills mirror, these artifacts are copied VERBATIM: no name rewriting, no
 * transform. So the guard is byte equality, and it is allowed to be that strict — which
 * also makes it the cheapest possible statement of the invariant.
 */
const PAIRS = [
  {
    what: 'workflows',
    dataset: 'packages/knowledge-hub/dataset/.workflows',
    installed: '.claude/workflows',
  },
  {
    what: 'agent definitions',
    dataset: 'packages/knowledge-hub/dataset/.agents',
    installed: '.claude/agents',
  },
] as const

/**
 * Every shipped file, RECURSIVELY — `contracts/ensure-contract.mjs` is a real dependency
 * the agents invoke, so a flat listing would let the engine ship without the helper it
 * calls and still pass this guard.
 *
 * Derived contract caches (`*.contract.json`, `*.draft.json`) are excluded: they are
 * regenerable output, ignored by `contracts/.gitignore`, and a machine that has simply
 * run a batch must not read as drifted.
 */
const listFiles = (dir: string, prefix = ''): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(f => !f.startsWith('.'))
        .flatMap(f => {
          const full = join(dir, f)
          const rel = prefix ? `${prefix}/${f}` : f
          if (statSync(full).isDirectory()) return listFiles(full, rel)
          return /\.(contract|draft)\.json$/.test(f) ? [] : [rel]
        })
        .sort()
    : []

describe.each(PAIRS)('$what: dataset and root copy are one artifact', ({ dataset, installed }) => {
  const datasetDir = join(REPO_ROOT, dataset)
  const installedDir = join(REPO_ROOT, installed)

  it('ships at least one file — an empty source would make every check below vacuous', () => {
    // Without this, deleting the dataset directory turns the whole suite green.
    expect(listFiles(datasetDir).length).toBeGreaterThan(0)
  })

  it('the root copy carries exactly the dataset files, no more and no fewer', () => {
    // A file present only at the root is a change that ships to nobody; one present only
    // in the dataset is a change this repo is not actually running.
    expect(listFiles(installedDir)).toEqual(listFiles(datasetDir))
  })

  it('every file is byte-identical', () => {
    for (const name of listFiles(datasetDir)) {
      const source = readFileSync(join(datasetDir, name), 'utf-8')
      const live = readFileSync(join(installedDir, name), 'utf-8')
      expect(
        live,
        `${installed}/${name} has drifted from the dataset — copy the dataset version`,
      ).toBe(source)
    }
  })
})

describe('US-219 AC3 — a workflow ships with the agents it dispatches to', () => {
  const agentsDir = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.agents')
  const workflowsDir = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.workflows')

  it('every agentType a workflow spawns has a shipped definition', () => {
    // A workflow installed without its agent definitions cannot run. The failure would
    // surface at an adopter's first batch as an unresolvable agentType, long after install
    // reported success — so it is caught here, against the real dispatch sites.
    const shipped = new Set(listFiles(agentsDir).map(f => f.replace(/\.md$/, '')))
    expect(shipped.size).toBeGreaterThan(0)

    const spawned = new Set<string>()
    for (const file of listFiles(workflowsDir).filter(f => f.endsWith('.js'))) {
      const src = readFileSync(join(workflowsDir, file), 'utf-8')
      for (const m of src.matchAll(/agentType:\s*'([a-z-]+)'/g)) spawned.add(m[1]!)
    }
    expect(spawned.size, 'no agentType found — the scan pattern stopped matching').toBeGreaterThan(
      0,
    )

    // `general-purpose` is a host built-in, not something this dataset ships.
    const missing = [...spawned].filter(t => t !== 'general-purpose' && !shipped.has(t))
    expect(
      missing,
      `workflows spawn agent types the dataset does not ship: ${missing.join(', ')}`,
    ).toEqual([])
  })
})
