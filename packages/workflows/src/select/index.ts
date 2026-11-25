/** The card facts a filter reads, at the moment it is evaluated. */
export interface CardFacts {
  readonly labels: readonly string[]
  readonly status?: string
  readonly assignee?: string
}

/** `select.filter` and `when`: AND between keys, any-of inside a list. */
export interface Filter {
  readonly has?: readonly string[]
  readonly lacks?: readonly string[]
  readonly status?: readonly string[]
  readonly assignee?: readonly string[]
}

/** Whether `card` matches `filter`; a filter with no key matches everything. */
export function matches(filter: Filter, card: CardFacts): boolean {
  const { has, lacks, status, assignee } = filter
  return (
    (has === undefined || has.some(label => card.labels.includes(label))) &&
    (lacks === undefined || !lacks.some(label => card.labels.includes(label))) &&
    (status === undefined || (card.status !== undefined && status.includes(card.status))) &&
    (assignee === undefined || (card.assignee !== undefined && assignee.includes(card.assignee)))
  )
}

export const ORDER_KEYS = ['priority', 'number', 'created', 'status'] as const
type OrderKey = (typeof ORDER_KEYS)[number]

export interface CardSelection {
  readonly filter?: Omit<Filter, 'assignee'> & { readonly assignee?: string }
  readonly order?: readonly OrderKey[]
}

export function effectiveSelection(
  workflow?: CardSelection,
  configuration?: CardSelection,
  flags: Filter = {},
) {
  const { assignee, ...filter } = configuration?.filter ?? workflow?.filter ?? {}
  const selected = { ...filter, ...(assignee === undefined ? {} : { assignee: [assignee] }) }
  return {
    order: configuration?.order ?? workflow?.order ?? (['priority', 'number'] as const),
    accepts: (card: CardFacts) => matches(selected, card) && matches(flags, card),
  }
}

export interface OrderableCard {
  readonly id: string
  readonly priority?: number
  readonly created?: string
  readonly status?: string
}

export function orderCards<T extends OrderableCard>(
  cards: readonly T[],
  order: readonly OrderKey[],
): T[] {
  return [...cards].sort((a, b) => {
    for (const key of order) {
      const result =
        key === 'number'
          ? a.id.localeCompare(b.id, 'en', { numeric: true })
          : key === 'priority'
            ? (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER)
            : (a[key] ?? '\uffff').localeCompare(b[key] ?? '\uffff')
      if (result !== 0) return result
    }
    return 0
  })
}
