/**
 * r0-1 controls: names node:test's junit reporter already escapes (`&`, `<`), leaves alone (`'`, `=`)
 * or holds entity-looking text (`&lt;`, `&amp;`, `&gt;`, escaped again by node) parse exactly today.
 * The decoder must stay the exact inverse of node's escaping. Real node, real git; stay green after the fix.
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { runNodeTest } from './suites'

const SLOW = 'await new Promise(r => setTimeout(r, 30))'

const expectIds = (names: string[]): void => {
  const root = mkdtempSync(join(tmpdir(), 'suites-junit-ctl-'))
  try {
    mkdirSync(join(root, 'qa'))
    const tests = names.map(n => `test(${JSON.stringify(n)}, async () => { ${SLOW} })`).join('\n')
    writeFileSync(
      join(root, 'qa', 'a.test.mjs'),
      `import { test, describe } from 'node:test'\ndescribe('d', () => {\n${tests}\n})\n`,
    )
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    const run = runNodeTest(root, { name: 'qa', cwd: '.', dir: 'qa' }, 1)
    expect(Object.keys(run.tests)).toEqual(names.map(n => `qa/a.test.mjs::d > ${n}`))
    for (const t of Object.values(run.tests)) expect(t.duration).toBeGreaterThanOrEqual(20)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('r0-1 controls: escapes node already handles', () => {
  it('r0-1-control-escapes: "&", "<", "\'" and "=" in names keep id and duration', () => {
    expectIds(['a & b', 'x < y', "it's", 'k = v'])
  })

  it('r0-1-control-entities: entity-looking text in a name decodes back to the title', () => {
    expectIds(['esc &lt; and &amp; and &gt;'])
  })
})
