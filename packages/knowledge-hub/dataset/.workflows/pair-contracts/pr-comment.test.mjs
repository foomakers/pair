// Tests for pr-comment.mjs — idempotent, marker-keyed PR comment publication (US-479 T-15).
// `gh` is the transport; a recorder stands in for it on PATH so the read-back-before-write and the
// edit-in-place are proven against the exact API calls the script makes. The network boundary itself
// (GitHub) is exercised by the live canary, never stubbed here as if it were proof of it.
// The pre-push hook exports GIT_DIR (and friends) to everything it runs; a test that spawns git in a
// temp directory under that environment acts on the REAL repository (2026-09-09: core.bare flipped,
// fixture commits on a story branch). Scrubbed here at import, and asserted by the decoy test in
// engine-boundaries.test.mjs.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { findByMarker, withMarker } from '../../skills/pair-workflow-review-phase/scripts/pr-comment.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-review-phase/scripts/pr-comment.mjs', import.meta.url))
const MARKER = '<!-- pair:first-review #42 PR#7 -->'

test('pr-comment.mjs ships byte-identical inside review-phase and green-fix (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const canonical = read('../../skills/pair-workflow-review-phase/scripts/pr-comment.mjs')
  for (const rel of ['../../skills/pair-workflow-green-fix/scripts/pr-comment.mjs', '../../../packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/pr-comment.mjs', '../../../packages/knowledge-hub/dataset/.skills/workflow/green-fix/scripts/pr-comment.mjs'])
    assert.equal(read(rel), canonical, `${rel} drifted`)
})

test('withMarker forces the marker to be line 1 exactly once; findByMarker matches verbatim, counting ambiguity', () => {
  assert.equal(withMarker('body', MARKER), `${MARKER}\nbody`)
  assert.equal(withMarker(`${MARKER}\nbody`, MARKER), `${MARKER}\nbody`)
  assert.equal(withMarker(`﻿${MARKER}\nbody`, MARKER), `${MARKER}\nbody`)
  const comments = [{ id: 1, body: 'hello' }, { id: 2, body: `${MARKER}\nreview` }, { id: 3, body: `x\n${MARKER}` }]
  assert.deepEqual(findByMarker(comments.slice(0, 2), MARKER), { found: true, count: 1, hits: [comments[1]] })
  assert.equal(findByMarker(comments, MARKER).count, 2)
  assert.equal(findByMarker(comments, '<!-- pair:first-review #42 PR#8 -->').found, false)
})

// A `gh` recorder: replays a scripted comment list, records every write, answers like the API.
function fakeGh(comments) {
  const dir = mkdtempSync(join(tmpdir(), 'gh-fake-'))
  const state = join(dir, 'state.json')
  const log = join(dir, 'calls.log')
  writeFileSync(state, JSON.stringify(comments))
  const script = `#!/usr/bin/env node
const fs = require('fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n')
const state = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const body = () => { const i = args.indexOf('-f'); return args[i + 1].replace(/^body=/, '') }
if (args[0] === 'api' && args.includes('--paginate')) {
  // two pages, to prove the concatenated-arrays parsing
  const mid = Math.ceil(state.length / 2)
  process.stdout.write(JSON.stringify(state.slice(0, mid)) + JSON.stringify(state.slice(mid)))
} else if (args[0] === 'api' && args.includes('PATCH')) {
  const id = Number(args.find(a => /comments\\/\\d+$/.test(a)).split('/').pop())
  const c = state.find(c => c.id === id); c.body = body()
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(state))
  process.stdout.write(JSON.stringify({ id, html_url: 'https://x/c/' + id }))
} else if (args[0] === 'api' && args.includes('POST')) {
  const id = state.reduce((m, c) => Math.max(m, c.id), 100) + 1
  state.push({ id, body: body(), html_url: 'https://x/c/' + id })
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(state))
  process.stdout.write(JSON.stringify({ id, html_url: 'https://x/c/' + id }))
} else { process.stderr.write('unexpected gh call'); process.exit(1) }
`
  writeFileSync(join(dir, 'gh'), script)
  chmodSync(join(dir, 'gh'), 0o755)
  return { dir, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : []), state: () => JSON.parse(readFileSync(state, 'utf8')) }
}
const run = (fake, ...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${fake.dir}:${process.env.PATH}` } })
function bodyFile(text) {
  const f = join(mkdtempSync(join(tmpdir(), 'body-')), 'b.md')
  writeFileSync(f, text)
  return f
}

test('upsert: no comment carries the marker ⇒ ONE read-back then ONE create, marker on line 1', () => {
  const fake = fakeGh([{ id: 1, body: 'unrelated', html_url: 'https://x/c/1' }, { id: 2, body: 'also unrelated', html_url: 'https://x/c/2' }])
  const r = run(fake, 'upsert', '--pr', '7', '--marker', MARKER, '--body-file', bodyFile('## Verdict\nAPPROVED'))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.action, 'created')
  const calls = fake.calls()
  assert.equal(calls.length, 2)
  assert.ok(calls[0].includes('--paginate'), 'the read-back comes first')
  assert.ok(calls[1].includes('POST'))
  assert.equal(fake.state().at(-1).body, `${MARKER}\n## Verdict\nAPPROVED`)
})

