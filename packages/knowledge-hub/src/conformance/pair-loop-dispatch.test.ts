import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dispatcher = join(
  __dirname,
  '../../dataset/.skills/workflow/cycle/scripts/loop-workflow-dispatch.mjs',
)
const options = [
  ['--root', 'root'],
  ['--filter', 'filter'],
  ['--assignee', 'assignee'],
  ['--status', 'status'],
  ['--parallel', 'parallel'],
  ['--state-order', 'stateOrder'],
  ['--max-iterations', 'maxIterations'],
  ['--until', 'until'],
  ['--prepare', 'prepare'],
  ['--merge', 'merge'],
  ['--predicate', 'predicateOverride'],
  ['--iteration', 'startIteration'],
] as const

function run(input: object) {
  return spawnSync(process.execPath, [dispatcher], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
  })
}

function request(input: object) {
  const result = run(input)
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout)
}

describe('pair-loop skill workflow dispatch', () => {
  it('r2-3-C1 omits absent state order and preserves other options', () => {
    expect(
      request({
        policyText: '',
        options: { '--filter': '*', '--predicate': 'tag:risk:red ⇒ Done', '--iteration': 3 },
      }),
    ).toEqual({
      name: 'pair-loop',
      args: {
        policyText: '',
        filter: '*',
        predicateOverride: 'tag:risk:red ⇒ Done',
        startIteration: 3,
      },
    })
  })

  it('r2-3-C2 forwards valid state order and policy', () => {
    const policyText = '## Delivery State Order\nReady,Ready,Review\n'
    expect(
      request({
        policyText,
        options: { '--root': '605', '--state-order': 'Review,In Progress,Ready', '--parallel': 2 },
      }),
    ).toEqual({
      name: 'pair-loop',
      args: { policyText, root: '605', stateOrder: 'Review,In Progress,Ready', parallel: 2 },
    })
  })

  it('r2-3-W1 rejects explicit null state order', () => {
    const result = run({ policyText: '', options: { '--state-order': null } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('--state-order')
    expect(result.stdout).toBe('')
  })

  it('r2-3-I1 rejects null even with valid adopted order', () => {
    const policyText = '## Delivery State Order\nReview,In Progress,Ready\n'
    expect(request({ policyText, options: {} })).toEqual({
      name: 'pair-loop',
      args: { policyText },
    })
    const result = run({ policyText, options: { '--state-order': null } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('--state-order')
    expect(result.stdout).toBe('')
  })

  it('r2-3-C3 omits explicit undefined in direct workflowRequest call', async () => {
    const { workflowRequest } = await import(/* @vite-ignore */ dispatcher)
    expect(workflowRequest({ policyText: '', options: { '--state-order': undefined } })).toEqual({
      name: 'pair-loop',
      args: { policyText: '' },
    })
  })

  it('r2-3-C4 rejects unknown option', () => {
    const result = run({ policyText: '', options: { '--unknown': true } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('unknown loop option: --unknown')
    expect(result.stdout).toBe('')
  })

  it('r2-3-R1 installed dispatcher matches dataset', () => {
    const installed = join(
      __dirname,
      '../../../../.claude/skills/pair-workflow-cycle/scripts/loop-workflow-dispatch.mjs',
    )
    expect(readFileSync(installed)).toEqual(readFileSync(dispatcher))
  })

  it.each(options)('r2-3-V1 rejects null for %s', option => {
    const result = run({ policyText: '', options: { [option]: null } })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(option)
    expect(result.stdout).toBe('')
  })

  it('r2-3-P1 rejects non-string policyText', () => {
    const result = run({ policyText: 17, options: {} })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('policyText must be a string')
    expect(result.stdout).toBe('')
  })

  it.each(options)('r2-3-O1 forwards non-null %s to %s', (option, argument) => {
    expect(request({ policyText: '', options: { [option]: 'value' } })).toEqual({
      name: 'pair-loop',
      args: { policyText: '', [argument]: 'value' },
    })
  })

  it('r2-3-X1 forwards optional extensions and root', () => {
    expect(
      request({
        policyText: '',
        options: { '--root': '611' },
        overrides: { a: 1 },
        tagProjectionFamily: 'tags',
      }),
    ).toEqual({
      name: 'pair-loop',
      args: { policyText: '', root: '611', overrides: { a: 1 }, tagProjectionFamily: 'tags' },
    })
    expect(request({ policyText: '', options: { '--root': '611' } })).toEqual({
      name: 'pair-loop',
      args: { policyText: '', root: '611' },
    })
  })
})
