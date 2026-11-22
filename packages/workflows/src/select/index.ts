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
