// Execute one PR transition through the bound PM adapter.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { applyBoardState, stateMapping } from './board-sync.mjs'
import { bindHosts, findAdoptionFile } from './host/index.mjs'

export function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--story', '--pr-state', '--repo', '--dir'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`invalid argument ${JSON.stringify(argv[i])}`)
    opts[argv[i].slice(2)] = argv[i + 1]
  }
  if (!opts.story) throw new Error('--story is required')
  if (!['open', 'merged', 'closed-unmerged', 'none'].includes(opts['pr-state'])) throw new Error('--pr-state must be open, merged, closed-unmerged, or none')
  return { story: opts.story, pr: opts['pr-state'], ...(opts.repo ? { repo: opts.repo } : {}), ...(opts.dir ? { dir: opts.dir } : {}) }
}

export function runTransition({ hosts, story, pr, repo, adoption }) {
  return applyBoardState({ pm: hosts.pm, id: story, pr, repo, mapping: stateMapping(adoption) })
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const file = findAdoptionFile(process.cwd())
    const hosts = bindHosts(args.dir ? { dir: args.dir } : { from: process.cwd() })
    process.stdout.write(JSON.stringify(runTransition({ hosts, story: args.story, pr: args.pr, repo: args.repo, adoption: file ? readFileSync(file, 'utf8') : '' })) + '\n')
  } catch (e) {
    process.stdout.write(JSON.stringify({ confirmed: false, gaps: ['transition-failed'], error: e.message }) + '\n')
    process.exitCode = 1
  }
}
