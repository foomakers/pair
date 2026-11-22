import { matches } from '.'

const card = { labels: ['risk:red', 'cost:green'], status: 'Review', assignee: 'ann' }

describe('label filter (#680 T-7)', () => {
  it.each([
    [{}, true],
    [{ has: ['risk:red', 'risk:yellow'] }, true],
    [{ has: ['risk:yellow'] }, false],
    [{ lacks: ['risk:yellow'] }, true],
    [{ lacks: ['risk:red', 'x'] }, false],
    [{ status: ['Review', 'Done'] }, true],
    [{ status: ['Done'] }, false],
    [{ assignee: ['bob'] }, false],
    [{ has: ['risk:red'], status: ['Done'] }, false],
  ])('%j → %s', (filter, expected) => expect(matches(filter, card)).toBe(expected))
  it('a card with no status or assignee fails a filter on them', () => {
    expect(matches({ status: ['Review'] }, { labels: [] })).toBe(false)
    expect(matches({ assignee: ['ann'] }, { labels: [] })).toBe(false)
  })
})
