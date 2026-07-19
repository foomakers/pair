import { join } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { validatePathOps } from '@pair/content-ops'

const ROOT = join(__dirname, '..', '..')
const DATASET = join(ROOT, 'dataset')
// Repo root is two levels above this package (packages/knowledge-hub -> repo root).
const REPO_ROOT = join(ROOT, '..', '..')
// The GENERATED knowledge-base mirror in the root install tree. `pair update`
// regenerates it from the dataset (mirror behavior); its links must resolve,
// notably .pair/knowledge/skills-guide.md -> ../../.claude/skills/pair-*/SKILL.md.
// Scoped to knowledge/ (not all of .pair/): .pair/adoption/ is user-owned
// `add`-behavior content pair update never regenerates, with its own,
// pre-existing link state that is out of scope for this generated-tree gate.
const ROOT_KNOWLEDGE = join(REPO_ROOT, '.pair', 'knowledge')
const ERRORS_PATH = join(ROOT, 'errors.txt')
const ROOT_ERRORS_PATH = join(ROOT, 'errors-root.txt')
const EXCLUSION_LIST: string[] = [
  '.pair/adoption/product/backlog/',
  '01-initiatives/2025/core-data-pipeline.md',
  '02-epics/in-progress/01-01-data-ingestion-pipeline.md',
  '03-user-stories/in-progress/01-01-001-user-registration.md',
  '03-user-stories/not-started/01-01-002-email-verification.md',
  '.pair/adoption/tech/[affected-file].md',
  'LINK',
]

export function parseOptions(arg?: string) {
  if (!arg) return undefined
  try {
    return JSON.parse(arg)
  } catch {
    void 0
  }
  try {
    const content = fileSystemService.readFileSync(arg)
    return JSON.parse(content)
  } catch (err) {
    throw new Error(`Failed to parse options from arg: ${String(err)}`)
  }
}

type CheckLinksConfig = {
  datasetRoot: string
  errorsPath: string
  exclusionList: string[]
  checkOnly?: boolean
}

async function runCheckLinks(config: CheckLinksConfig) {
  return validatePathOps(fileSystemService, config)
}

/**
 * Runs the link check across every configured root, printing each root's logs.
 * Exits non-zero if ANY root has unresolved links (LINK TARGET NOT FOUND /
 * BAD LINK FORMAT) — this is what makes it a CI gate: a broken generated link
 * in the root .pair/ tree fails the build, not just the dataset source.
 */
async function runAllChecks(roots: CheckLinksConfig[]): Promise<void> {
  let hadErrors = false
  for (const cfg of roots) {
    console.log(`\nChecking markdown links under: ${cfg.datasetRoot}`)
    const result = await runCheckLinks(cfg)
    result.logs.forEach((msg: string) => console.log(msg))
    if (result.allErrors.length > 0) hadErrors = true
  }
  if (hadErrors) process.exit(1)
}

if (require.main === module) {
  const [datasetRootArg, errorsPathArg, optionsArg] = process.argv.slice(2)
  const options = parseOptions(optionsArg)

  // With an explicit root arg, scan just that root (backward compatible).
  // With no arg (the `check:links` script), gate BOTH the dataset source AND
  // the generated root .pair/ tree.
  const roots: CheckLinksConfig[] = datasetRootArg
    ? [
        {
          datasetRoot: datasetRootArg,
          errorsPath: errorsPathArg || ERRORS_PATH,
          exclusionList: EXCLUSION_LIST,
        },
      ]
    : [
        { datasetRoot: DATASET, errorsPath: ERRORS_PATH, exclusionList: EXCLUSION_LIST },
        // Read-only gate over the generated KB mirror: report broken links,
        // never rewrite the generated files (a gate must not mutate its target).
        {
          datasetRoot: ROOT_KNOWLEDGE,
          errorsPath: ROOT_ERRORS_PATH,
          exclusionList: EXCLUSION_LIST,
          checkOnly: true,
        },
      ]

  const configs = roots.map(r => Object.assign(r, options || {}) as CheckLinksConfig)

  runAllChecks(configs).catch(err => {
    console.error('Error checking markdown links:', err)
    process.exit(1)
  })
} else {
  // allow importing the module without executing
}
