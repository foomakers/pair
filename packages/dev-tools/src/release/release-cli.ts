/**
 * `pnpm release <pre|rc|final> [--version X.Y.Z] [--dry-run]` — prints the plan,
 * then dispatches version.yml. `--json` prints the plan only (CI guard / cleanup);
 * `--cleanup-for X.Y.Z[-ch.N]` prints the tags that publishing it obsoletes.
 */
import { execFileSync } from 'child_process'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { REPO_ROOT } from '../quality-gates/repo-root'
import {
  type Bump,
  type Channel,
  parseChangesetBump,
  planRelease,
  predecessors,
} from './release-state'

const CHANNELS: Channel[] = ['pre', 'rc', 'final']
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()

export function readTags(): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const t of sh('git', ['tag', '-l', 'v*']).split('\n').filter(Boolean))
    tags[t] = sh('git', ['rev-list', '-n1', t])
  return tags
}

export function readTagParents(): Record<string, string> {
  const parents: Record<string, string> = {}
  for (const t of sh('git', ['tag', '-l', 'v*']).split('\n').filter(Boolean)) {
    const parent = sh('git', ['rev-list', '-n1', '--parents', t]).split(' ')[1]
    if (parent) parents[t] = parent
  }
  return parents
}

export function readBumps(dir = join(REPO_ROOT, '.changeset')): Bump[] {
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => parseChangesetBump(readFileSync(join(dir, f), 'utf8')))
    .filter((b): b is Bump => b !== null)
}

function dispatch(channel: string, version: string | undefined): void {
  const a = ['workflow', 'run', 'version.yml', '-f', `channel=${channel}`]
  if (version) a.push('-f', `version=${version}`)
  sh('gh', a)
  console.log('Dispatched version.yml')
}

function channelOf(args: string[], version: string | undefined): Channel | undefined {
  const c = args.find(a => !a.startsWith('-') && a !== version)
  return CHANNELS.includes(c as Channel) ? (c as Channel) : undefined
}

/** origin/main after a tag+main fetch; `local` (CI, already on main) uses HEAD. */
function readHead(local: boolean): string {
  if (local) return sh('git', ['rev-parse', 'HEAD'])
  sh('git', ['fetch', '--tags', '--force', 'origin', 'main'])
  return sh('git', ['rev-parse', 'origin/main'])
}

function printCleanup(version: string): number {
  console.log(JSON.stringify(predecessors(version, Object.keys(readTags()))))
  return 0
}

export function main(argv = process.argv.slice(2)): number {
  const args = argv.filter(a => a !== '--')
  const flag = (n: string) => args.includes(n)
  const val = (n: string) => (flag(n) ? args[args.indexOf(n) + 1] : undefined)
  const cleanup = val('--cleanup-for')
  if (cleanup) return printCleanup(cleanup)
  const channel = channelOf(args, val('--version'))
  if (!channel) {
    console.error('Usage: release <pre|rc|final> [--version X.Y.Z] [--dry-run] [--json]')
    return 1
  }
  const head = readHead(flag('--no-fetch')) // fetch first: tags read below must be current
  const plan = planRelease({
    channel,
    tags: readTags(),
    tagParents: readTagParents(),
    bumps: readBumps(),
    head,
    override: val('--version'),
  })
  const json = flag('--json')
  if (json) console.log(JSON.stringify(plan))
  if (!plan.ok) {
    console.error(`Refused: ${plan.error}`)
    return 1
  }
  if (!json) {
    console.log(`Release ${plan.tag} (${channel}, base ${plan.base})`)
    console.log(`Cleanup after publish: ${plan.predecessors.join(', ') || 'none'}`)
    if (!flag('--dry-run')) dispatch(channel, val('--version'))
  }
  return 0
}

if (require.main === module) process.exit(main())
