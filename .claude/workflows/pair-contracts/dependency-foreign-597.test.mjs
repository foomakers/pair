// US-597 r3 (r0-6) — foreign issue URL / markdown link through the REAL github adapter parse (bound repo acme/pair,
// answered by a fake `gh`): never read as a local card; uncertain => closed with repair guidance.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k]
const SCRIPTS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../skills/pair-workflow-cycle/scripts',
)
const { prereqState } = await import(pathToFileURL(join(SCRIPTS, 'cycle-state.mjs')).href)
const { bindHosts } = await import(pathToFileURL(join(SCRIPTS, 'host/index.mjs')).href)

const dir = mkdtempSync(join(tmpdir(), 'dep-foreign-'))
const gh = join(dir, 'gh')
writeFileSync(
  gh,
  `#!${process.execPath}
const a = process.argv.slice(2)
const cards = JSON.parse(process.env.FAKE_CARDS)
if (a[0] === 'repo') process.stdout.write('acme/pair\\n')
else {
  const c = cards[a[2]]
  if (!c) { process.stderr.write('HTTP 404'); process.exit(1) }
  process.stdout.write(a.includes('body') ? c.body : JSON.stringify(c))
}
`,
)
chmodSync(gh, 0o755)

const OPEN = { state: 'OPEN', labels: [] }
const state = body => {
  process.env.FAKE_CARDS = JSON.stringify({ 42: { body }, 3: OPEN, 7: OPEN, 12: OPEN })
  const host = bindHosts({
    binding: { pmTool: 'github', codeHost: 'github' },
    transport: { ghBin: gh },
  })
  return prereqState({ story: '42', host })
}
const closed = body => {
  const out = state(body)
  assert.equal(out.blocked, true)
  assert.deepEqual(out.prerequisites, [])
  assert.match(out.blockedBy.reason, /unrecognised/)
}

for (const [row, body] of [
  ['G-6i foreign issue url', 'Depends on https://github.com/other/repo/issues/7'],
  [
    'G-6j foreign issue url as markdown link',
    'Depends on [#12](https://github.com/other/repo/issues/12)',
  ],
  [
    'G-6k canonical field with foreign url',
    '**Prerequisite Stories**: https://github.com/other/repo/issues/7',
  ],
  ['G-6l local ref + foreign url', 'Depends on #3 and https://github.com/other/repo/issues/7'],
])
  test(`r3g1 ${row}`, () => closed(body))

for (const [row, body, ids] of [
  [
    'C-6b bound repo issues url is local',
    'Depends on https://github.com/acme/pair/issues/3',
    ['3'],
  ],
  [
    'C-6c bound repo markdown link is local',
    'Depends on [#3](https://github.com/acme/pair/issues/3)',
    ['3'],
  ],
  ['C-6d bare local ref', 'Depends on #3', ['3']],
])
  test(`r3g1 ${row}`, () =>
    assert.deepEqual(
      state(body).prerequisites.map(p => p.id),
      ids,
    ))
