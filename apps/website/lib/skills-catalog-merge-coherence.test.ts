import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  checkCatalogContent,
  checkCatalogSync,
  collectSkills,
  findSkillCountMismatches,
  generateCatalogRows,
} from './docs-staleness-check'

// US-514 T-8: `SKILLS_SOURCE_REL` (+ `checkCatalogFreshness`) was check 2d's own export — removed
// with check 2d. This path is still the dataset skills tree every OTHER check here still gates
// against, so it stays local to this file rather than disappearing with the freshness check.
const SKILLS_SOURCE_REL = 'packages/knowledge-hub/dataset/.skills'

/**
 * r0-6 — the branch must MERGE into its base, and the merged skills catalog must still
 * satisfy the assertions `docs:staleness` makes about it.
 *
 * `apps/website/content/docs/reference/skills-catalog.mdx` is a DERIVED page: every row,
 * every "N skills" phrasing and the `Last updated` header are gated against
 * `packages/knowledge-hub/dataset/.skills/`. Two branches that each add a skill therefore
 * touch the same few lines and conflict — and a hand-resolved hunk can pick one side's
 * count while keeping the other side's rows, which is silent drift between the page and the
 * dataset. So this file asserts the merge RESULT, not the working tree: the three-way merge
 * of HEAD with the base is computed with `git merge-tree --write-tree`, and the catalog blob
 * of that merged tree is checked against the `.skills/` tree of that SAME merged tree.
 *
 * Degradation: a shallow CI checkout has no `origin/main` ref, so the base cannot be
 * resolved there. That case is reported loudly and asserted as the ONLY reason to stand
 * down — never a silent pass. It costs nothing: once the merge lands, HEAD *is* the merged
 * content and the repo's own `pnpm docs:staleness` step keeps checking it on every run.
 */

const REPO_ROOT = resolve(__dirname, '../../..')
const CATALOG_REL = 'apps/website/content/docs/reference/skills-catalog.mdx'
const BASE_REF = process.env.PAIR_MERGE_BASE_REF ?? 'origin/main'

function git(args: string[], cwd = REPO_ROOT): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim()
}

function tryGit(args: string[]): string | null {
  try {
    return git(args)
  } catch {
    return null
  }
}

/** The base commit this branch must merge into, or null when the clone cannot see it. */
function baseSha(): string | null {
  return tryGit(['rev-parse', '--verify', `${BASE_REF}^{commit}`])
}

type MergeResult = { tree: string; conflicts: string[]; clean: boolean; raw: string }

/**
 * `git merge-tree --write-tree <base> HEAD`. On a conflict git still WRITES a tree (with
 * conflict markers in the conflicted blobs) and exits non-zero, printing the tree oid on
 * line 1 and the `CONFLICT (...)` lines at the end — so both the cleanliness verdict and
 * the merged content come from one call.
 */
function mergeTree(base: string): MergeResult {
  let raw = ''
  let status = 0
  try {
    raw = execFileSync('git', ['merge-tree', '--write-tree', base, 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    })
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    raw = `${err.stdout ?? ''}${err.stderr ?? ''}`
    status = err.status ?? 1
  }
  const lines = raw.split('\n')
  const tree = (lines[0] ?? '').trim()
  const conflicts = lines.filter(l => l.startsWith('CONFLICT'))
  return { tree, conflicts, clean: status === 0 && conflicts.length === 0, raw }
}

