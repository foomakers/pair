/**
 * test-audit inventory (US-613 T1, F1): static AST pass over every discoverable test.
 * Emits stable test ids, module, level and the F1 signals behind G1 (U2) and G2.
 * Signals needing a runner (duration, coverage, mutation, flakiness) are `not measured`.
 */
import { execFileSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import ts from 'typescript'

import { REPO_ROOT } from '../quality-gates/repo-root'

export type Level = 'unit' | 'integration' | 'e2e'
export const NOT_MEASURED = 'not measured' as const

export interface TestRecord {
  test_id: string
  module: string
  level: Level
  assertions: number
  mocks: number
  skipped: boolean
  focused: boolean
  parametrized: boolean
  duration_ms_median: typeof NOT_MEASURED
  mutants_killed: typeof NOT_MEASURED
  unique_kills: typeof NOT_MEASURED
  flaky_runs: typeof NOT_MEASURED
}

const TEST_FNS = new Set(['it', 'test'])
const ASSERT_RE = /^(expect|expectTypeOf)$|^expect\.(assertions|hasAssertions)$|^assert(\.\w+)?$/
/** Assertion-named helpers (`expectX`, `assertX`, `checkX`…): the assertion lives in the helper. */
const ASSERT_HELPER_RE = /^(expect|assert|verify|ensure|should|check|validate|must)([A-Z_]|$)/
const MOCK_RE = /^(vi|jest)\.(fn|mock|spyOn|doMock)$/

const calleeName = (e: ts.Expression): string =>
  ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? `${calleeName(e.expression)}.${e.name.text}`
      : ts.isCallExpression(e)
        ? calleeName(e.expression)
        : ts.isTaggedTemplateExpression(e)
          ? calleeName(e.tag)
          : ''

export const levelOf = (file: string): Level =>
  /(^|\/)e2e(\/|$)|\.e2e\./.test(file)
    ? 'e2e'
    : /(^|\/)integration(\/|$)|\.integration\./.test(file)
      ? 'integration'
      : 'unit'

export const moduleOf = (file: string): string => {
  const [a = '', b = ''] = file.split('/')
  return ['apps', 'packages', '.claude'].includes(a) && file.split('/').length > 2 ? `${a}/${b}` : a
}

function countSignals(
  fn: ts.Node | undefined,
  helpers: Map<string, ts.Node>,
): { assertions: number; mocks: number } {
  let assertions = 0
  let mocks = 0
  const visited = new Set<string>()
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = calleeName(n.expression)
      const last = c.split('.').pop() ?? ''
      if (ASSERT_RE.test(c) || ASSERT_HELPER_RE.test(last)) assertions++
      if (MOCK_RE.test(c)) mocks++
      const helper = helpers.get(c)
      if (helper && !visited.has(c)) {
        visited.add(c)
        walk(helper)
      }
    }
    ts.forEachChild(n, walk)
  }
  if (fn) walk(fn)
  return { assertions, mocks }
}

/** Same-file function declarations and `const x = () => …` helpers, by name. */
function collectHelpers(sf: ts.SourceFile): Map<string, ts.Node> {
  const m = new Map<string, ts.Node>()
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) m.set(n.name.text, n.body)
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isFunctionLike(n.initializer))
      m.set(n.name.text, n.initializer)
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return m
}

const titleOf = (call: ts.CallExpression): string | null => {
  const t = call.arguments[0]
  return t && ts.isStringLiteralLike(t) ? t.text : null
}

type Inh = { skip: boolean; only: boolean }
const SKIP_MODS = ['skip', 'todo', 'skipIf', 'runIf']
const flags = (mods: string[], inh: Inh): Inh => ({
  skip: inh.skip || mods.some(m => SKIP_MODS.includes(m)),
  only: inh.only || mods.includes('only'),
})

const splitCallee = (e: ts.Expression): [string, string[]] => {
  const [head = '', ...mods] = calleeName(e).split('.')
  return head === 'test' && mods[0] === 'describe' ? ['describe', mods.slice(1)] : [head, mods]
}

