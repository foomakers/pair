import { describe, it, expect } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
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
/**
 * A file the ROOT copy holds and the dataset does not. The mirror is one-directional (every
 * shipped file must exist at the root; the reverse is not required), so this is the only place
 * that says which root-only files are deliberate — and it is ENUMERATED rather than described,
 * because a contributor who finds a root-only file absent from the list has no way to tell
 * "deliberate exclusion" from "drift someone forgot to mirror", and the obvious repair (copy it
 * into `dataset/.workflows/`) is silent: the byte guard below goes green on two equal copies
 * while the dataset copy stops being runnable where it lands.
 */
type RootOnlyExclusion = {
  /** Why the file exists at the root and must NOT be copied into the dataset. */
  why: string
  /**
   * Specifiers the file resolves RELATIVE TO ITSELF which exist where it actually runs and do
   * NOT exist at the path it would occupy in the dataset. This turns "it cannot be mirrored"
   * from a claim into something the suite resolves on the real trees: the day one of them starts
   * resolving from the dataset too, the stated reason is gone and the check says so.
   */
  unresolvableIfMirrored?: string[]
}

type MirrorPair = {
  what: string
  dataset: string
  installed: string
  rootOnly: Record<string, RootOnlyExclusion>
}

const PAIRS: MirrorPair[] = [
  {
    what: 'workflows',
    dataset: 'packages/knowledge-hub/dataset/.workflows',
    installed: '.claude/workflows',
    rootOnly: {
      'pair-analyze-pr-batch.js': {
        why:
          'It dispatches its agents to `/analyze-pr`, a PERSONAL, user-level skill that exists in ' +
          "neither this repo's `.claude/skills/` nor the shipped dataset. Shipping it would install " +
          'a workflow whose agents are sent to a skill an adopter does not have; its ' +
          '`meta.whenToUse` states that prerequisite for the contributor who runs it here.',
      },
      'pair-analyze-pr-batch.test.mjs': {
        why:
          'Root-only for the same reason as its engine — a test file has nothing to drive without ' +
          "it. The two travel together, and the dataset's `pair-refine-batch.test.mjs` reads the " +
          'unshipped engine only when it is present, so the DATASET copy stays runnable (`node ' +
          '--test` in `dataset/.workflows/`, asserted there).',
      },
      'pair-contracts/cycle-coordinator.test.mjs': {
        why:
          'It runs from `.claude/workflows` ONLY — its `../../skills/pair-workflow-*` imports name ' +
          'the INSTALLED skill directories, which the dataset lays out under ' +
          '`.skills/workflow/<skill>/` instead, so a mirrored copy would resolve none of them and ' +
          'would not be runnable where it landed (its own header states this).',
        unresolvableIfMirrored: [
          '../../skills/pair-workflow-red-spec/scripts/cycle-state.mjs',
          '../../skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs',
          '../../skills/pair-workflow-cycle/SKILL.md',
          '../../../packages/knowledge-hub/dataset/',
        ],
      },
    },
  },
  {
    what: 'agent definitions',
    dataset: 'packages/knowledge-hub/dataset/.agents',
    installed: '.claude/agents',
    // No exemption exists here, and an empty record is the assertion: a root-only agent
    // definition is drift, not policy.
    rootOnly: {},
  },
]

/**
 * Every shipped file, RECURSIVELY — `pair-contracts/` still carries the dry-run tests and the contract cache's `.gitignore`; the scripts themselves ship inside the skills that run them since US-479 (`.skills/workflow/<skill>/scripts/*.mjs`). A dependency
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

/**
 * The files the root copy holds alone — the set the enumerated policy above must equal exactly.
 * Taken as a function of two directories so the same derivation runs against the real trees and
 * against an injected-regression copy of them.
 */
const rootOnlyFiles = (datasetDir: string, installedDir: string): string[] => {
  const shipped = new Set(listFiles(datasetDir))
  return listFiles(installedDir).filter(f => !shipped.has(f))
}

