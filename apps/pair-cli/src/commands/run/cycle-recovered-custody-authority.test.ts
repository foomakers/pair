import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  expectCustodyRefusal,
  expectHistory,
  expectPendingFinding,
  fixtureRoot,
  grantOverride,
  headOf,
  pickUpDecisions,
  preparePackets,
  recoveryFixture,
  verify,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

// #687 r6-10: an accepted comment must cover the actual breach on both pickups.
it.each([
  ['wrong-path', { path: 'allowed.mjs' }],
  ['wrong-segment', { segment: 'r1-g2' }],
] as const)(
  'r6-10 unauthorized override %s',
  async (_name, target) => {
    const fixture = recoveryFixture(root, true, true, true)
    const comment = grantOverride(fixture, target)
    const decisions = pickUpDecisions(fixture)
    expect(decisions.errors).toEqual([])
    expect(decisions.recorded).toEqual([
      { decisionRef: comment.html_url, status: 'accepted', choice: 'override' },
    ])
    expect(
      JSON.parse(readFileSync(join(fixture.dir, 'custody-overrides.json'), 'utf8')),
    ).toMatchObject({
      overrides: [{ code: 'out-of-scope', decisionRef: comment.html_url, ...target }],
    })
    verify(fixture, 'breach')

    expectCustodyRefusal(fixture, await drive(fixture))
    const refused = headOf(fixture)
    expect(refused).not.toBe(fixture.local)
    verify(fixture, 'breach')
    expect.soft(preparePackets(fixture)).toHaveLength(0)
    expectPendingFinding(fixture)

    expectCustodyRefusal(fixture, await drive(fixture))
    expect.soft(preparePackets(fixture)).toHaveLength(0)
    expectPendingFinding(fixture)
    expect(headOf(fixture)).toBe(refused)
    expectHistory(fixture)
  },
  15_000,
)
