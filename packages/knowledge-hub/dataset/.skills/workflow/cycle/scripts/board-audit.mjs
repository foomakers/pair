// Report board drift by default; --apply repairs through the bound PM adapter.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
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

export function runAudit({ hosts, repo, adoption, apply = false }) {
  return auditCards({ pm: hosts.pm, code: hosts.code, repo, mapping: stateMapping(adoption), apply })
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const from = process.cwd()
    const file = findAdoptionFile(from)
    const hosts = bindHosts(args.dir ? { dir: args.dir } : { from })
    const result = runAudit({ hosts, repo: args.repo, adoption: file ? readFileSync(file, 'utf8') : '', apply: args.apply })
    process.stdout.write(JSON.stringify({ ...result, apply: args.apply }) + '\n')
  } catch (e) {
    process.stdout.write(JSON.stringify({ mismatches: [], gaps: [{ id: null, reason: e.message }], apply: process.argv.includes('--apply') }) + '\n')
    process.exitCode = 1
  }
}