describe.each(PAIRS)(
  '$what: dataset and root copy are one artifact',
  ({ dataset, installed, rootOnly }) => {
    const datasetDir = join(REPO_ROOT, dataset)
    const installedDir = join(REPO_ROOT, installed)

    it('ships at least one file — an empty source would make every check below vacuous', () => {
      // Without this, deleting the dataset directory turns the whole suite green.
      expect(listFiles(datasetDir).length).toBeGreaterThan(0)
    })

    it('the root copy carries every dataset file — the dataset is the shipped subset', () => {
      // Direction matters. Every shipped file must exist at the root, or this repo is not
      // running what it ships. The reverse is NOT required — the deliberate root-only files are
      // enumerated in this pair's `rootOnly`, one rationale each, and the next check holds that
      // enumeration equal to reality.
      //
      // (The policy is recorded HERE, next to the guard that depends on it, rather than in a
      // dataset README: a README under `dataset/.workflows/` would itself install into every
      // adopter's `.claude/workflows/`.)
      const shipped = listFiles(datasetDir)
      const live = new Set(listFiles(installedDir))
      expect(shipped.filter(f => !live.has(f))).toEqual([])
    })

    it('the enumerated root-only exclusions are exactly the files the root copy holds alone', () => {
      // The check the prose version of this policy could not make. It fails in BOTH directions:
      //
      //   a root-only file nobody wrote a rationale for — the reader who finds it has to guess
      //   whether it is policy or drift, and the plausible guess ("mirror it") breaks the file:
      //   `pair-contracts/cycle-coordinator.test.mjs` copied into `dataset/.workflows/` resolves
      //   none of its `../../skills/pair-workflow-*` imports, and the byte guard above stays green
      //   the whole time because both copies are then equal;
      //
      //   a rationale for a file that is no longer root-only — it protects nothing and still reads
      //   as an authority.
      //
      // Not the same list as the `workflows` registry `exclude` (checked further below): that one
      // keeps DATASET test files out of an adopter's install and, by its own guard, may name only
      // files the dataset ships. A root-only file can never appear in it.
      expect(rootOnlyFiles(datasetDir, installedDir)).toEqual(Object.keys(rootOnly).sort())
    })

    it('every enumerated exclusion says why', () => {
      const silent = Object.entries(rootOnly)
        .filter(([, e]) => e.why.trim().length < 40)
        .map(([f]) => f)
      expect(
        silent,
        `root-only exclusions recorded without a usable reason: ${silent.join(', ')}`,
      ).toEqual([])
    })

    it('every file is byte-identical', () => {
      // NO file type is exempt, `*.test.mjs` included (regression of #495): `workflows:test` runs
      // `node --test` in `.claude/workflows/` ONLY, so the dataset's dry-run suites are never
      // executed where they live — this byte check is the only thing that keeps them equal to the
      // suites that do run. Exempting them turns the dataset copy into unexecuted, unverified text.
      for (const name of listFiles(datasetDir)) {
        const source = readFileSync(join(datasetDir, name), 'utf-8')
        const live = readFileSync(join(installedDir, name), 'utf-8')
        expect(
          live,
          `${installed}/${name} has drifted from the dataset — copy the dataset version`,
        ).toBe(source)
      }
    })
  },
)

