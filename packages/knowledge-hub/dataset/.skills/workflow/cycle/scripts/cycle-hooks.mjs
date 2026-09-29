#!/usr/bin/env node
// `## Cycle Hooks` — the ONE shared hook executor (US-489). Both portable coordinators call it:
// `pair-workflow-cycle` (in-session) through this CLI, `pair-cli run --card` by spawning it — so
// their blocking/logging semantics cannot drift. Dependency-free, no build step.
//
// Schema: `.pair/knowledge/guidelines/collaboration/automation/automation-policy.md`
// (`## Cycle Hooks`). Names are a PATTERN derived from the stages `cycle-state.mjs` enumerates
// (`pre-<stage-id>` / `post-<stage-id>`) plus `pre-cycle`, `post-cycle`, `on-halt` — never a list
// kept here.
//
// CLI (always exits 0 on a well-formed call; the answer is the JSON line on stdout):
//   node cycle-hooks.mjs load <automation.md>
//        → { hooks: { <key>: [command…] }, warnings: [string…] }   (absent file ⇒ no hooks)
//   node cycle-hooks.mjs run <automation.md> --point <key> [--cwd <dir>] [--status <terminal status>]
//        → { point, mode, skipped?, ran: [{command, exitCode, output}], halted?: {command, exitCode, output},
//            logged: [string…] }
//   `pre-*` ⇒ mode `blocking` (first non-zero HALTs: `halted` set, the rest not run);
//   `post-*` / `on-halt` ⇒ mode `logging` (every command runs, failures land in `logged`).
//   `on-halt` needs `--status` and is skipped unless it is `failed-*` or `escalate`.
import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { STEPS } from './cycle-state.mjs'

export const NON_STAGE_STEPS = ['done', 'blocked']
export const STAGE_IDS = STEPS.filter(step => !NON_STAGE_STEPS.includes(step))
export const CYCLE_POINTS = ['pre-cycle', 'post-cycle', 'on-halt']
export const HEADING = 'Cycle Hooks'

/** The hook names a stage id set yields — derived, so a new stage needs no edit here. */
export const hookKeysFor = (stageIds = STAGE_IDS) => [
  ...CYCLE_POINTS,
  ...stageIds.flatMap(id => [`pre-${id}`, `post-${id}`]),
]

/** `blocking` for every `pre-*`, `logging` for `post-*` and `on-halt`; undefined = not a hook name. */
export function modeOf(key, stageIds = STAGE_IDS) {
  if (!hookKeysFor(stageIds).includes(key)) return undefined
  return key.startsWith('pre-') ? 'blocking' : 'logging'
}

/** `on-halt` fires on every `failed-*` and on `escalate`, never on `ready-for-merge`. */
export const haltsOn = status => typeof status === 'string' && (status.startsWith('failed-') || status === 'escalate')

// The fence-blind level-2 extraction every `tech/automation.md` reader shares (deliberate copy of
// `blocking-severities.mjs`: this script ships beside the skill with no cross-import).
function sectionBodies(markdown, heading) {
  const bodies = []
  let current
  let fenced = false
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      if (current) current.push(raw)
      continue
    }
    if (!fenced && /^##\s+/.test(line)) {
      if (current) bodies.push(current)
      current = line.replace(/^##\s+/, '') === heading ? [] : undefined
      continue
    }
    if (current) current.push(raw)
  }
  if (current) bodies.push(current)
  return bodies
}

const BULLET = /^[-*]\s+`([^`]+)`\s*:\s*`(.+)`\s*$/

/**
 * Parses `## Cycle Hooks`. Absent section ⇒ `{ hooks: {}, warnings: [] }` (zero-configuration,
 * nothing reported). A bullet naming no known hook is a WARNING (the typo'd hook never fires),
 * never a HALT — a hook is an addition, not a gate the cycle depends on.
 */
export function parseCycleHooks(markdown, { stageIds = STAGE_IDS } = {}) {
  const bodies = sectionBodies(markdown ?? '', HEADING)
  const hooks = {}
  const warnings = []
  for (const body of bodies) {
    let fenced = false
    for (const raw of body) {
      const line = raw.trim()
      if (line.startsWith('```')) {
        fenced = !fenced
        continue
      }
      if (fenced || !/^[-*]\s+`/.test(line)) continue
      const m = BULLET.exec(line)
      if (!m) {
        warnings.push(`## Cycle Hooks: unparseable hook line ignored — ${line}`)
        continue
      }
      const [, key, command] = m
      if (modeOf(key, stageIds) === undefined) {
        warnings.push(`## Cycle Hooks: unrecognized hook key \`${key}\` — it never fires (known: pre-/post-<stage-id> for ${stageIds.join(', ')}; ${CYCLE_POINTS.join(', ')})`)
        continue
      }
      ;(hooks[key] ??= []).push(command.trim())
    }
  }
  return { hooks, warnings }
}

/** Runs one command through `sh -c` in `cwd`; a missing executable is a non-zero exit (127 from sh). */
export function shellExec(command, cwd) {
  const r = spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const exitCode = typeof r.status === 'number' ? r.status : 1
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error.message) : ''}`
  return { exitCode, output }
}

/**
 * Pure over `{hooks, point}` — `exec` is injectable. Blocking: stop at the first non-zero and
 * report it verbatim (`halted`). Logging: run everything, collect failures in `logged`.
 * `status` gates `on-halt` only.
 */
export function runHooks({ hooks, point, cwd, status, exec = shellExec, stageIds = STAGE_IDS }) {
  const mode = modeOf(point, stageIds)
  if (mode === undefined) throw new Error(`unknown hook point \`${point}\``)
  const result = { point, mode, ran: [], logged: [] }
  if (point === 'on-halt' && !haltsOn(status)) return { ...result, skipped: true }
  for (const command of hooks?.[point] ?? []) {
    const { exitCode, output } = exec(command, cwd)
    result.ran.push({ command, exitCode, output })
    if (exitCode === 0) continue
    if (mode === 'blocking') return { ...result, halted: { command, exitCode, output } }
    result.logged.push(`hook \`${point}\` \`${command}\` exited ${exitCode}${output.trim() ? ` — ${output.trim()}` : ''}`)
  }
  return result
}

const readPolicy = file => (file && existsSync(file) ? readFileSync(file, 'utf8') : '')

function main(argv) {
  const [cmd, file, ...rest] = argv
  const flag = name => {
    const i = rest.indexOf(`--${name}`)
    return i >= 0 ? rest[i + 1] : undefined
  }
  if (cmd === 'load') return parseCycleHooks(readPolicy(file))
  if (cmd === 'run') {
    const point = flag('point')
    if (!point) return { error: 'usage: run <automation.md> --point <key> [--cwd <dir>] [--status <s>]' }
    const { hooks } = parseCycleHooks(readPolicy(file))
    try {
      return runHooks({ hooks, point, cwd: flag('cwd') ?? process.cwd(), status: flag('status') })
    } catch (e) {
      return { error: e.message }
    }
  }
  return { error: 'usage: cycle-hooks.mjs <load|run> <automation.md> …' }
}

const isEntry = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isEntry()) {
  const out = main(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(out)}\n`)
  if (out.error) process.exitCode = 1
}
