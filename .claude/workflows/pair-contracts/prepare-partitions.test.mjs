// US-623 AC4 — the preparer is told, in the same words for every engine, the partitions and
// representations the validator will re-derive (a codex preparer missed them; the validator rejected).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const skill = name => readFileSync(fileURLToPath(new URL(`../../skills/pair-workflow-${name}/SKILL.md`, import.meta.url)), 'utf8')
const BLOCK = /\*\*Enumerate first, only then decide\*\*[\s\S]*?- \(c\)[^\n]*\n/

test('US-623 AC4: red-spec carries the validator\'s enumerate-first checklist verbatim', () => {
  const verifier = BLOCK.exec(skill('red-verify'))?.[0]
  assert.ok(verifier, 'the validator states the checklist')
  assert.ok(skill('red-spec').includes(verifier), 'the preparer states the same checklist')
})