describe('US-219 — the root-only exclusion policy is executable, not folklore', () => {
  it('an exclusion that claims unresolvable imports is checked against both locations', () => {
    const claims = PAIRS.flatMap(p =>
      Object.entries(p.rootOnly).flatMap(([file, e]) =>
        (e.unresolvableIfMirrored ?? []).map(
          spec => [p, file, spec] as [MirrorPair, string, string],
        ),
      ),
    )
    expect(
      claims.length,
      'no exclusion backs its rationale with a resolvable/unresolvable specifier — the reason is prose again',
    ).toBeGreaterThan(0)

    const wrong: string[] = []
    for (const [pair, file, spec] of claims) {
      const here = join(REPO_ROOT, pair.installed, file, '..', spec)
      const mirrored = join(REPO_ROOT, pair.dataset, file, '..', spec)
      if (!existsSync(here)) wrong.push(`${file}: ${spec} does not resolve where the file runs`)
      if (existsSync(mirrored))
        wrong.push(`${file}: ${spec} WOULD resolve from the dataset — the stated reason is stale`)
    }
    expect(wrong, wrong.join('\n  ')).toEqual([])
  })

  it('mirroring an excluded file into the dataset is caught — no other guard objects', () => {
    // The exact repair a contributor reaches for when the enumeration does not mention a
    // root-only file: copy it into `dataset/.workflows/`. Both pre-existing guards go GREEN on
    // it (the dataset is still a subset of the root; the two copies are byte-identical), while
    // the dataset copy resolves none of its imports. Run on COPIES, so proving it costs nothing.
    const pair = PAIRS.find(p => p.what === 'workflows')!
    const file = 'pair-contracts/cycle-coordinator.test.mjs'
    const tmp = mkdtempSync(join(tmpdir(), 'workflow-mirror-mirrored-'))
    try {
      const datasetCopy = join(tmp, 'dataset')
      const installedCopy = join(tmp, 'installed')
      cpSync(join(REPO_ROOT, pair.dataset), datasetCopy, { recursive: true })
      cpSync(join(REPO_ROOT, pair.installed), installedCopy, { recursive: true })
      cpSync(join(installedCopy, file), join(datasetCopy, file))

      const shipped = listFiles(datasetCopy)
      const live = new Set(listFiles(installedCopy))
      expect(shipped.filter(f => !live.has(f))).toEqual([])
      expect(readFileSync(join(datasetCopy, file), 'utf-8')).toBe(
        readFileSync(join(installedCopy, file), 'utf-8'),
      )

      expect(rootOnlyFiles(datasetCopy, installedCopy)).not.toContain(file)
      expect(() =>
        expect(rootOnlyFiles(datasetCopy, installedCopy)).toEqual(
          Object.keys(pair.rootOnly).sort(),
        ),
      ).toThrow()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('a fourth root-only file makes the enumeration check fail', () => {
    // The injected regression this policy exists to catch, run against a COPY of the real trees:
    // without it, "the enumeration equals reality" is satisfied by any list that happens to match
    // today, and nothing proves it would object tomorrow.
    const pair = PAIRS.find(p => p.what === 'workflows')!
    const tmp = mkdtempSync(join(tmpdir(), 'workflow-mirror-root-only-'))
    try {
      const datasetCopy = join(tmp, 'dataset')
      const installedCopy = join(tmp, 'installed')
      cpSync(join(REPO_ROOT, pair.dataset), datasetCopy, { recursive: true })
      cpSync(join(REPO_ROOT, pair.installed), installedCopy, { recursive: true })

      // The copy reproduces the real verdict — otherwise the injection below proves nothing.
      expect(rootOnlyFiles(datasetCopy, installedCopy)).toEqual(Object.keys(pair.rootOnly).sort())

      writeFileSync(join(installedCopy, 'pair-contracts', 'injected-regression.test.mjs'), '// x\n')

      expect(rootOnlyFiles(datasetCopy, installedCopy).filter(f => !(f in pair.rootOnly))).toEqual([
        'pair-contracts/injected-regression.test.mjs',
      ])
      expect(() =>
        expect(rootOnlyFiles(datasetCopy, installedCopy)).toEqual(
          Object.keys(pair.rootOnly).sort(),
        ),
      ).toThrow()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
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
      // TWO forms, because the corpus uses both and covering only one is how `/analyze-pr`
      // got through: bolded `**/name**` and backticked `` `/name` ``. A bare `/word` stays
      // out — it is usually a path fragment, and matching it would make this guard noise.
      for (const m of src.matchAll(/\*\*\/([a-z][a-z0-9-]+)\*\*/g)) invoked.add(m[1]!)
      for (const m of src.matchAll(/`\/([a-z][a-z0-9-]{3,})`/g)) invoked.add(m[1]!)
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
  // the references OUT of the shipped artifacts and resolves each against what actually ships.
  //
  // Instances 4 and 5 were found by the NEXT reviewer, in the half this guard did not scan:
  // `pair-refine-batch.js` cited an ADL by filename inside a runtime PROMPT, and
  // `pair-contracts/{ensure-contract.mjs,.gitignore}` cited an ADR the dataset has no
  // directory for. Scanning `.agents` only was the reason review round 5, not CI, caught them.
  // Both shipped trees are scanned now — a workflow is as adopter-facing as an agent.
  const agentsDir = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.agents')
  const workflowsDataset = join(REPO_ROOT, 'packages/knowledge-hub/dataset/.workflows')
  const datasetRoot = join(REPO_ROOT, 'packages/knowledge-hub/dataset')
  // [dir, file] over every artifact that actually INSTALLS, of both kinds.
  //
  // The registry's `exclude` list is applied here rather than ignored: the dry-run suites live
  // in the dataset (they are the dogfood copy's tests) but no adopter ever receives them, so
  // scanning them would fail these guards for references that reach nobody — and it would make
  // the guards' own subject wrong. `installs` is the invariant word in all three checks below;
  // "is in the dataset directory" is not the same thing. The exclude list itself is kept
  // complete and free of stale entries by the two checks in the section above.
  const workflowExcludes: string[] =
    (
      JSON.parse(readFileSync(join(REPO_ROOT, 'apps/pair-cli/config.json'), 'utf-8')) as {
        asset_registries: Record<string, { exclude?: string[] }>
      }
    ).asset_registries['workflows']?.exclude ?? []
  const shippedArtifacts = (): [string, string][] => [
    ...listFiles(agentsDir).map(f => [agentsDir, f] as [string, string]),
    ...listFiles(workflowsDataset)
      .filter(f => !workflowExcludes.includes(f))
      .map(f => [workflowsDataset, f] as [string, string]),
  ]

  it('every dataset-relative path a shipped artifact names exists in the dataset', () => {
    const missing: string[] = []
    for (const [dir, file] of shippedArtifacts()) {
      const src = readFileSync(join(dir, file), 'utf-8')
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
      `shipped artifacts point at paths nobody receives:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('no shipped artifact cites a decision record by filename', () => {
    // The dataset ships no decision-log entries and no `tech/adr/` content — `.keep` and one
    // unrelated example are the whole of it. So citing `2026-08-12-….md` or `adr-016-….md`
    // from a shipped file is broken BY CONSTRUCTION, no matter which record it names: the
    // adopter has none of them. The remedy is always the same — state the RULE inline, so it
    // stands on its own for a reader who has never seen this repo's decision log.
    const cited: string[] = []
    for (const [dir, file] of shippedArtifacts()) {
      const src = readFileSync(join(dir, file), 'utf-8')
      for (const m of src.matchAll(
        /\b(\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md|adr-\d{3}-[a-z0-9-]+\.md)/g,
      ))
        cited.push(`${file} -> ${m[1]}`)
    }
    expect(
      cited,
      `shipped artifacts cite decision records the dataset does not ship:\n  ${cited.join('\n  ')}`,
    ).toEqual([])
  })

  it('no shipped artifact cites this repo issue numbers where an adopter can read them', () => {
    // `#256` means nothing in an adopter's tracker — at best it resolves to an unrelated
    // issue of theirs, which is worse than a dangling reference.
    //
    // Scanned over BOTH shipped trees, not `.agents` alone: a workflow's `meta.description` /
    // `meta.whenToUse` and its dispatched prompt strings are as adopter-facing as an agent
    // definition — `whenToUse` is the ONLY contract an adopter reads for a workflow.
    //
    // A workflow's source COMMENTS are deliberately out of scope, and this is the one
    // exception in this suite. They carry the measured rationale for each guard ("#401: the
    // input is validated LOUDLY", "measured in review round 7") — engineering history that a
    // maintainer reading the source wants and that no agent, adopter-side or otherwise, is
    // ever shown: nothing interpolates a comment into a prompt. Stripping the numbers there
    // would delete the provenance of every rule without making anything reachable safer. So
    // the line is drawn at REACHABILITY, not at the file: a citation may live in a comment,
    // never in a string an adopter or their agent reads.
    const inComment = (line: string) => /^\s*(?:\/\/|\*|\/\*)/.test(line)
    const cited: string[] = []
    for (const [dir, file] of shippedArtifacts()) {
      const src = readFileSync(join(dir, file), 'utf-8')
      src.split('\n').forEach((line, i) => {
        if (file.endsWith('.js') || file.endsWith('.mjs')) {
          if (inComment(line)) return
        }
        // `#<number>` is the documented placeholder form and stays; a literal number does not.
        for (const m of line.matchAll(/(?:^|\s)#(\d{2,4})\b/g))
          cited.push(`${file}:${i + 1} -> #${m[1]}`)
      })
    }
    expect(
      cited,
      `shipped artifacts cite this repo's issues where an adopter reads them:\n  ${cited.join('\n  ')}`,
    ).toEqual([])
  })
})
