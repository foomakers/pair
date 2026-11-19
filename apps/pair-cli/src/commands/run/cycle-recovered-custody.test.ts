import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  expectCustodyRefusal,
  expectHistory,
  expectPendingFinding,
  fixtureRoot,
  headOf,
  installedCycle,
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

// #687 r6-10: verify a real sealed run, then let the production driver attempt preparation twice.
it.each([
  ['merge-restart', true],
  ['up-to-date-restart', false],
] as const)(
  'r6-10 regression %s',
  async (_name, moved) => {
    const fixture = recoveryFixture(root, true, moved, true)
    verify(fixture, 'breach')
    expectCustodyRefusal(fixture, await drive(fixture))
    const refused = headOf(fixture)
    expectHistory(fixture)
    verify(fixture, 'breach')
    expect.soft(preparePackets(fixture)).toHaveLength(0)
    const recovery = recoveryRead(fixture)
    expect(
      (recovery.rounds ?? []).filter(round => round.kind === 'base-sync').length,
    ).toBeLessThanOrEqual(1)
    expectPendingFinding(fixture)

    expectCustodyRefusal(fixture, await drive(fixture))
    expect.soft(preparePackets(fixture)).toHaveLength(0)
    expectPendingFinding(fixture)
    expect(headOf(fixture)).toBe(refused)
    expectHistory(fixture)
  },
  15_000,
)

it('r6-10 regression legacy memo is refused by every resolver entry point', () => {
  const fixture = recoveryFixture(root, true, true, true)
  expect(runSync(fixture).synced).toBe(true)
  verify(fixture, 'breach')
  const refused = headOf(fixture)
  // Older binaries wrote this memo before they checked custody.
  pinLegacyMemo(fixture)
  expect(recoveryRead(fixture).baseSynced?.head).toBe(refused)
  for (const { name, script } of resolverCopies) {
    const next = resolveFrom(fixture, script)
    expect.soft(next?.step === 'prepare' ? next['base'] : undefined, name).not.toBe(refused)
  }
  const next = resolveFrom(fixture, installedCycle, 'function')
  expect
    .soft(next?.step === 'prepare' ? next['base'] : undefined, 'exported resolve')
    .not.toBe(refused)
  expectHistory(fixture)
}, 15_000)
