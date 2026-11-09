// US-623 r0-4 — the `agent-definition-missing` HALT docblock must sit on roleBodyFor, not on roleToolsFor.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const COPIES = {
  installed: fileURLToPath(
    new URL('../../skills/pair-workflow-cycle/scripts/cycle-dispatch.mjs', import.meta.url),
  ),
  dataset: fileURLToPath(
    new URL(
      '../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts/cycle-dispatch.mjs',
      import.meta.url,
    ),
  ),
}
const docblockOf = (src, fn) => {
  const before = src.slice(0, src.indexOf(`export function ${fn}(`)).trimEnd()
  return before.endsWith('*/') ? before.slice(before.lastIndexOf('/**')) : ''
}

for (const [name, path] of Object.entries(COPIES)) {
  test(`r0-4-w1 witness: roleBodyFor carries the HALT docblock (${name})`, () => {
    assert.match(docblockOf(readFileSync(path, 'utf8'), 'roleBodyFor'), /agent-definition-missing/)
  })
  test(`r0-4-c2 control: roleToolsFor docblock does not carry the HALT docblock (${name})`, () => {
    const doc = docblockOf(readFileSync(path, 'utf8'), 'roleToolsFor')
    assert.match(doc, /US-623 BR2/)
    assert.doesNotMatch(doc, /agent-definition-missing/)
  })
}

test('r0-4-c1 control: mirrors byte-identical', () => {
  assert.equal(readFileSync(COPIES.installed, 'utf8'), readFileSync(COPIES.dataset, 'utf8'))
})
