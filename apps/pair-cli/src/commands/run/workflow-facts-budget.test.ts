import { expect, it } from 'vitest'
import { operationTimeout } from './workflow-facts-budget'

it('allows post-merge closure longer than fact reads (#726)', () => {
  expect(operationTimeout('merge')).toBe(180_000)
  expect(operationTimeout('head')).toBe(30_000)
  expect(operationTimeout('ci', 1_000)).toBe(1_000)
  expect(operationTimeout('ci', 90_000)).toBe(30_000)
})
