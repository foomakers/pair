/**
 * r1-1: parseJunit attribute lookup vs the REAL node:test junit producer. node writes `name` first,
 * `file` last, escapes only `&` `<` `"` and leaves `=` raw, so a quoted value ending in whitespace +
 * `file=` / `time=` must stay one value and never be read as that attribute. Every case runs real
 * node and real git; titles are generated, never hand-written XML.
 */
import { execFileSync, spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { describe, it, expect } from 'vitest'

import { compact, recordRun, type Run, type RunTest } from './baseline'
import { parseJunit, runNodeTest, summarize } from './suites'

const QA = { name: 'qa', cwd: '.', dir: 'qa' }
const SLOW = 'await new Promise(r => setTimeout(r, 30))'
const MIN_MS = 20

// node < 24 omits the testcase `file` attribute: attribute per file, one run each
const junitRun = (
  root: string,
  names: string[],
): { xml: string; tests: Record<string, RunTest> } => {
  const out = join(root, 'junit.xml')
  const run = (files: string[]): string => {
    spawnSync(
      'node',
      ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, ...files],
      {
        cwd: root,
        stdio: 'ignore',
      },
    )
    return readFileSync(out, 'utf8')
  }
  const xml = run(names)
  if (/classname="[^"]*" file="/.test(xml))
    return { xml, tests: parseJunit(realpathSync(root), xml) }
  const xmls = names.map(n => run([n]))
  const tests = Object.assign({}, ...xmls.map((x, i) => parseJunit(root, x, names[i])))
  expect(Object.keys(tests).some(id => id.startsWith('..'))).toBe(false)
  return { xml: xmls.join(''), tests }
}

const tc = (title: string, body = ''): string =>
  `test(${JSON.stringify(title)}, async () => { ${SLOW}; ${body} })`
const suite = (title: string, ...body: string[]): string =>
  `describe(${JSON.stringify(title)}, () => { ${body.join('; ')} })`
const file = (...body: string[]): string =>
  `import { test, describe } from 'node:test'\nimport assert from 'node:assert'\n${body.join('\n')}\n`

const withRepo = <T>(files: Record<string, string>, fn: (root: string) => T): T => {
  const root = mkdtempSync(join(tmpdir(), 'suites-junit-attr-'))
  try {
    mkdirSync(join(root, 'qa'))
    for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'qa', name), body)
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const runOf = (files: Record<string, string>): Run =>
  withRepo(files, root => runNodeTest(root, QA, 1))

const ids = (run: Run): string[] => Object.keys(run.tests)

const expectTimed = (run: Run): void => {
  for (const t of Object.values(run.tests)) expect(t.duration).toBeGreaterThanOrEqual(MIN_MS)
}

