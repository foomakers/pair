// Tests for word-limits.mjs — the over-limit check the writing skills run before publishing (#433 T-13).
// It reads a template's `<!-- word-limits: Section=N; ... -->` comment, splits a body by `## ` sections and
// flags every section over its limit (exit 1), exit 0 otherwise or when the template declares no limits.
// RUNS FROM `.claude/workflows` ONLY: the canonical copy under packages/knowledge-hub/dataset/.workflows/
// is byte-identical and excluded from the install (apps/pair-cli/config.json), but its `../../skills/pair-*`
// imports resolve nowhere in the dataset tree — execute this suite via `pnpm workflows:test`, never in place there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { parseLimits, sectionsOf, countWords, check } from '../../skills/pair-capability-publish-pr/scripts/word-limits.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-capability-publish-pr/scripts/word-limits.mjs', import.meta.url))
const TPL = '# T\n\n<!-- word-limits: Summary=5; Changes Made=3 ; subject ≤50 chars -->\n\n## Summary\n\n## Changes Made\n'

const tmp = () => mkdtempSync(join(tmpdir(), 'word-limits-'))
const run = (tpl, body) => {
  const d = tmp()
  writeFileSync(join(d, 't.md'), tpl)
  writeFileSync(join(d, 'b.md'), body)
  return spawnSync(process.execPath, [CLI, 'check', '--template', join(d, 't.md'), '--body', join(d, 'b.md')], { encoding: 'utf8' })
}

test('parseLimits: Section=N pairs, trimmed; entries without =N ignored; no comment = null', () => {
  assert.deepEqual([...parseLimits(TPL)], [['Summary', 5], ['Changes Made', 3]])
  assert.equal(parseLimits('# no limits\n## A\n'), null)
})

test('sectionsOf: ## headings only, ### stays inside its section, preamble dropped', () => {
  const s = sectionsOf('pre\n## A\none\n### sub\ntwo\n## B\nthree\n')
  assert.deepEqual([...s.keys()], ['A', 'B'])
  assert.match(s.get('A'), /sub/)
})

test('countWords: whitespace-split, HTML comments (markers) not counted', () => {
  assert.equal(countWords('<!-- pair:marker #1 -->\n a  b\nc '), 3)
})

test('check: lists each over-limit section with words/limit; heading matched ignoring emoji/case', () => {
  const r = check(TPL, '## 📝 summary\none two three four five six\n## Changes Made\na b c\n## Extra\nx y z w v u t\n')
  assert.deepEqual(r.over, [{ section: 'Summary', words: 6, limit: 5 }])
  assert.deepEqual(r.unlimited, ['Extra'])
})

test('CLI: over-limit section → exit 1, names it', () => {
  const r = run(TPL, '## Summary\none two three four five six\n')
  assert.equal(r.status, 1)
  assert.match(r.stdout, /over: Summary 6\/5/)
})

test('CLI: all within limits → exit 0', () => {
  const r = run(TPL, '## Summary\none two\n## Changes Made\na b c\n')
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^ok/m)
})

test('CLI: template without a word-limits comment → exit 0 with a note', () => {
  const r = run('# T\n## Summary\n', '## Summary\n' + 'w '.repeat(500))
  assert.equal(r.status, 0)
  assert.match(r.stdout, /no word-limits/)
})

test('CLI: missing argument or file → exit 2 (usage), never a silent pass', () => {
  assert.equal(spawnSync(process.execPath, [CLI, 'check', '--template', '/nonexistent'], { encoding: 'utf8' }).status, 2)
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2)
})

test('word-limits.mjs ships byte-identical in every writing skill (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const canonical = read('../../skills/pair-capability-publish-pr/scripts/word-limits.mjs')
  const skills = [['pair-capability-write-issue', 'capability/write-issue'], ['pair-process-review', 'process/review'], ['pair-workflow-review-phase', 'workflow/review-phase'], ['pair-capability-publish-pr', 'capability/publish-pr']]
  for (const [installed, dataset] of skills) {
    for (const rel of [`../../skills/${installed}/scripts/word-limits.mjs`, `../../../packages/knowledge-hub/dataset/.skills/${dataset}/scripts/word-limits.mjs`])
      assert.equal(read(rel), canonical, `${rel} drifted`)
  }
})
