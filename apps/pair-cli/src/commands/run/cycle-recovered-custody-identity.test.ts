import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  expectHistory,
  fixtureRoot,
  headOf,
  moveAdmittedMemo,
  preparePackets,
  recoveryFixture,
  recoveryRead,
  resolveFrom,
  stalePreparation,
  verify,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

it('r6-10 regression a memo cannot transfer custody to a different head', async () => {
  const fixture = recoveryFixture(root, true, true, false)
  expect((await drive(fixture)).stagesRun).toBe(1)
  const clean = headOf(fixture)
  verify(fixture, 'clean')
  expect(resolveFrom(fixture)).toMatchObject({ step: 'prepare', base: clean })
  const changed = moveAdmittedMemo(fixture)
  expect(recoveryRead(fixture).baseSynced?.head).toBe(changed)
  verify(fixture, 'breach')
  const next = resolveFrom(fixture)
  expect(next?.step === 'prepare' ? next['base'] : undefined).not.toBe(changed)
  expectHistory(fixture)
}, 15_000)

it('r6-10 regression a recorded stale refusal cannot admit an unchecked up-to-date head', async () => {
  const fixture = recoveryFixture(root, true, false, true)
  stalePreparation(fixture)
  expect(resolveFrom(fixture)).toMatchObject({
    step: 'prepare',
    phase: 'r2-g1',
    attempt: 2,
    base: fixture.reviewed,
  })
  verify(fixture, 'breach')
  await drive(fixture)
  expect(preparePackets(fixture)).toHaveLength(0)
}, 15_000)
