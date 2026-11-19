import { afterEach, beforeEach, expect, it, vi } from 'vitest'
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
  resolveFrom,
  verify,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

// #687 r6-10: revocation must invalidate eligibility even for a previously admitted SHA.
it.each(['comment-deleted', 'comment-edited'] as const)(
  'r6-10 revoked override %s',
  async reason => {
    const fixture = recoveryFixture(root, true, true, true)
    const comment = grantOverride(fixture)
    const decisions = pickUpDecisions(fixture)
    expect(decisions.errors).toEqual([])
    expect(decisions.recorded).toEqual([
      { decisionRef: comment.html_url, status: 'accepted', choice: 'override' },
    ])
    expect((await drive(fixture)).stagesRun).toBe(1)
    const previouslyAdmitted = headOf(fixture)
    verify(fixture, 'overridden')
    expect(resolveFrom(fixture)).toMatchObject({ step: 'prepare', base: previouslyAdmitted })
    const admittedPackets = preparePackets(fixture)
    expect(admittedPackets).toHaveLength(1)
    expect(admittedPackets[0]?.at(-1)).toContain(`$phase=r2-g1 $head=${previouslyAdmitted}`)

    const comments =
      reason === 'comment-deleted' ? [] : [{ ...comment, updated_at: '2000-01-03T00:00:00.000Z' }]
    vi.stubEnv('FIXTURE_COMMENTS', JSON.stringify(comments))
    const revoked = pickUpDecisions(fixture)
    expect(revoked.errors).toEqual([])
    expect(revoked.revoked).toEqual([{ decisionRef: comment.html_url, reason }])
    verify(fixture, 'breach')
    expectPendingFinding(fixture)

    expectCustodyRefusal(fixture, await drive(fixture))
    expect.soft(preparePackets(fixture)).toEqual(admittedPackets)
    expectPendingFinding(fixture)
    expect(headOf(fixture)).toBe(previouslyAdmitted)
    expectHistory(fixture)
  },
  15_000,
)