describe('r1-1 parseJunit attributes on the real node:test producer', () => {
  it('r1-1-file-suffix: a test name ending in " file=" keeps its id and per-file key', () => {
    const run = runOf({
      'a.test.mjs': file(tc('plain')),
      'b.test.mjs': file(tc('reads from file=')),
    })
    expect(ids(run).sort()).toEqual(['qa/a.test.mjs::plain', 'qa/b.test.mjs::reads from file='])
    expectTimed(run)
  })

  it('r1-1-time-suffix: a test name ending in " time=" keeps its duration (no NaN)', () => {
    const run = runOf({ 'a.test.mjs': file(tc('parses with time='), tc('plain')) })
    expect(ids(run)).toEqual(['qa/a.test.mjs::parses with time=', 'qa/a.test.mjs::plain'])
    expectTimed(run)
  })

  it('r1-1-status: failed and skipped tests ending in " time=" / " file=" keep id, status, duration', () => {
    const run = runOf({
      'a.test.mjs': file(
        suite(
          'd',
          tc('fails time=', 'assert.fail("x")'),
          tc('fails file=', 'assert.fail("y")'),
          'test("skip file=", { skip: true }, () => {})',
        ),
      ),
    })
    expect(Object.entries(run.tests).map(([id, t]) => [id, t.status])).toEqual([
      ['qa/a.test.mjs::d > fails time=', 'failed'],
      ['qa/a.test.mjs::d > fails file=', 'failed'],
      ['qa/a.test.mjs::d > skip file=', 'skipped'],
    ])
    for (const t of Object.values(run.tests)) expect(Number.isFinite(t.duration)).toBe(true)
  })

  it('r1-1-interaction: ">", \'"\' and an attribute-name suffix in one name keep id and duration', () => {
    const run = runOf({
      'a.test.mjs': file(
        suite('d', tc('a > b time='), tc('say "q" file='), tc('k => v time='), tc('x > y file=')),
      ),
    })
    expect(ids(run)).toEqual([
      'qa/a.test.mjs::d > a > b time=',
      'qa/a.test.mjs::d > say "q" file=',
      'qa/a.test.mjs::d > k => v time=',
      'qa/a.test.mjs::d > x > y file=',
    ])
    expectTimed(run)
  })

  it('r1-1-repeat: repeated names ending in " file=" are numbered #n under the real file', () => {
    const run = runOf({ 'a.test.mjs': file(tc('dup file='), tc('dup file=')) })
    expect(ids(run)).toEqual(['qa/a.test.mjs::dup file=', 'qa/a.test.mjs::dup file=#2'])
    expectTimed(run)
  })

  it('r1-1-oracle: id count = testcase count, summed ms = junit time sum, no garbage key, no NaN', () => {
    const files = {
      'a.test.mjs': file(
        suite('d time=', tc('x file='), tc('y time='), tc('z name=')),
        tc('top file='),
      ),
      'b.test.mjs': file(tc('w time='), suite('s file= ', tc('v')), tc('u name=')),
    }
    withRepo(files, root => {
      const names = ['a.test.mjs', 'b.test.mjs'].map(f => join('qa', f))
      const { xml, tests } = junitRun(root, names)
      const cases = xml.match(/<testcase /g) ?? []
      const times = [...xml.matchAll(/ time="([\d.]+)" classname="/g)].map(m => m[1]!)
      expect(cases).toHaveLength(7)
      expect(times).toHaveLength(7)
      expect(Object.keys(tests)).toHaveLength(cases.length)
      const sum = Object.values(tests).reduce((a, t) => a + t.duration, 0)
      expect(sum).toBe(times.reduce((a, t) => a + Math.round(Number(t) * 1000), 0))
      for (const [id, t] of Object.entries(tests)) {
        expect(id.startsWith('..')).toBe(false)
        expect(id).toMatch(/^qa\/[ab]\.test\.mjs::./)
        expect(Number.isNaN(t.duration)).toBe(false)
      }
      expect(tests['qa/a.test.mjs::d time= > x file=']?.duration).toBeGreaterThanOrEqual(MIN_MS)
      expect(tests['qa/b.test.mjs::w time=']?.duration).toBeGreaterThanOrEqual(MIN_MS)
    })
  })

  it('r1-1-consumer: recordRun → compact → summarize ranks the real files, with no garbage file key', () => {
    const files = {
      'a.test.mjs': file(tc('reads from file='), tc('parses with time='), tc('plain')),
      'b.test.mjs': file(tc('b plain')),
    }
    withRepo(files, root => {
      for (const seed of [101, 102, 103]) recordRun(root, 'qa', seed, false)
      const raw = JSON.parse(readFileSync(join(root, 'test-audit', '.tmp', 'raw.json'), 'utf8'))
      const s = summarize(compact(raw.packages, 'rev'))
      expect(Object.keys(s.files).sort()).toEqual(['qa/a.test.mjs', 'qa/b.test.mjs'])
      expect(s.files['qa/a.test.mjs']).toBeGreaterThanOrEqual(3 * MIN_MS)
      expect(s.types['node:test']).toBeGreaterThanOrEqual(4 * MIN_MS)
    })
  })
})
