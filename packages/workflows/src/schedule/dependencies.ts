interface DependencyCard {
  readonly id: string
  readonly prerequisites: readonly string[]
}

export function dependencyGraph(cards: readonly DependencyCard[]) {
  const ids = new Set(cards.map(card => card.id))
  const graph = new Map(
    cards.map(({ id, prerequisites }) => {
      const unique = [...new Set(prerequisites)]
      return [
        id,
        {
          selected: unique.filter(dep => ids.has(dep)),
          outside: unique.filter(dep => !ids.has(dep)),
        },
      ] as const
    }),
  )
  const done = new Set<string>()
  const path = new Set<string>()
  function visit(id: string): void {
    if (done.has(id)) return
    if (path.has(id)) {
      const cycle = [...path].slice([...path].indexOf(id)).concat(id)
      throw new Error(`dependency-cycle: ${cycle.map(card => `#${card}`).join(' → ')}`)
    }
    path.add(id)
    graph.get(id)?.selected.forEach(visit)
    path.delete(id)
    done.add(id)
  }
  ids.forEach(visit)
  return graph
}
