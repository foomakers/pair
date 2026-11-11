/**
 * r0-1: parseJunit vs the REAL node:test junit producer. node escapes `&`, `<` and `"` in attribute
 * values (`"` twice: `&amp;quot;`) and never `>`; a `>` in a test or describe name must not end the tag.
 * Every case runs real node and real git; titles are generated, never hand-written XML.
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
const junitRun = (root: string, names: string[]): { xml: string; tests: Record<string, RunTest> } => {
  const out = join(root, 'junit.xml')
  const run = (files: string[]): string => {
    spawnSync('node', ['--test', '--test-reporter=junit', `--test-reporter-destination=${out}`, ...files], {
      cwd: root,
      stdio: 'ignore',
    })
    return readFileSync(out, 'utf8')
  }
  const xml = run(names)
  if (/classname="[^"]*" file="/.test(xml)) return { xml, tests: parseJunit(realpathSync(root), xml) }
  const xmls = names.map(n => run([n]))
  return {
    xml: xmls.join(''),
    tests: Object.assign({}, ...xmls.map((x, i) => parseJunit(root, x, names[i]))),
  }
}

const tc = (title: string, opts = ''): string =>
  `test(${JSON.stringify(title)}, ${opts}async () => { ${SLOW} })`
const suite = (title: string, ...body: string[]): string =>
  `describe(${JSON.stringify(title)}, () => { ${body.join('; ')} })`
const file = (...body: string[]): string =>
  `import { test, describe } from 'node:test'\nimport assert from 'node:assert'\n${body.join('\n')}\n`

const repoOf = (files: Record<string, string>, prefix = 'suites-junit-'): string => {
  const root = mkdtempSync(join(tmpdir(), prefix))
  mkdirSync(join(root, 'qa'))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, 'qa', name), body)
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  return root
}

const withRepo = <T>(files: Record<string, string>, fn: (root: string) => T): T => {
  const root = repoOf(files)
  try {
    return fn(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const runOf = (files: Record<string, string>): Run =>
  withRepo(files, root => runNodeTest(root, QA, 1))

const ids = (run: Run): string[] => Object.keys(run.tests)

describe('r0-1 parseJunit on the real node:test producer', () => {
  it('r0-1-gt-test: a ">" in a test name keeps id, file and duration (a > b, x => y, a -> b)', () => {
    const run = runOf({
      'a.test.mjs': file(suite('d', tc('a > b'), tc('x => y'), tc('a -> b'))),
    })
    expect(ids(run)).toEqual([
      'qa/a.test.mjs::d > a > b',
      'qa/a.test.mjs::d > x => y',
      'qa/a.test.mjs::d > a -> b',
    ])
    for (const t of Object.values(run.tests)) {
      expect(t.status).toBe('passed')
      expect(t.duration).toBeGreaterThanOrEqual(MIN_MS)
    }
  })

  it('r0-1-gt-describe: a ">" in a describe name keeps the nested id, file and duration', () => {
    const run = runOf({ 'a.test.mjs': file(suite('s > t', tc('x'), suite('u => v', tc('y')))) })
    expect(ids(run)).toEqual(['qa/a.test.mjs::s > t > x', 'qa/a.test.mjs::s > t > u => v > y'])
    for (const t of Object.values(run.tests)) expect(t.duration).toBeGreaterThanOrEqual(MIN_MS)
  })

  it('r0-1-quote: a \'"\' in a test or describe name decodes to the literal quote (no "&quot;")', () => {
    const run = runOf({ 'a.test.mjs': file(suite('q "z"', tc('say "hi"')), tc('top "q"')) })
    expect(ids(run)).toEqual(['qa/a.test.mjs::q "z" > say "hi"', 'qa/a.test.mjs::top "q"'])
    expect(ids(run).join('\n')).not.toContain('&quot;')
  })

  it('r0-1-boundary: a name ending in ">" or holding "/>" and ">" next to a quote keeps its id', () => {
    const run = runOf({
      'a.test.mjs': file(tc('ends >'), tc('self /> close'), tc('q "> mix >"'), tc('>')),
    })
    expect(ids(run)).toEqual([
      'qa/a.test.mjs::ends >',
      'qa/a.test.mjs::self /> close',
      'qa/a.test.mjs::q "> mix >"',
      'qa/a.test.mjs::>',
    ])
    for (const t of Object.values(run.tests)) expect(t.duration).toBeGreaterThanOrEqual(MIN_MS)
  })

  it('r0-1-failure-attr: a "/>" or ">" in a failure message keeps a failed test "failed"', () => {
    const run = runOf({
      'a.test.mjs': file(
        'test("plain name", () => assert.fail("<div /> rendered"))',
        'test("m > n", () => assert.fail("a => b"))',
      ),
    })
    expect(Object.entries(run.tests).map(([id, t]) => [id, t.status])).toEqual([
      ['qa/a.test.mjs::plain name', 'failed'],
      ['qa/a.test.mjs::m > n', 'failed'],
    ])
  })

  it('r0-1-describe-selfclose: a "/>" in a describe name keeps its prefix and its parent', () => {
    const run = runOf({
      'a.test.mjs': file(suite('outer', suite('a /> b', tc('t')), tc('after'))),
    })
    expect(ids(run)).toEqual(['qa/a.test.mjs::outer > a /> b > t', 'qa/a.test.mjs::outer > after'])
    for (const t of Object.values(run.tests)) expect(t.duration).toBeGreaterThanOrEqual(MIN_MS)
  })

  it('r0-1-file-attr: a ">" in the root directory name keeps the per-file key', () => {
    const root = repoOf({ 'a.test.mjs': file(tc('plain')) }, 'x->y-')
    try {
      const run = runNodeTest(root, QA, 1)
      expect(ids(run)).toEqual(['qa/a.test.mjs::plain'])
      expect(Object.values(run.tests)[0]!.duration).toBeGreaterThanOrEqual(MIN_MS)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('r0-1-status: failed (child element) and skipped tests with ">" keep status and id', () => {
    const run = runOf({
      'a.test.mjs': file(
        suite(
          'd > e',
          'test("f > g", () => assert.fail("x"))',
          'test("s > k", { skip: true }, () => {})',
        ),
      ),
    })
    expect(Object.entries(run.tests).map(([id, t]) => [id, t.status])).toEqual([
      ['qa/a.test.mjs::d > e > f > g', 'failed'],
      ['qa/a.test.mjs::d > e > s > k', 'skipped'],
    ])
  })

  it('r0-1-repeat: repeated ">" names are numbered #n per file, not collapsed', () => {
    const run = runOf({ 'a.test.mjs': file(tc('r > s'), tc('r > s'), tc('r > s')) })
    expect(ids(run)).toEqual([
      'qa/a.test.mjs::r > s',
      'qa/a.test.mjs::r > s#2',
      'qa/a.test.mjs::r > s#3',
    ])
  })

  it('r0-1-oracle: id count = testcase count, summed ms = junit time sum, no garbage keys', () => {
    const files = {
      'a.test.mjs': file(suite('d > e', tc('a > b'), tc('x => y'), tc('say "hi"')), tc('t > u')),
      'b.test.mjs': file(tc('plain'), suite('s "q" > r', tc('k -> l'), tc('m & <n'))),
    }
    withRepo(files, root => {
      const names = ['a.test.mjs', 'b.test.mjs'].map(f => join('qa', f))
      const { xml, tests } = junitRun(root, names)
      const times = [...xml.matchAll(/<testcase [^\n]*? time="([\d.]+)" classname=/g)].map(
        m => m[1]!,
      )
      expect(times).toHaveLength(7)
      expect(Object.keys(tests)).toHaveLength(times.length)
      const sum = Object.values(tests).reduce((a, t) => a + t.duration, 0)
      expect(sum).toBe(times.reduce((a, t) => a + Math.round(Number(t) * 1000), 0))
      for (const id of Object.keys(tests)) {
        expect(id.startsWith('..')).toBe(false)
        expect(id.endsWith('::')).toBe(false)
        expect(id).toMatch(/^qa\/[ab]\.test\.mjs::./)
      }
      expect(tests['qa/a.test.mjs::d > e > a > b']?.duration).toBeGreaterThanOrEqual(MIN_MS)
    })
  })

  it('r0-1-consumer: recordRun → compact → summarize ranks the real file, with no garbage file key', () => {
    const root = repoOf({
      'a.test.mjs': file(suite('d > e', tc('a > b'), tc('x => y'))),
      'b.test.mjs': file(tc('plain')),
    })
    try {
      for (const seed of [101, 102, 103]) recordRun(root, 'qa', seed, false)
      const raw = JSON.parse(readFileSync(join(root, 'test-audit', '.tmp', 'raw.json'), 'utf8'))
      const s = summarize(compact(raw.packages, 'rev'))
      expect(Object.keys(s.files).sort()).toEqual(['qa/a.test.mjs', 'qa/b.test.mjs'])
      expect(s.files['qa/a.test.mjs']).toBeGreaterThanOrEqual(2 * MIN_MS)
      expect(s.types['node:test']).toBeGreaterThanOrEqual(3 * MIN_MS)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
