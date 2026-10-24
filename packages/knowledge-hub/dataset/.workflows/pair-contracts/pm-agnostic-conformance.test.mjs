// US-572 AC3/AC4: the unattended loop reads and writes cards through the BOUND PM adapter
// (cycle-state.mjs / the cycle scripts) — never `gh issue` / `gh api user` in a workflow prompt or a
// PM-agnostic skill step. A per-tool dispatch row (a line naming the tool it is for) is allowed.
// RUNS FROM `.claude/workflows` ONLY: it reads the dataset sources.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATASET = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'packages', 'knowledge-hub', 'dataset')
const PM_CLI = /\bgh issue\b|\bgh api user\b/
const hits = (file, keep = () => false) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => PM_CLI.test(line) && !keep(line))
    .map(({ line, n }) => `${file.slice(DATASET.length + 1)}:${n}: ${line.trim().slice(0, 160)}`)

test('AC3: no workflow prompt names a PM tracker CLI', () => {
  const dir = join(DATASET, '.workflows')
  const found = readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .flatMap(f => hits(join(dir, f)))
  assert.deepEqual(found, [])
})

test('AC3/AC4: pair-next and pair-loop (PM-agnostic selection) name no PM tracker CLI', () => {
  assert.deepEqual([...hits(join(DATASET, '.skills', 'next', 'SKILL.md')), ...hits(join(DATASET, '.skills', 'loop', 'SKILL.md'))], [])
})

test('AC3: publish-pr / write-issue name a tracker CLI only on a per-tool dispatch line', () => {
  const perTool = line => /github|linear|azure|jira|filesystem/i.test(line)
  const files = ['capability/publish-pr/SKILL.md', 'capability/write-issue/SKILL.md'].map(f => join(DATASET, '.skills', f))
  assert.deepEqual(files.flatMap(f => hits(f, perTool)), [])
})

test('AC3: the conformance check bites — an unconditional `gh issue view` step is caught', () => {
  const line = 'read the labels (`gh issue view 12 --json labels`)'
  assert.ok(PM_CLI.test(line))
  assert.equal(/github|linear|azure|jira|filesystem/i.test(line), false)
})