test('upsert: a comment already carrying the marker is EDITED in place — a lost response retried never posts twice; an identical body is unchanged', () => {
  const fake = fakeGh([{ id: 5, body: `${MARKER}\nold review`, html_url: 'https://x/c/5' }])
  let r = run(fake, 'upsert', '--pr', '7', '--marker', MARKER, '--body-file', bodyFile('new review'))
  assert.equal(JSON.parse(r.stdout).action, 'updated')
  assert.equal(fake.state().length, 1)
  assert.equal(fake.state()[0].body, `${MARKER}\nnew review`)
  r = run(fake, 'upsert', '--pr', '7', '--marker', MARKER, '--body-file', bodyFile('new review'))
  assert.equal(JSON.parse(r.stdout).action, 'unchanged')
  assert.equal(fake.calls().filter(c => c.includes('PATCH') || c.includes('POST')).length, 1, 'only the first retry wrote')
})

test('upsert: two comments carrying the same marker are an ambiguity — no third comment, exit 1', () => {
  const fake = fakeGh([{ id: 5, body: `${MARKER}\na`, html_url: '' }, { id: 6, body: `${MARKER}\nb`, html_url: '' }])
  const r = run(fake, 'upsert', '--pr', '7', '--marker', MARKER, '--body-file', bodyFile('c'))
  assert.equal(r.status, 1)
  assert.deepEqual(JSON.parse(r.stdout), { error: 'marker-ambiguous', ids: [5, 6], marker: MARKER })
  assert.equal(fake.state().length, 2)
})

test('find is read-only; a malformed marker or an unknown command is a usage error (exit 2)', () => {
  const fake = fakeGh([{ id: 5, body: `${MARKER}\na`, html_url: 'https://x/c/5' }])
  let r = run(fake, 'find', '--pr', '7', '--marker', MARKER)
  assert.deepEqual(JSON.parse(r.stdout), { found: true, count: 1, id: 5, url: 'https://x/c/5' })
  assert.equal(fake.calls().length, 1)
  r = run(fake, 'upsert', '--pr', '7', '--marker', 'not a marker', '--body-file', bodyFile('x'))
  assert.equal(r.status, 2)
  assert.match(JSON.parse(r.stdout).error, /marker must look like/)
  r = run(fake, 'frobnicate', '--pr', '7', '--marker', MARKER)
  assert.equal(r.status, 2)
})

test('a failing gh (network, auth) is a typed error, never a silent success', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-dead-'))
  writeFileSync(join(dir, 'gh'), '#!/bin/sh\necho "HTTP 502" >&2\nexit 1\n')
  chmodSync(join(dir, 'gh'), 0o755)
  const r = spawnSync(process.execPath, [CLI, 'upsert', '--pr', '7', '--marker', MARKER, '--body-file', bodyFile('x')], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } })
  assert.equal(r.status, 2)
  assert.match(JSON.parse(r.stdout).error, /gh api .* failed: HTTP 502/)
})