const isTestCall = (e: ts.Expression, head: string, mods: string[]): boolean =>
  TEST_FNS.has(head) &&
  (!mods.includes('each') || ts.isCallExpression(e) || ts.isTaggedTemplateExpression(e))

export function parseTests(file: string, source: string): TestRecord[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: TestRecord[] = []
  const seen = new Map<string, number>()
  const helpers = collectHelpers(sf)
  const base = { module: moduleOf(file), level: levelOf(file) }

  const record = (call: ts.CallExpression, path: string[], mods: string[], inh: Inh): void => {
    const label = titleOf(call)
    const id = `${file}::${[...path, label ?? '<dynamic>'].join(' > ')}`
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    out.push({
      test_id: n > 1 ? `${id}#${n}` : id,
      ...base,
      ...countSignals(call.arguments.find(a => ts.isFunctionLike(a)), helpers),
      skipped: flags(mods, inh).skip,
      focused: flags(mods, inh).only,
      parametrized: mods.includes('each') || label === null,
      duration_ms_median: NOT_MEASURED,
      mutants_killed: NOT_MEASURED,
      unique_kills: NOT_MEASURED,
      flaky_runs: NOT_MEASURED,
    })
  }

  const visit = (node: ts.Node, path: string[], inh: Inh): void => {
    if (ts.isCallExpression(node)) {
      const [head, mods] = splitCallee(node.expression)
      const label = titleOf(node)
      if (head === 'describe' && label !== null) {
        const next = flags(mods, inh)
        ts.forEachChild(node, c => visit(c, [...path, label], next))
        return
      }
      if (isTestCall(node.expression, head, mods)) return record(node, path, mods, inh)
    }
    ts.forEachChild(node, c => visit(c, path, inh))
  }
  visit(sf, [], { skip: false, only: false })
  return out
}

export function summarize(records: TestRecord[]): Record<string, Record<Level, number>> {
  const s: Record<string, Record<Level, number>> = {}
  for (const r of records) {
    const m = (s[r.module] ??= { unit: 0, integration: 0, e2e: 0 })
    m[r.level]++
  }
  return s
}

export interface Policy {
  maxMockAssertionRatio: number
}

/** Policy is mandatory: missing file or non-numeric ratio throws. */
export function loadPolicy(file: string): Policy {
  const { maxMockAssertionRatio } = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof maxMockAssertionRatio !== 'number' || !Number.isFinite(maxMockAssertionRatio))
    throw new Error(
      `${file}: maxMockAssertionRatio must be a number, got ${JSON.stringify(maxMockAssertionRatio)}`,
    )
  return { maxMockAssertionRatio }
}

/** G1 (no/zero assertions → U2 candidate), G2 (skip/only), U4 (mock/assertion ratio above policy). */
export function gateViolations(
  records: TestRecord[],
  policy?: Policy,
): { G1: string[]; G2: string[]; U4: string[] } {
  return {
    G1: records.filter(r => r.assertions === 0 && !r.skipped).map(r => r.test_id),
    G2: records.filter(r => r.skipped || r.focused).map(r => r.test_id),
    U4: records
      .filter(r => policy && r.mocks > policy.maxMockAssertionRatio * r.assertions)
      .map(r => r.test_id)
      .sort(),
  }
}

export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/

export function buildInventory(root: string, files: string[]) {
  const records = files
    .filter(f => TEST_FILE_RE.test(f))
    .flatMap(f => parseTests(f, readFileSync(join(root, f), 'utf8')))
  // ponytail: no config under root => U4 not evaluated (legacy roots/tests); main() runs on the repo root where it exists
  const policyFile = join(root, 'docs/testing/test-policy.config.json')
  return {
    total: records.length,
    byModuleLevel: summarize(records),
    gates: gateViolations(records, existsSync(policyFile) ? loadPolicy(policyFile) : undefined),
    tests: records,
  }
}

export function main(root = REPO_ROOT): void {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
  const inv = buildInventory(root, files)
  const outPath = join(root, 'test-audit', 'inventory.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(inv, null, 2) + '\n')
  console.log(`inventory: ${inv.total} tests → ${outPath}`)
}

if (require.main === module) main()
