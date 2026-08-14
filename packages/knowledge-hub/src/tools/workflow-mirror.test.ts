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
 * Every shipped file, RECURSIVELY — `pair-contracts/ensure-contract.mjs` is a real dependency
 * the agents invoke, so a flat listing would let the engine ship without the helper it
 * calls and still pass this guard.
 *
 * Dot FILES are included; dot DIRECTORIES are not. The distinction is load-bearing (review of
 * #432): `pair-contracts/.gitignore` is the file whose entire job is to keep the derived
 * `*.contract.json` / `*.draft.json` out of an adopter's git, and a blanket dot-filter put
 * exactly that file outside the guard. Dot directories stay filtered because they are tool
 * state (`.git`, `.turbo`), never shipped content.
 *
 * Derived contract caches (`*.contract.json`, `*.draft.json`) are excluded: they are
 * regenerable output, ignored by `pair-contracts/.gitignore`, and a machine that has simply
 * run a batch must not read as drifted.
 */
const listFiles = (dir: string, prefix = ''): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .flatMap(f => {
          const full = join(dir, f)
          const rel = prefix ? `${prefix}/${f}` : f
          if (statSync(full).isDirectory()) return f.startsWith('.') ? [] : listFiles(full, rel)
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

  it('the root copy carries every dataset file — the dataset is the shipped subset', () => {
    // Direction matters. Every shipped file must exist at the root, or this repo is not
    // running what it ships. The reverse is NOT required, and the one current root-only file
    // is a deliberate exclusion rather than drift:
    //
    //   `.claude/workflows/pair-analyze-pr-batch.js` dispatches its agents to `/analyze-pr`,
    //   a PERSONAL, user-level skill that exists in neither this repo's `.claude/skills/` nor
    //   the shipped dataset. Shipping it would install a workflow whose agents are sent to a
    //   skill an adopter does not have. Its `meta.whenToUse` states that prerequisite for the
    //   contributor who runs it here.
    //
    // (The policy is recorded HERE, next to the guard that depends on it, rather than in a
    // dataset README: a README under `dataset/.workflows/` would itself install into every
    // adopter's `.claude/workflows/`.)
    const shipped = listFiles(datasetDir)
    const live = new Set(listFiles(installedDir))
    expect(shipped.filter(f => !live.has(f))).toEqual([])
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

  it('every /skill a shipped workflow prompt invokes has a shipped definition', () => {
    // Found in review of #432: `pair-analyze-pr-batch.js` told every agent to "invoke the
    // /analyze-pr skill", which exists in neither the dataset nor this repo — it was a
    // personal, user-level skill. An adopter would install a workflow whose agents are sent
    // to a skill that does not exist; they would fabricate the output or die, while the run
    // reported the paths it wrote.
    //
    // The AC3 guard above scans `agentType:` only, and this file spawns `general-purpose`,
    // which that guard exempts — so the same half-installed failure reappeared one level up.
    const skillsRoot = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.skills')
    const shipped = new Set<string>()
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        if (e.isDirectory()) {
          shipped.add(e.name)
          walk(join(dir, e.name))
        }
      }
    }
    walk(skillsRoot)
    expect(shipped.size, 'no shipped skills found — the scan broke').toBeGreaterThan(0)

    // A skill INVOCATION, as these prompts actually write one: bolded, `**/name**`. Matching a
    // bare `/word` would sweep up path fragments (`/pair-cli`, `/pair-worktrees`) and make the
    // guard noise instead of signal.
    const invoked = new Set<string>()
    for (const file of listFiles(workflowsDir).filter(f => f.endsWith('.js'))) {
      const src = readFileSync(join(workflowsDir, file), 'utf-8')
      for (const m of src.matchAll(/\*\*\/([a-z][a-z0-9-]+)\*\*/g)) invoked.add(m[1]!)
    }

    const missing = [...invoked].filter(n => {
      const bare = n.replace(/^pair-(process|capability|next)-/, '')
      return !shipped.has(bare) && !shipped.has(n)
    })
    expect(
      missing,
      `shipped workflows invoke skills the dataset does not ship: ${missing.join(', ')}`,
    ).toEqual([])
  })
})

describe('US-219 — development artifacts do not install', () => {
  /**
   * The `workflows` registry ships a directory, and that directory also holds the dry-run
   * suites that prove the engine works. They are development artifacts: an adopter cannot run
   * them (no `workflows:test` script in their repo), and they would sit in the very directory
   * a workflow loader scans — ~127 KB of it, more than the engine itself.
   *
   * `exclude` is matched by PATH SEGMENTS, not by glob, so each file is named explicitly. This
   * guard is what keeps that list complete: adding a test file without excluding it fails here
   * instead of silently enlarging every adopter's install.
   */
  it('every dataset workflow test file is excluded from the install', () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8'),
    ) as { asset_registries: Record<string, { exclude?: string[] }> }
    const exclude = config.asset_registries['workflows']?.exclude ?? []

    const tests = listFiles(join(REPO_ROOT, 'packages/knowledge-hub/dataset/.workflows')).filter(
      f => f.endsWith('.test.mjs'),
    )
    expect(tests.length, 'no dry-run suites found — the scan broke').toBeGreaterThan(0)
    expect(tests.filter(t => !exclude.includes(t))).toEqual([])
  })

  it('excludes nothing that is not there — a stale entry silently protects nothing', () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8'),
    ) as { asset_registries: Record<string, { exclude?: string[] }> }
    const exclude = config.asset_registries['workflows']?.exclude ?? []
    const shipped = new Set(listFiles(join(REPO_ROOT, 'packages/knowledge-hub/dataset/.workflows')))
    expect(exclude.filter(e => !shipped.has(e))).toEqual([])
  })
})

