/**
 * r1-1 controls: names that already parse today and must keep parsing after the attribute fix.
 * `name` is the first attribute of a testcase / testsuite tag, so a value ending in " name=" or
 * " classname=" is never read as another attribute; a describe name ending in " file=" / " time="
 * is never read for those (a testsuite's `file` and `time` are not consumed). A failing testcase tag
 * carries `failure="<raw message>"` AFTER `file=`, so a message ending " file=" / " time=" must not be
 * read as those attributes either. Real node, real git.
 */
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { runNodeTest } from './suites'

const SLOW = 'await new Promise(r => setTimeout(r, 30))'
const tc = (title: string, body = ''): string =>
  `test(${JSON.stringify(title)}, async () => { ${SLOW}; ${body} })`
const suite = (title: string, ...body: string[]): string =>
  `describe(${JSON.stringify(title)}, () => { ${body.join('; ')} })`

const expectIds = (body: string[], expected: string[], status = 'passed'): void => {
  const root = mkdtempSync(join(tmpdir(), 'suites-junit-attr-ctl-'))
  try {
    mkdirSync(join(root, 'qa'))
    writeFileSync(
      join(root, 'qa', 'a.test.mjs'),
      `import { test, describe } from 'node:test'\nimport assert from 'node:assert'\n${body.join('\n')}\n`,
    )
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    const run = runNodeTest(root, { name: 'qa', cwd: '.', dir: 'qa' }, 1)
    expect(Object.keys(run.tests)).toEqual(expected.map(e => `qa/a.test.mjs::${e}`))
    for (const t of Object.values(run.tests)) {
      expect(t.status).toBe(status)
      expect(t.duration).toBeGreaterThanOrEqual(20)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('r1-1 controls: attribute-name suffixes that already parse', () => {
  it('r1-1-control-name: test names ending in " name=" / " classname=" keep id and duration', () => {
    expectIds([tc('has name='), tc('has classname=')], ['has name=', 'has classname='])
  })

  it('r1-1-control-describe: describe names ending in " name=" / " file=" / " time=" keep the nested id', () => {
    expectIds(
      [suite('outer time=', suite('mid file=', tc('leaf name='), suite('end name=', tc('k'))))],
      ['outer time= > mid file= > leaf name=', 'outer time= > mid file= > end name= > k'],
    )
  })

  it('r1-1-control-trailing: failing tests whose failure= message ends " file=" / " time=" / " name=" keep id, status, duration', () => {
    expectIds(
      [
        suite(
          'd',
          tc('fails A', 'assert.fail("boom file=")'),
          tc('fails B', 'assert.fail("boom time=")'),
          tc('fails C', 'assert.fail("boom name=")'),
        ),
      ],
      ['d > fails A', 'd > fails B', 'd > fails C'],
      'failed',
    )
  })
})
