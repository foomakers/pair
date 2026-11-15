// Report board drift by default; --apply repairs through the bound PM adapter.
import { appendFileSync, existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCards, stateMapping } from './board-sync.mjs'
import { bindHosts, findAdoptionFile } from './host/index.mjs'

export function parseArgs(argv) {
  const opts = { apply: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') opts.apply = true
    else if (arg === '--repo' || arg === '--dir') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${arg} needs a value`)
      opts[arg.slice(2)] = argv[++i]
    } else throw new Error(`unknown argument ${JSON.stringify(arg)}`)
  }
  return opts
}

// AC-7: a human --apply repair is a manual unblock, appended to each run trail of that card
// (`.pair/working/runs/<run>/<card>/manual-unblocks.jsonl`), which delivery telemetry reads (#641).
export function recordManualUnblock({ root, who, id, actual, expected }) {
  const runs = join(root, '.pair', 'working', 'runs')
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.includes('..') || !existsSync(runs)) return
  const line = JSON.stringify({ kind: 'manual-unblock', who, reason: `board-repair: ${actual ?? 'none'} -> ${expected ?? 'closed'}`, card: id, at: new Date().toISOString() })
  for (const run of readdirSync(runs)) {
    const trail = join(runs, run, id)
    if (existsSync(trail) && statSync(trail).isDirectory()) appendFileSync(join(trail, 'manual-unblocks.jsonl'), `${line}\n`)
  }
}

export function runAudit({ hosts, repo, adoption, apply = false, root, who = 'unknown' }) {
  const onRepair = root ? repair => recordManualUnblock({ root, who, ...repair }) : undefined
  return auditCards({ pm: hosts.pm, code: hosts.code, repo, mapping: stateMapping(adoption), apply, onRepair })
}

const actor = () => {
  try {
    return process.env.GITHUB_ACTOR || userInfo().username
  } catch {
    return 'unknown'
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const from = process.cwd()
    const file = findAdoptionFile(from)
    const hosts = bindHosts(args.dir ? { dir: args.dir } : { from })
    const root = file ? resolve(dirname(file), '..', '..', '..') : undefined
    const result = runAudit({ hosts, repo: args.repo, adoption: file ? readFileSync(file, 'utf8') : '', apply: args.apply, root, who: actor() })
    process.stdout.write(JSON.stringify({ ...result, apply: args.apply }) + '\n')
  } catch (e) {
    process.stdout.write(JSON.stringify({ mismatches: [], gaps: [{ id: null, reason: e.message }], apply: process.argv.includes('--apply') }) + '\n')
    process.exitCode = 1
  }
}
