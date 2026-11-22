import { decide, fromReview, parseComment } from '.'

describe('approval answers (#680 AC-3, AC-4)', () => {
  it('reads /approve and /reject <note> from a card comment', () => {
    expect(parseComment('ann', '/approve')).toEqual({
      channel: 'comment',
      login: 'ann',
      verdict: 'approved',
    })
    expect(parseComment('ann', '/reject too risky\nmore')).toEqual({
      channel: 'comment',
      login: 'ann',
      verdict: 'rejected',
      note: 'too risky',
    })
  })
  it.each(['looks good', 'please /approve', '/approved'])('ignores %j', body =>
    expect(parseComment('ann', body)).toBeUndefined(),
  )
  it('maps native reviews: approving and requesting changes count, commenting does not', () => {
    expect(fromReview('ann', 'APPROVED')?.verdict).toBe('approved')
    expect(fromReview('ann', 'CHANGES_REQUESTED', 'no')).toMatchObject({
      verdict: 'rejected',
      note: 'no',
    })
    expect(fromReview('ann', 'COMMENTED')).toBeUndefined()
  })
  it('counts only an answer whose author the platform authorizes, and reports the others', async () => {
    const eve = { channel: 'comment', login: 'eve', verdict: 'approved' } as const
    const ann = { channel: 'review', login: 'ann', verdict: 'rejected' } as const
    const result = await decide([eve, ann], async login => login === 'ann')
    expect(result).toEqual({ answer: ann, ignored: [eve] })
  })
  it('has no decision when nobody authorized answered', async () => {
    const eve = { channel: 'flag', login: 'eve', verdict: 'approved' } as const
    expect(await decide([eve], async () => false)).toEqual({ ignored: [eve] })
    expect(await decide([], async () => true)).toEqual({ ignored: [] })
  })
})
