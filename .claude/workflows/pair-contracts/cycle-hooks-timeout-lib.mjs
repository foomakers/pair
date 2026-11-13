// US-489 AC9 (finding r1-3) — the per-hook timeout of the ONE shared `## Cycle Hooks` executor,
// run for real: real `sh -c` commands, a real temp root, the real CLI both coordinators spawn.
// Grammar under contract: a `- \`timeout\`: \`<seconds>\`` bullet inside `## Cycle Hooks`; a
// non-negative integer, `0` = no timeout; absent ⇒ the documented default; every `run` answer
// carries the effective `timeout` (seconds). Short timeouts (1–2 s) and `sleep` keep it fast.
// Enforcement path under contract: `parseCycleHooks(md).timeout` is the declared value (absent ⇒
// undefined); `runHooks({ hooks, point, cwd, status, timeout, exec })` resolves the effective
// seconds ONCE (undefined ⇒ the default D, `0` stays 0) and calls `exec(command, cwd, seconds)`
// for EVERY command with that same value — the timeout is per command, never a per-point budget;
// `shellExec(command, cwd, seconds)` arms a kill after `seconds` (`0` ⇒ no timer, never remapped).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseCycleHooks, runHooks, shellExec } from '../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs'

export const SCRIPT = fileURLToPath(new URL('../../skills/pair-workflow-cycle/scripts/cycle-hooks.mjs', import.meta.url))
export const POLICY_REL = '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md'
export const POLICIES = {
  mirror: fileURLToPath(new URL(`../../../${POLICY_REL}`, import.meta.url)),
  dataset: fileURLToPath(new URL(`../../../packages/knowledge-hub/dataset/${POLICY_REL}`, import.meta.url)),
}
export const SKILLS = {
  installed: fileURLToPath(new URL('../../skills/pair-workflow-cycle/SKILL.md', import.meta.url)),
  dataset: fileURLToPath(new URL('../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/SKILL.md', import.meta.url)),
}
export const TIMED_OUT = /time(d)?[ -]?out/i

export const doc = lines => {
  const dir = mkdtempSync(join(tmpdir(), 'us489-to-'))
  const file = join(dir, 'automation.md')
  writeFileSync(file, `# Automation\n\n## Cycle Hooks\n\n${lines.join('\n')}\n\n## Other\n\n- \`post-verify\`: \`echo not-mine\`\n`)
  return { dir, file }
}
export const cli = (args, cwd) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, out: JSON.parse(r.stdout) }
}
export const timed = fn => {
  const t0 = Date.now()
  const value = fn()
  return { value, ms: Date.now() - t0 }
}
export const alive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
export const reap = pid => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // already gone
  }
}
// A killed hook must never reach its last step: `slow(name)` records its pid (= its process-group
// id, the hook runs detached) then sleeps 10 s before touching `<name>.done`. `settled` waits (no
// wall-clock assertion) until that group is gone, then reports whether the step was reached.
export const slow = (name, pre = '') => `${pre}echo $$ > ${name}.pid; sleep 10; touch ${name}.done`
export const groupAlive = pid => {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}
export const settled = (dir, name) => {
  const pid = Number(readFileSync(join(dir, `${name}.pid`), 'utf8').trim())
  const deadline = Date.now() + 30000
  while (groupAlive(pid) && Date.now() < deadline) spawnSync('sleep', ['0.1'])
  if (groupAlive(pid)) reap(-pid)
  return existsSync(join(dir, `${name}.done`))
}
export const sectionOf = (markdown, heading) => {
  const start = markdown.indexOf(`\n## ${heading}`)
  const end = markdown.indexOf('\n## ', start + 1)
  return start < 0 ? '' : markdown.slice(start, end < 0 ? undefined : end)
}
export { test, assert, mkdtempSync, writeFileSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, parseCycleHooks, runHooks, shellExec }
