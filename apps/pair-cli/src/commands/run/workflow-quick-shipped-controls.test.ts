import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { fileSystemService as fs } from '@pair/content-ops'
import { readGateRegistry, validate } from '@pair/workflows'
import { isSafePromptText } from './prompt-safety'

/**
 * #652 r0-2 — what already holds around the shipped quick workflow, and must keep holding whichever
 * way the shipped files are aligned (a registry row, other gates, or the page's claim).
 */

const REPO = join(__dirname, '../../../../..')
const DATASET = join(REPO, 'packages/knowledge-hub/dataset')
const WAY_OF_WORKING = '.pair/adoption/tech/way-of-working.md'
const QUICK = '.pair/adoption/tech/workflows/quick.yaml'
const PAGE = '.pair/knowledge/guidelines/collaboration/automation/workflow-quick.md'

const read = (root: string, path: string) => fs.readFileSync(join(root, path))

const errorsOf = (root: string) =>
  validate(read(root, QUICK), QUICK, {
    skillExists: () => true,
    gateKeys: Object.keys(readGateRegistry(read(root, WAY_OF_WORKING))),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
  }).errors

describe('the shipped quick workflow: what already holds (r0-2)', () => {
  it('c1 the generated mirror of the page is the dataset page', () => {
    expect(read(REPO, PAGE)).toBe(read(DATASET, PAGE))
  })

  it('c2 the file the page shows is the shipped file', () => {
    const shown = /^## The file\n+```yaml\n([\s\S]*?)```/m.exec(read(DATASET, PAGE))?.[1]

    expect(shown).toBe(read(DATASET, QUICK))
  })

  it("c3 this repository's copy is valid against this repository's gate registry", () => {
    expect(errorsOf(REPO)).toEqual([])
  })

  it('c4 the shipped file has no error but a gate key the template registry lacks', () => {
    expect(
      errorsOf(DATASET).filter(error => !error.problem.startsWith('unknown gate key')),
    ).toEqual([])
  })

  it('c5 the template registry row is still read as a gate', () => {
    expect(readGateRegistry(read(DATASET, WAY_OF_WORKING))).toMatchObject({
      formatting: 'pnpm format:check',
    })
  })
})