/** A blob of any tree-ish, as text. */
function blob(treeish: string, pathRel: string): string {
  return execFileSync('git', ['show', `${treeish}:${pathRel}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
}

/**
 * The skill names a tree-ish carries, by the SAME rule collectSkills() applies to a
 * directory: `<category>/<name>/SKILL.md` is the skill `<name>`, and a category whose
 * SKILL.md sits at its root (a meta skill) is the skill `<category>`.
 */
function skillsOfTree(treeish: string): string[] {
  const out = git(['ls-tree', '-r', '--name-only', treeish, '--', `${SKILLS_SOURCE_REL}/`])
  const names: string[] = []
  for (const line of out.split('\n')) {
    if (!line.endsWith('/SKILL.md')) continue
    const parts = line.slice(SKILLS_SOURCE_REL.length + 1, -'/SKILL.md'.length).split('/')
    const name = parts.length >= 2 ? parts[1] : parts[0]
    if (name) names.push(name)
  }
  return names
}

/** Extract a tree-ish's `.skills/` subtree into a temp dir; returns that skills dir. */
function materializeSkills(treeish: string): { skillsDir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pair-merge-skills-'))
  const tar = join(dir, 'skills.tar')
  writeFileSync(
    tar,
    execFileSync('git', ['archive', '--format=tar', treeish, '--', `${SKILLS_SOURCE_REL}/`], {
      cwd: REPO_ROOT,
      maxBuffer: 512 * 1024 * 1024,
    }),
  )
  execFileSync('tar', ['-xf', tar, '-C', dir])
  return {
    skillsDir: join(dir, SKILLS_SOURCE_REL),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** Every catalog error `docs:staleness` would raise for one (catalog, skills-tree) pair. */
function catalogErrorsOf(treeish: string): string[] {
  const catalog = blob(treeish, CATALOG_REL)
  const skills = skillsOfTree(treeish)
  const { skillsDir, cleanup } = materializeSkills(treeish)
  try {
    return [
      ...checkCatalogSync(skills, catalog),
      ...checkCatalogContent(generateCatalogRows(skillsDir), catalog),
      ...findSkillCountMismatches(catalog, CATALOG_REL, skills.length),
    ]
  } finally {
    cleanup()
  }
}

const BASE = baseSha()
const MERGE = BASE === null ? null : mergeTree(BASE)

describe('r0-6 — the branch merges into its base and the merged catalog stays coherent', () => {
  it('the base ref is resolvable, or the ONLY reason it is not is a clone without it', () => {
    if (BASE !== null) {
      expect(BASE).toMatch(/^[0-9a-f]{40}$/)
      return
    }
    // Loud, and narrow: a full clone that cannot name its base is a real failure.
    const shallow = tryGit(['rev-parse', '--is-shallow-repository'])
    const partial = tryGit(['rev-parse', '--verify', 'HEAD']) === null
    console.warn(
      `r0-6: '${BASE_REF}' is not resolvable here (shallow=${shallow}) — the merge rows stand down; ` +
        'the merged content stays gated by `pnpm docs:staleness` on HEAD.',
    )
    expect(shallow === 'true' || partial).toBe(true)
  })

  it.runIf(BASE !== null)('r0-6 w1: HEAD merges into the base with no conflict', () => {
    expect(MERGE!.conflicts).toEqual([])
    expect(MERGE!.clean).toBe(true)
  })

  it.runIf(BASE !== null)(
    'r0-6 b1 (boundary): the merged catalog "N skills" phrasings match the merged skill count',
    () => {
      const merged = blob(MERGE!.tree, CATALOG_REL)
      const count = skillsOfTree(MERGE!.tree).length
      expect(findSkillCountMismatches(merged, CATALOG_REL, count)).toEqual([])
    },
  )

  it.runIf(BASE !== null)(
    'r0-6 b2 (boundary): the merged catalog lists exactly the merged .skills dirs, both directions',
    () => {
      const merged = blob(MERGE!.tree, CATALOG_REL)
      expect(checkCatalogSync(skillsOfTree(MERGE!.tree), merged)).toEqual([])
    },
  )

  it.runIf(BASE !== null)(
    'r0-6 b3 (boundary): every merged catalog row matches the row derived from the merged .skills',
    () => {
      const merged = blob(MERGE!.tree, CATALOG_REL)
      const { skillsDir, cleanup } = materializeSkills(MERGE!.tree)
      try {
        expect(checkCatalogContent(generateCatalogRows(skillsDir), merged)).toEqual([])
      } finally {
        cleanup()
      }
    },
  )

  it.runIf(BASE !== null)('r0-6 w2: the merged catalog carries no conflict markers', () => {
    const merged = blob(MERGE!.tree, CATALOG_REL)
    const markers = merged.split('\n').filter(l => /^(<{7}|={7}|>{7}|\|{7})(\s|$)/.test(l))
    expect(markers).toEqual([])
  })

  it('r0-6 c1 (control): HEAD alone is catalog-coherent — the branch is not the broken side', () => {
    const skillsDir = join(REPO_ROOT, SKILLS_SOURCE_REL)
    expect(existsSync(skillsDir)).toBe(true)
    const catalog = readFileSync(join(REPO_ROOT, CATALOG_REL), 'utf-8')
    const skills = collectSkills(skillsDir)
    expect(checkCatalogSync(skills, catalog)).toEqual([])
    expect(checkCatalogContent(generateCatalogRows(skillsDir), catalog)).toEqual([])
    expect(findSkillCountMismatches(catalog, CATALOG_REL, skills.length)).toEqual([])
  })

  it.runIf(BASE !== null)(
    'r0-6 c2 (control): the base alone is catalog-coherent — neither side is broken, the MERGE is',
    () => {
      const catalog = blob(BASE!, CATALOG_REL)
      const skills = skillsOfTree(BASE!)
      const { skillsDir, cleanup } = materializeSkills(BASE!)
      try {
        expect(checkCatalogSync(skills, catalog)).toEqual([])
        expect(checkCatalogContent(generateCatalogRows(skillsDir), catalog)).toEqual([])
        expect(findSkillCountMismatches(catalog, CATALOG_REL, skills.length)).toEqual([])
      } finally {
        cleanup()
      }
    },
  )

  it.runIf(BASE !== null)(
    'r0-6 i1 (interaction): a clean merge is not enough — the merged catalog raises zero catalog errors',
    () => {
      expect(catalogErrorsOf(MERGE!.tree)).toEqual([])
    },
  )
})
