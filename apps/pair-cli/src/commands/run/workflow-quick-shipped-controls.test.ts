import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { parse } from 'yaml'
import { fileSystemService as fs } from '@pair/content-ops'
import { readGateRegistry, readGateTargets, validate } from '@pair/workflows'
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
    gateTargets: Object.keys(readGateTargets(read(root, WAY_OF_WORKING))),
    launchInputs: ['card'],
    isSafeText: isSafePromptText,
  }).errors

const commandGates = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, child]) =>
      (key === 'gates' &&
        Array.isArray(child) &&
        child.some(item => typeof item === 'string' && item.startsWith('command:'))) ||
      commandGates(child),
  )
}

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

  it('c6 no shipped workflow carries a command: gate (ADR-036)', () => {
    const dir = '.pair/adoption/tech/workflows'
    const files = fs.readdirSync(join(DATASET, dir)).map(f => join(dir, f.name))
    const direct = files.filter(f => commandGates(parse(read(DATASET, f))))

    expect(direct).toEqual([])
    expect(commandGates(parse("steps: {check: {gates: ['command:echo ok']}}"))).toBe(true)
    expect(commandGates(parse('steps: {check: {gates: [target:pr]}}'))).toBe(false)
  })
})
