import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { readGateRegistry, validate } from '@pair/workflows'
import { handleRunCommand } from './handler'
import { parseRunCommand } from './parser'
import { isSafePromptText } from './prompt-safety'
import type { WorkflowHostDependencies } from './workflow-host'

/**
 * #652 r0-2 — what pair ships agrees with what its page says about it.
 *
 * workflow-quick.md line 3: "It ships with pair and needs no configuration." While either copy of
 * the page (dataset source, generated mirror) says so, the shipped `quick.yaml` is valid against
 * the Custom Gate Registry of the shipped `way-of-working.md` template — the files a fresh install
 * has. The files read here are the shipped ones, never a twin.
 */

const REPO = join(__dirname, '../../../../..')
const DATASET = join(REPO, 'packages/knowledge-hub/dataset')
const WAY_OF_WORKING = '.pair/adoption/tech/way-of-working.md'
const QUICK = '.pair/adoption/tech/workflows/quick.yaml'
const PAGE = '.pair/knowledge/guidelines/collaboration/automation/workflow-quick.md'

const shipped = (path: string) => fs.readFileSync(join(DATASET, path))

/** The page, in either copy, still says the workflow needs no configuration. */
const claimsNoConfiguration = () =>
  [join(DATASET, PAGE), join(REPO, PAGE)].some(page =>
    /needs\s+no\s+configuration/i.test(fs.readFileSync(page)),
  )

let project: string
let lines: string[]

const write = (path: string, content: string) => {
  fs.mkdirSync(join(project, path, '..'), { recursive: true })
  fs.writeFileSync(join(project, path), content)
}

beforeEach(() => {
  project = fs.mkdtempSync(join(tmpdir(), 'pair-workflow-quick-shipped-'))
  lines = []
  const keep = (...args: unknown[]) => void lines.push(args.join(' '))
  vi.spyOn(console, 'log').mockImplementation(keep)
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(project, { recursive: true, force: true })
})

describe('the shipped quick workflow on the shipped adoption template (r0-2)', () => {
  it('w1 is valid against the template gate registry while its page says it needs no configuration', () => {
    const checked = validate(shipped(QUICK), QUICK, {
      skillExists: () => true,
      gateKeys: Object.keys(readGateRegistry(shipped(WAY_OF_WORKING))),
      launchInputs: ['card'],
      isSafeText: isSafePromptText,
    })

    expect(claimsNoConfiguration() ? checked.errors : []).toEqual([])
  })

  it('w2 passes pair run quick --dry-run on a fresh install while its page says it needs no configuration', async () => {
    write(WAY_OF_WORKING, shipped(WAY_OF_WORKING))
    write(QUICK, shipped(QUICK))
    for (const skill of ['pair-process-implement', 'pair-process-review', 'pair-process-fix'])
      write(`.claude/skills/${skill}/SKILL.md`, `# ${skill}\n`)
    const workflow: WorkflowHostDependencies = {
      runIteration: async () => {
        throw new Error('a dry run launched an agent')
      },
      readCard: async () => ({ title: 'A card' }),
      prepareWorktree: async ({ main, card }) => join(main, 'worktrees', card),
      engineAvailable: () => true,
    }

    const code = await handleRunCommand(
      parseRunCommand({ card: '1', cwd: project, dryRun: true }, ['quick']),
      fs,
      { workflow },
    )

    const refusals = lines.filter(line => /unknown gate key|Refused/.test(line))
    expect(claimsNoConfiguration() ? { code, refusals } : { code: 0, refusals: [] }).toEqual({
      code: 0,
      refusals: [],
    })
  })
})
