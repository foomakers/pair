/** Post-merge closure performs several host operations; individual reads stay bounded. */
export function operationTimeout(action: string, timeout?: number): number {
  return action === 'merge' ? 180_000 : Math.min(timeout ?? 30_000, 30_000)
}
