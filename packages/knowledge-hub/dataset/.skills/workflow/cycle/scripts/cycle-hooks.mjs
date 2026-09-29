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
//        → { hooks: { <key>: [command…] }, warnings: [string…], timeout? }   (absent file ⇒ no hooks)
//        → { error } (exit 1) on a malformed `timeout` value
//   node cycle-hooks.mjs run <automation.md> --point <key> [--cwd <dir>] [--status <terminal status>]
//        → { point, mode, skipped?, ran: [{command, exitCode, output}], halted?: {command, exitCode, output},
//            logged: [string…], timeout }   (`timeout` = effective per-command seconds; 0 = none)
//   `pre-*` ⇒ mode `blocking` (first non-zero HALTs: `halted` set, the rest not run);
//   `post-*` / `on-halt` ⇒ mode `logging` (every command runs, failures land in `logged`).
//   `on-halt` needs `--status` and is skipped unless it is `failed-*`, `escalate`, `merge-parked` or
//   `merged-closure-unfinished` (the caller filters an `awaiting-human` park out first).
import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { STEPS } from './cycle-state.mjs'

export const NON_STAGE_STEPS = ['done', 'blocked']
export const STAGE_IDS = STEPS.filter(step => !NON_STAGE_STEPS.includes(step))
// Not listed here: `pre-merge`/`post-merge` — `merge` is in `STEPS`, so `hookKeysFor` derives them like any stage id
// (`post-merge` is a logging point the caller runs in the main checkout, US-490).
export const CYCLE_POINTS = ['pre-cycle', 'post-cycle', 'on-halt']
export const HEADING = 'Cycle Hooks'
/** Per-command timeout (seconds) when `## Cycle Hooks` declares no `timeout`; `0` disables it. */
export const DEFAULT_TIMEOUT = 600

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

/**
 * `on-halt` fires on every `failed-*`, on `escalate`, on `merge-parked` and on
 * `merged-closure-unfinished` — never on `ready-for-merge` or `merged`. The executor cannot see a
 * park's kind: the caller MUST NOT call it for an `awaiting-human` park.
 */
export const haltsOn = status => typeof status === 'string' && (status.startsWith('failed-') || status === 'escalate' || status === 'merge-parked' || status === 'merged-closure-unfinished')

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
  let timeout
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
      if (m && m[1] === 'timeout') {
        const value = m[2].trim()
        if (!/^\d+$/.test(value)) {
          return { hooks: {}, warnings, error: `## Cycle Hooks: malformed \`timeout\` value \`${value}\` — expected a non-negative integer of seconds (\`0\` = no timeout)` }
        }
        timeout = Number(value)
        continue
      }
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
  return timeout === undefined ? { hooks, warnings } : { hooks, warnings, timeout }
}

/**
 * Runs one command through `sh -c` in `cwd`; a missing executable is a non-zero exit (127 from sh).
 * Spawned detached (own process group): on expiry the whole GROUP is SIGKILLed, so a hook that
 * traps TERM or leaves grandchildren behind still dies. `seconds` 0 arms no timer.
 */
export function shellExec(command, cwd, seconds = DEFAULT_TIMEOUT) {
  const r = spawnSync('sh', ['-c', command], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    detached: true,
    killSignal: 'SIGKILL',
    ...(seconds > 0 && { timeout: seconds * 1000 }),
  })
  const expired = r.error?.code === 'ETIMEDOUT'
  if (expired && r.pid) {
    try {
      process.kill(-r.pid, 'SIGKILL')
    } catch {
      // group already gone (or no process groups on this platform)
    }
  }
  const exitCode = expired ? 124 : typeof r.status === 'number' ? r.status : 1
  const note = expired ? `hook timed out after ${seconds}s and was killed` : r.error ? String(r.error.message) : ''
  return { exitCode, output: `${r.stdout ?? ''}${r.stderr ?? ''}${note ? `${r.stdout || r.stderr ? '\n' : ''}${note}` : ''}` }
}

/**
 * Pure over `{hooks, point}` — `exec` is injectable. Blocking: stop at the first non-zero and
 * report it verbatim (`halted`). Logging: run everything, collect failures in `logged`.
 * `status` gates `on-halt` only.
 */
export function runHooks({ hooks, point, cwd, status, timeout, exec = shellExec, stageIds = STAGE_IDS }) {
  const mode = modeOf(point, stageIds)
  if (mode === undefined) throw new Error(`unknown hook point \`${point}\``)
  const seconds = timeout ?? DEFAULT_TIMEOUT // resolved ONCE; `0` stays 0 (no timeout)
  const result = { point, mode, ran: [], logged: [], timeout: seconds }
  if (point === 'on-halt' && !haltsOn(status)) return { ...result, skipped: true }
  for (const command of hooks?.[point] ?? []) {
    const { exitCode, output } = exec(command, cwd, seconds)
    // The output is embedded ONCE (in `halted` / `logged`); `ran` is the audit of what executed.
    result.ran.push({ command, exitCode })
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
  if (cmd === 'load') {
    const { hooks, warnings, error } = parseCycleHooks(readPolicy(file))
    return error ? { error } : { hooks, warnings }
  }
  if (cmd === 'run') {
    const point = flag('point')
    if (!point) return { error: 'usage: run <automation.md> --point <key> [--cwd <dir>] [--status <s>]' }
    const { hooks, timeout, error } = parseCycleHooks(readPolicy(file))
    if (error) return { error }
    try {
      return runHooks({ hooks, point, timeout, cwd: flag('cwd') ?? process.cwd(), status: flag('status') })
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
