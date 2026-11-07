/**
 * test-audit inventory (US-613 T1, F1): static AST pass over every discoverable test.
 * Emits stable test ids, module, level and the F1 signals behind G1 (U2) and G2.
 * Signals needing a runner (duration, coverage, mutation, flakiness) are `not measured`.
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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
const ASSERT_RE = /^(expect|expectTypeOf)$|^assert(\.\w+)?$/
const MOCK_RE = /^(vi|jest)\.(fn|mock|spyOn|doMock)$/

const calleeName = (e: ts.Expression): string =>
  ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? `${calleeName(e.expression)}.${e.name.text}`
      : ts.isCallExpression(e)
        ? calleeName(e.expression)
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

function countSignals(fn: ts.Node | undefined): { assertions: number; mocks: number } {
  let assertions = 0
  let mocks = 0
  const walk = (n: ts.Node): void => {
    if (ts.isCallExpression(n)) {
      const c = calleeName(n.expression)
      if (ASSERT_RE.test(c)) assertions++
      if (MOCK_RE.test(c)) mocks++
    }
    ts.forEachChild(n, walk)
  }
  if (fn) walk(fn)
  return { assertions, mocks }
}

const titleOf = (call: ts.CallExpression): string | null => {
  const t = call.arguments[0]
  return t && ts.isStringLiteralLike(t) ? t.text : null
}

export function parseTests(file: string, source: string): TestRecord[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: TestRecord[] = []
  const seen = new Map<string, number>()
  const base = { module: moduleOf(file), level: levelOf(file) }

  const record = (call: ts.CallExpression, path: string[], mods: string[]): void => {
    const label = titleOf(call)
    const id = `${file}::${[...path, label ?? '<dynamic>'].join(' > ')}`
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    out.push({
      test_id: n > 1 ? `${id}#${n}` : id,
      ...base,
      ...countSignals(call.arguments[call.arguments.length - 1]),
      skipped: mods.includes('skip') || mods.includes('todo'),
      focused: mods.includes('only'),
      parametrized: mods.includes('each') || label === null,
      duration_ms_median: NOT_MEASURED,
      mutants_killed: NOT_MEASURED,
      unique_kills: NOT_MEASURED,
      flaky_runs: NOT_MEASURED,
    })
  }

  const visit = (node: ts.Node, path: string[]): void => {
    if (ts.isCallExpression(node)) {
      const [head = '', ...mods] = calleeName(node.expression).split('.')
      const label = titleOf(node)
      if (head === 'describe' && label !== null) {
        ts.forEachChild(node, c => visit(c, [...path, label]))
        return
      }
      const isTest =
        TEST_FNS.has(head) && (!mods.includes('each') || ts.isCallExpression(node.expression))
      if (isTest) return record(node, path, mods)
    }
    ts.forEachChild(node, c => visit(c, path))
  }
  visit(sf, [])
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

/** G1 (no/zero assertions → U2 candidate) and G2 (skip/only). */
export function gateViolations(records: TestRecord[]): { G1: string[]; G2: string[] } {
  return {
    G1: records.filter(r => r.assertions === 0 && !r.skipped).map(r => r.test_id),
    G2: records.filter(r => r.skipped || r.focused).map(r => r.test_id),
  }
}

export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/

export function buildInventory(root: string, files: string[]) {
  const records = files
    .filter(f => TEST_FILE_RE.test(f))
    .flatMap(f => parseTests(f, readFileSync(join(root, f), 'utf8')))
  return {
    total: records.length,
    byModuleLevel: summarize(records),
    gates: gateViolations(records),
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
