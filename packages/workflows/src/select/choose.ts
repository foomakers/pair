import type { CardFacts, effectiveSelection } from '.'

export function chooseWorkflow<
  T extends { readonly selection: ReturnType<typeof effectiveSelection> },
>(workflows: Iterable<T>, card: CardFacts): T | undefined {
  for (const workflow of workflows) {
    if (workflow.selection.accepts(card)) return workflow
  }
  return undefined
}
