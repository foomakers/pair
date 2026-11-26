import { mkdirSync, rmSync, statSync } from 'node:fs'

/** Clear a sidecar guard left behind by a reclaimer if it is older than a minute. */
export function takeGuard(guard: string): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(guard)
      return true
    } catch {
      try {
        if (Date.now() - statSync(guard).mtimeMs < 60_000) return false
        rmSync(guard, { recursive: true, force: true })
      } catch {
        return false
      }
    }
  }
  return false
}

/** `process.kill(pid, 0)`: ESRCH ⇒ gone; EPERM ⇒ exists (another user's process). */
export function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}
