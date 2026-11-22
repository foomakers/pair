import { runMerge, type MergeAdapter } from '.'

const adapter = (over: Partial<MergeAdapter> = {}) => {
  const closed: string[] = []
  const merged: [number, string][] = []
  const full: MergeAdapter = {
    head: async () => 'h1',
    merge: async (pr, method) => (merged.push([pr, method]), { ok: true, commit: 'c1' }),
    close: async card => void closed.push(card),
    ...over,
  }
  return { full, closed, merged }
}
const input = { card: '680', pr: 7, head: 'h1' }

describe('merge (#680 AC-5)', () => {
  it('merges with squash by default, closes the card, returns the merge commit', async () => {
    const { full, closed, merged } = adapter()
    expect(await runMerge(input, full)).toMatchObject({
      status: 'ok',
      merged: true,
      mergeCommit: 'c1',
    })
    expect(merged).toEqual([[7, 'squash']])
    expect(closed).toEqual(['680'])
  })
  it('uses the method it is given', async () => {
    const { full, merged } = adapter()
    await runMerge({ ...input, method: 'rebase' }, full)
    expect(merged).toEqual([[7, 'rebase']])
  })
  it('fails head-moved without merging or closing', async () => {
    const { full, closed, merged } = adapter({ head: async () => 'h2' })
    expect(await runMerge(input, full)).toMatchObject({ status: 'failed', reason: 'head-moved' })
    expect(merged).toEqual([])
    expect(closed).toEqual([])
  })
  it('fails with the platform reason when it refuses, closing nothing', async () => {
    const { full, closed } = adapter({
      merge: async () => ({ ok: false, reason: 'branch protection' }),
    })
    expect(await runMerge(input, full)).toMatchObject({
      status: 'failed',
      reason: 'branch protection',
    })
    expect(closed).toEqual([])
  })
})
