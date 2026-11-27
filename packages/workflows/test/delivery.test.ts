import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validate } from '../src/validate'

it('ships delivery and full with the approved expansion (#700 AC-1, AC-2, AC-6)', () => {
  const dir = resolve(__dirname, '../../knowledge-hub/dataset/.pair/adoption/tech/workflows')
  const source = (name: string) => readFileSync(resolve(dir, `${name}.yaml`), 'utf8')
  const result = validate(source('full'), 'full.yaml', {
    skillExists: name => name !== 'refinement' && name !== 'delivery',
    gateKeys: ['gate-pr', 'target:pr'],
    launchInputs: ['card'],
    isSafeText: () => true,
    resolveWorkflow: name => ({ file: `${name}.yaml`, text: source(name) }),
  })
  expect(source('delivery')).not.toContain('gates: [gate-pr]')
  expect(result.errors).toEqual([])
  expect(result.workflow?.steps.map(step => step.id)).toEqual([
    'refinement/refine',
    'refinement/tasks',
    'delivery/implement',
    'delivery/rounds',
    'delivery/checks',
    'delivery/approve',
    'delivery/merge',
  ])
})
