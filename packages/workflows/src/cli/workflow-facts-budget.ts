/** Post-merge closure performs several host operations; individual reads stay bounded. */
export function operationTimeout(action: string, timeout?: number): number {
  if (action === 'merge') return 180_000
  // These reads resolve the PR link and can traverse several pages of host facts.
  const cap = action === 'head' || action === 'approval-answers' ? 60_000 : 30_000
  return Math.min(timeout ?? cap, cap)
}
