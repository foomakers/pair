import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  expectHistory,
  fixtureRoot,
  grantOverride,
  headOf,
  installedCycle,
  newerReviewedHead,
  pinLegacyMemo,
  preparePackets,
  recoveryFixture,
  recoveryRead,
  resolveFrom,
  resolverCopies,
  runSync,
  verify,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

it('r6-10 control superseding review wins against an earlier memo for its descendant', () => {
  const fixture = recoveryFixture(root, true, true, false)
  const reviewed = newerReviewedHead(fixture)
  const synced = runSync(fixture).head
  expect(synced).not.toBe(reviewed)
  pinLegacyMemo(fixture, '2000-01-02T00:00:00.000Z', synced)
  expect(resolveFrom(fixture)).toMatchObject({ step: 'prepare', phase: 'r3-g1', base: reviewed })
}, 15_000)

it('r6-10 control recovery budget refuses work before it is admitted', async () => {
  const fixture = recoveryFixture(root, true, true, true)
  const stop = await drive(fixture, 0)
  expect(stop).toMatchObject({ status: 'awaiting-human', stagesRun: 0 })
  expect(stop.reason).toContain('autoRecoveryRounds (0) spent')
  expect(fixture.readPackets()).toHaveLength(0)
  expect(recoveryRead(fixture).baseSynced).toBeUndefined()
  expect(headOf(fixture)).toBe(fixture.local)
}, 15_000)

it('r6-10 control admitted recovery is visible to every resolver entry point', async () => {
  const fixture = recoveryFixture(root, true, true, false)
  expect((await drive(fixture)).stagesRun).toBe(1)
  const synced = headOf(fixture)
  verify(fixture, 'clean')
  for (const { name, script } of resolverCopies) {
    expect(resolveFrom(fixture, script), name).toMatchObject({ step: 'prepare', base: synced })
  }
  expect(resolveFrom(fixture, installedCycle, 'function')).toMatchObject({
    step: 'prepare',
    base: synced,
  })
}, 15_000)

it('r6-10 control a recorded maintainer override still passes custody for recovery', async () => {
  const fixture = recoveryFixture(root, true, true, true)
  verify(fixture, 'breach')
  grantOverride(fixture)
  expect((await drive(fixture)).stagesRun).toBe(1)
  verify(fixture, 'overridden')
  const approved = headOf(fixture)
  expect(resolveFrom(fixture)).toMatchObject({ step: 'prepare', phase: 'r2-g1', base: approved })
  expect((await drive(fixture)).stagesRun).toBe(1)
  const packets = preparePackets(fixture)
  expect(packets).toHaveLength(2)
  for (const packet of packets) expect(packet.at(-1)).toContain(`$phase=r2-g1 $head=${approved}`)
  expectHistory(fixture)
}, 15_000)
