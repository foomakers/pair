import { join } from 'path'
import { fileSystemService } from '@pair/content-ops'
import { validatePathOps } from '@pair/content-ops'

const ROOT = join(__dirname, '..')
const DATASET = join(ROOT, 'dataset')
const ERRORS_PATH = join(ROOT, 'errors.txt')
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

type CheckLinksConfig = { datasetRoot: string; errorsPath: string; exclusionList: string[] }

async function runCheckLinks(config: CheckLinksConfig) {
  return validatePathOps(fileSystemService, config)
}

if (require.main === module) {
  const [datasetRootArg, errorsPathArg, optionsArg] = process.argv.slice(2)

  const datasetRoot = datasetRootArg || DATASET
  const errorsPath = errorsPathArg || ERRORS_PATH
  const options = parseOptions(optionsArg)

  const cfg: CheckLinksConfig = Object.assign(
    { datasetRoot, errorsPath, exclusionList: EXCLUSION_LIST },
    options || {},
  ) as CheckLinksConfig

  runCheckLinks(cfg)
    .then(result => {
      result.logs.forEach((msg: string) => console.log(msg))
    })
    .catch(err => {
      console.error('Error checking markdown links:', err)
      process.exit(1)
    })
} else {
  // allow importing the module without executing
}
