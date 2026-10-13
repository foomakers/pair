// Run: node --test scripts/dev/rtk-session-path.test.mjs
// Contract (r2-g1): the SessionStart hooks registered in .claude/settings.json put the repo-local
// .tools/bin first on PATH through $CLAUDE_ENV_FILE when .tools/bin/rtk exists, so the bare `rtk`
// that the PreToolUse hook forwards untouched resolves to the pinned binary. Hooks run as Claude
// Code runs them: each registered command under /bin/sh with CLAUDE_PROJECT_DIR and the hook JSON
// on stdin, against a temp project that carries a copy of scripts/dev and a fake rtk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEV = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(DEV, '../..')
const SETTINGS = JSON.parse(readFileSync(join(REPO, '.claude/settings.json'), 'utf-8'))
const NODE_DIR = dirname(process.execPath)
const SYS = '/usr/bin:/bin'

const matches = (matcher, value) =>
  !matcher || matcher === '*' || new RegExp(`^(?:${matcher})$`).test(value)
const commands = (event, value) =>
  (SETTINGS.hooks?.[event] ?? [])
    .filter(e => matches(e.matcher, value))
    .flatMap(e => e.hooks ?? [])
    .filter(h => h.type === 'command')
    .map(h => h.command)

// a fake rtk: `rtk hook claude` prints `hookOut`; any other call prints `<label>:<args>`
const fake = (label, hookOut = '') => `#!${process.execPath}
const a = process.argv.slice(2)
if (a[0] === 'hook' && a[1] === 'claude') {
  require('node:fs').readFileSync(0)
  process.stdout.write(${JSON.stringify(hookOut)})
} else process.stdout.write(${JSON.stringify(label)} + ':' + a.join(' ') + '\\n')
`
const install = (dir, body) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'rtk'), body)
  chmodSync(join(dir, 'rtk'), 0o755)
}
const project = ({ rtk = true, prefix = 'rtkpath-', hookOut = '' } = {}) => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  cpSync(DEV, join(root, 'scripts/dev'), { recursive: true })
  if (rtk) install(join(root, '.tools/bin'), fake('RTK', hookOut))
  return root
}
const envFile = (root, content = '') => {
  const f = join(root, 'claude-env.sh')
  writeFileSync(f, content)
  return f
}
const sessionStart = (root, source, env) => {
  const cmds = commands('SessionStart', source)
  const input = JSON.stringify({
    hook_event_name: 'SessionStart',
    source,
    session_id: 's',
    cwd: root,
  })
  const runs = cmds.map(cmd =>
    spawnSync('/bin/sh', ['-c', cmd], {
      input,
      encoding: 'utf-8',
      env: { PATH: `${NODE_DIR}:${SYS}`, CLAUDE_PROJECT_DIR: root, ...env },
    }),
  )
  return { cmds, runs }
}
// what the Bash tool does: source the env file, then run the command
const shell = (file, command, path = SYS) =>
  spawnSync('/bin/sh', ['-c', `. "$PAIR_ENV_FILE"\n${command}`], {
    encoding: 'utf-8',
    env: { PATH: path, PAIR_ENV_FILE: file },
  })
const assertQuiet = ({ cmds, runs }) => {
  assert.ok(cmds.length > 0, 'no SessionStart command registered in .claude/settings.json')
  for (const r of runs) {
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
}
const assertResolves = (root, source, path = SYS) => {
  const file = envFile(root)
  assertQuiet(sessionStart(root, source, { CLAUDE_ENV_FILE: file }))
  const r = shell(file, 'rtk probe', path)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'RTK:probe\n')
}

test('s-w1 startup + rtk installed: bare rtk resolves to the repo-local binary, hook silent', () => {
  assertResolves(project(), 'startup')
})

test('s-b1 resume / clear / compact: bare rtk resolves too', () => {
  for (const source of ['resume', 'clear', 'compact']) assertResolves(project(), source)
})

test('s-b2 project root with space, quotes and $: bare rtk resolves', () => {
  assertResolves(project({ prefix: `rtk dir 'q' "d" $HOME-` }), 'startup')
})

