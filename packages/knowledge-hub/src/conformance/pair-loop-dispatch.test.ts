import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const dispatcher = join(
  __dirname,
  '../../dataset/.skills/workflow/cycle/scripts/loop-workflow-dispatch.mjs',
)

function request(input: object) {
  return JSON.parse(
    execFileSync(process.execPath, [dispatcher], {
      input: JSON.stringify(input),
      encoding: 'utf8',
    }),
  )
}

describe('pair-loop skill workflow dispatch', () => {
  it('forwards the exact policy and explicit CLI state order to the Workflow boundary', () => {
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

  it('preserves omitted arguments and maps the remaining public flags without inventing defaults', () => {
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
})
