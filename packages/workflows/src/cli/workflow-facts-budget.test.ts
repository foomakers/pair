import { operationTimeout } from './workflow-facts-budget'

it.each([
  ['head', undefined, 60_000],
  ['head', 12_000, 12_000],
  ['ci', 90_000, 30_000],
  ['merge', undefined, 180_000],
] as const)('bounds %s with timeout %s to %s ms', (action, timeout, expected) => {
  expect(operationTimeout(action, timeout)).toBe(expected)
})
