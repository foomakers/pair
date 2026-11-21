import type { FileSystemService } from '@pair/content-ops'
import { join } from 'path'
import { pathToFileURL } from 'url'

interface BoardResult {
  confirmed?: boolean
  error?: string | null
}
interface PmHost {
  ensureBoardMembership(o: { id: string }): BoardResult
  setBoardState(o: { id: string; state: string }): BoardResult
}

/**
 * The real board writer: the installed cycle adapter's own helpers (never re-derived), in the order of
 * write-issue Step 7b — membership, a read that confirms it, then the Status field, read back. `gh` is the
 * adapter's transport (`ghBin`), so a test injects a fake binary. Throws what the read observed on failure.
 */
export function ghBoard(fs: FileSystemService, scriptsDir: string, main: string, ghBin?: string) {
  return {
    async setState(card: string, state: string): Promise<void> {
      const { bindHosts } = await import(pathToFileURL(join(scriptsDir, 'host', 'index.mjs')).href)
      const wow = join(main, '.pair/adoption/tech/way-of-working.md')
      const wayOfWorking = fs.existsSync(wow) ? fs.readFileSync(wow) : undefined
      const { pm } = bindHosts({ dir: main, from: main, transport: { ghBin, wayOfWorking } }) as {
        pm: PmHost
      }
      for (const [step, r] of [
        ['membership', () => pm.ensureBoardMembership({ id: card })],
        ['state', () => pm.setBoardState({ id: card, state })],
      ] as const) {
        const out = r()
        if (out.confirmed !== true)
          throw new Error(`${step} unconfirmed: ${out.error ?? 'no read-back'}`)
      }
    },
  }
}
