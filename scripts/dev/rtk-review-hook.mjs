#!/usr/bin/env node
// PreToolUse(Bash) hook: runs `rtk hook claude` ONLY for the pair-reviewer subagent (hook input
// `agent_type`), only when .tools/bin/rtk exists, and rewrites `rtk` to its absolute path (no PATH).
// Anything else — other agents, main session, pair-cli run stages (no agent_type), rtk absent,
// bad input — is a silent no-op: the command runs untouched.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const rtk = join(root, '.tools/bin/rtk')
const stdin = readFileSync(0, 'utf-8')
try {
  if (JSON.parse(stdin).agent_type !== 'pair-reviewer' || !existsSync(rtk)) process.exit(0)
  const r = spawnSync(rtk, ['hook', 'claude'], { input: stdin, encoding: 'utf-8' })
  if (r.status !== 0 || !r.stdout.trim()) process.exit(0)
  const out = JSON.parse(r.stdout)
  const u = out.hookSpecificOutput?.updatedInput
  if (typeof u?.command === 'string') u.command = u.command.replace(/(^|[\s;&|(])rtk(?=\s)/g, `$1'${rtk}'`)
  process.stdout.write(JSON.stringify(out))
} catch {
  process.exit(0)
}
