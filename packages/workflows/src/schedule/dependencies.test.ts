import { dependencyGraph } from './dependencies'

describe('workflow dependencies (#678 AC-4)', () => {
  it('keeps selected dependencies and reports outside references', () => {
    const graph = dependencyGraph([
      { id: '12', prerequisites: ['3', '9', '3'] },
      { id: '3', prerequisites: [] },
    ])
    expect(graph.get('12')).toEqual({ selected: ['3'], outside: ['9'] })
  })

  it('refuses a cycle before scheduling', () => {
    expect(() =>
      dependencyGraph([
        { id: '12', prerequisites: ['3'] },
        { id: '3', prerequisites: ['12'] },
      ]),
    ).toThrow('dependency-cycle: #12 → #3 → #12')
  })
})