test('s-b3 another rtk earlier on PATH: the repo-local binary wins', () => {
  const root = project()
  const other = join(root, 'global-bin')
  install(other, fake('GLOBAL'))
  assertResolves(root, 'startup', `${other}:${SYS}`)
})

test('s-b4 env file already written by another hook: content kept, rtk resolves', () => {
  const root = project()
  const pre = 'export PAIR_PRE=kept\n'
  const file = envFile(root, pre)
  assertQuiet(sessionStart(root, 'startup', { CLAUDE_ENV_FILE: file }))
  assert.ok(readFileSync(file, 'utf-8').startsWith(pre))
  const r = shell(file, 'printf "%s\\n" "$PAIR_PRE"\nrtk probe')
  assert.equal(r.stdout, 'kept\nRTK:probe\n')
})

// Claude Code 2.1.296 hands SessionStart a CLAUDE_ENV_FILE path that does not exist yet
// (coordinator evidence, 2026-10-13): the writer must create it, not only append to it
test('s-b5 CLAUDE_ENV_FILE path not yet created: hook creates it, bare rtk resolves', () => {
  const root = project()
  const file = join(root, 'sessionstart-hook-1.sh')
  assert.equal(existsSync(file), false)
  assertQuiet(sessionStart(root, 'startup', { CLAUDE_ENV_FILE: file }))
  assert.ok(existsSync(file), 'CLAUDE_ENV_FILE was not created')
  const r = shell(file, 'rtk probe')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'RTK:probe\n')
})

test('s-c1 rtk absent: env file byte-identical, every hook exits 0 silently', () => {
  const root = project({ rtk: false })
  const pre = 'export PAIR_PRE=kept\n'
  const file = envFile(root, pre)
  for (const r of sessionStart(root, 'startup', { CLAUDE_ENV_FILE: file }).runs) {
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
  assert.equal(readFileSync(file, 'utf-8'), pre)
})

test('s-c2 CLAUDE_ENV_FILE unset: every hook exits 0 silently', () => {
  for (const r of sessionStart(project(), 'startup', {}).runs) {
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, '')
  }
})

test('s-c3 the inherited PATH is kept after the env file is sourced', () => {
  const root = project()
  const file = envFile(root)
  sessionStart(root, 'startup', { CLAUDE_ENV_FILE: file })
  const r = shell(file, 'command -v cat')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^\/(usr\/)?bin\/cat\n$/)
})

// end to end: SessionStart, then the registered PreToolUse Bash hooks for pair-reviewer, then the
// command Claude Code would run, under the sourced env file
const endToEnd = rtkCommand => {
  const hookOut = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { command: rtkCommand },
    },
  })
  const root = project({ hookOut })
  const file = envFile(root)
  sessionStart(root, 'startup', { CLAUDE_ENV_FILE: file })
  let command = 'git diff'
  const input = JSON.stringify({
    agent_type: 'pair-reviewer',
    tool_name: 'Bash',
    tool_input: { command },
  })
  for (const cmd of commands('PreToolUse', 'Bash')) {
    const r = spawnSync('/bin/sh', ['-c', cmd], {
      input,
      encoding: 'utf-8',
      env: { PATH: `${NODE_DIR}:${SYS}`, CLAUDE_PROJECT_DIR: root, CLAUDE_ENV_FILE: file },
    })
    const u = r.stdout.trim() && JSON.parse(r.stdout).hookSpecificOutput?.updatedInput
    if (typeof u?.command === 'string') command = u.command
  }
  return shell(file, command)
}

test('s-i1 end to end, quoted argument containing rtk reaches rtk unchanged', () => {
  const r = endToEnd('rtk git log --grep "switch to rtk for review"')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'RTK:git log --grep switch to rtk for review\n')
})

test('s-c4 end to end, command-position rtk after && runs the repo-local rtk', () => {
  const r = endToEnd('rtk git diff && rtk ls')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'RTK:git diff\nRTK:ls\n')
})

test('s-c5 end to end, rtk after newline, env assignment and reserved word runs the repo-local rtk', () => {
  const r = endToEnd('GIT_PAGER=cat rtk git log\nif true; then rtk ls; fi')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, 'RTK:git log\nRTK:ls\n')
})
