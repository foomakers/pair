import { describe, expect, it } from 'vitest'
import { workflowSchemaV1 } from '../grammar'
import { configurationSchemaV1 } from '../configuration'
import { kindByName } from '../kinds'
import { schemas, kinds, list } from './index'

describe('workflow authoring descriptions (AC-7)', () => {
  it('returns the schemas used by validation', () => {
    expect(schemas()).toEqual({ workflow: workflowSchemaV1, configuration: configurationSchemaV1 })
  })
  it('returns each validating kind contract without executable rules', () => {
    const result = kinds()
    expect(Object.keys(result)).toEqual(Object.keys(kindByName))
    for (const [name, kind] of Object.entries(kindByName)) {
      expect(result[name]).toMatchObject({
        inputs: kind.inputs,
        outputs: kind.outputs,
        with: kind.with,
        escalations: kind.escalations,
      })
      expect(JSON.parse(JSON.stringify(result[name]))).toEqual(result[name])
    }
  })
})

it('lists project and shipped workflow and configuration files with their sources (AC-7)', () => {
  const files = [
    {
      category: 'workflows',
      source: 'project',
      directory: '/repo/.pair/workflows',
      files: ['quick.yaml', 'custom.yml', 'notes.txt'],
    },
    {
      category: 'workflows',
      source: 'shipped',
      directory: '/dataset/workflows',
      files: ['quick.yaml'],
    },
    {
      category: 'configurations',
      source: 'project',
      directory: '/repo/.pair/configurations',
      files: ['local.yaml'],
    },
    {
      category: 'configurations',
      source: 'shipped',
      directory: '/dataset/configurations',
      files: ['default.yaml'],
    },
  ] as const
  expect(list(files)).toEqual({
    workflows: [
      { name: 'custom', file: '/repo/.pair/workflows/custom.yml', source: 'project' },
      { name: 'quick', file: '/repo/.pair/workflows/quick.yaml', source: 'project' },
      { name: 'quick', file: '/dataset/workflows/quick.yaml', source: 'shipped' },
    ],
    configurations: [
      { name: 'local', file: '/repo/.pair/configurations/local.yaml', source: 'project' },
      { name: 'default', file: '/dataset/configurations/default.yaml', source: 'shipped' },
    ],
  })
})