describe('US-219 — a shipped artifact never points at something unshipped', () => {
  // Three instances of one defect, each found by an outside reader after I had checked:
  //   1. `analyze-pr-batch` invoked `/analyze-pr`, a personal skill (caught by the guard above)
  //   2. `pair-contract-generator.md` ran `workflows/contracts/…` after the rename
  //   3. `pair-implementer.md` cited an ADL and an issue number the dataset does not ship
  //
  // The mirror guard cannot see any of them: both copies are equally wrong. This one reads
  // the references OUT of the shipped agents and resolves each against what actually ships.
  const agentsDir = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.agents')
  const datasetRoot = join(REPO_ROOT, 'packages/knowledge-hub/dataset')

  it('every dataset-relative path an agent names exists in the dataset', () => {
    const missing: string[] = []
    for (const file of listFiles(agentsDir)) {
      const src = readFileSync(join(agentsDir, file), 'utf-8')
      // Backticked paths rooted at a dataset directory — the shape these files use to point
      // a reader at a document.
      for (const m of src.matchAll(/`((?:\.pair|\.claude|\.github)\/[^`\s]+\.[a-z]{2,4})`/g)) {
        const rel = m[1]!
        // `<story-id>` and friends are PATTERNS the agent fills in at runtime, not references
        // to a file that should exist. Only concrete paths are resolvable.
        if (rel.includes('<')) continue
        // `.claude/**` is INSTALLED output, not dataset content: it exists in an adopter's
        // repo after install, so it is resolved against this repo's root instead.
        const base = rel.startsWith('.claude/') ? REPO_ROOT : datasetRoot
        if (!existsSync(join(base, rel))) missing.push(`${file} -> ${rel}`)
      }
    }
    expect(
      missing,
      `shipped agents point at paths nobody receives:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('no shipped agent cites this repo issue numbers', () => {
    // `#256` means nothing in an adopter's tracker — at best it resolves to an unrelated
    // issue of theirs, which is worse than a dangling reference.
    const cited: string[] = []
    for (const file of listFiles(agentsDir)) {
      const src = readFileSync(join(agentsDir, file), 'utf-8')
      // `#<number>` is the documented placeholder form and stays; a literal number does not.
      for (const m of src.matchAll(/(?:^|\s)#(\d{2,4})\b/g)) cited.push(`${file} -> #${m[1]}`)
    }
    expect(cited, `shipped agents cite this repo's issues:\n  ${cited.join('\n  ')}`).toEqual([])
  })
})
