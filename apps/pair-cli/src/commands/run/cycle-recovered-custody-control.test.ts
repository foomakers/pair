import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  dispose,
  drive,
  expectHistory,
  fixtureRoot,
  headOf,
  recoveryFixture,
  recoveryRead,
  resolveFrom,
  verify,
} from './fixtures/recovered-custody'

let root: string
beforeEach(() => {
  root = fixtureRoot()
})
afterEach(() => dispose(root))

it.each([
  ['sealed-merge', true, true],
  ['sealed-up-to-date', true, false],
  ['unsealed-merge', false, true],
  ['unsealed-up-to-date', false, false],
] as const)(
  'r6-10 control %s',
  async (name, sealed, moved) => {
    const fixture = recoveryFixture(root, sealed, moved, false)
    const first = await drive(fixture)
    const synced = headOf(fixture)
    expectHistory(fixture)
    verify(fixture, sealed ? 'clean' : 'unsealed')
    expect(first.stagesRun).toBe(1)
    expect(fixture.readPackets()[0]?.at(-1)).toContain(`$phase=r2-g1 $head=${synced}`)
    expect(recoveryRead(fixture).baseSynced?.head).toBe(synced)
    expect(resolveFrom(fixture)).toMatchObject({ step: 'prepare', phase: 'r2-g1', base: synced })
    if (name === 'sealed-merge') {
      expect((await drive(fixture)).stagesRun).toBe(1)
      expect(fixture.readPackets()[1]?.at(-1)).toContain(`$phase=r2-g1 $head=${synced}`)
    }
  },
  15_000,
)
