/** Post-merge closure performs several host operations; individual reads stay bounded. */
export function operationTimeout(action: string, timeout?: number): number {
  if (action === 'merge') return 180_000
  // A head read resolves the PR link across repository pages before reading the SHA.
  const cap = action === 'head' ? 60_000 : 30_000
  return Math.min(timeout ?? cap, cap)
}
