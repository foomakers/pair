/**
 * test-audit playwright (US-613 T7, level 3): static fingerprint overlap for Playwright tests.
 * No browser run: each test is reduced to the pages it visits, the components it mounts, the
 * interactions it performs and the assertions it makes. A test whose fingerprint is contained in
 * another test of the same app is a cleanup CANDIDATE — same fingerprint is not same behavior,
 * so every row needs a human read before a card removes anything.
 */
import { execFileSync } from 'child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

import ts from 'typescript'

import { REPO_ROOT } from '../quality-gates/repo-root'

export type PwClass = 'redundant' | 'effective' | 'no-signal'
export interface PwRow {
  file: string
  name: string
  tokens: number
  class: PwClass
  containedIn?: string
}

const FILE_RE = /(^|\/)e2e\/.*\.test\.tsx?$|\.(e2e|ct)\.test\.tsx?$/
const ACTIONS = new Set(['click', 'dblclick', 'fill', 'press', 'check', 'uncheck', 'hover'])
const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
const appOf = (file: string): string => file.split('/').slice(0, 2).join('/')

const isTestCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'test'

function titleOf(call: ts.CallExpression): string | null {
  const [first] = call.arguments
  return first && ts.isStringLiteralLike(first) ? first.text : null
}

const mountToken = (n: ts.Node, sf: ts.SourceFile): string | null => {
  if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n))
    return `mount:${squash(n.getText(sf))}`
  return ts.isForOfStatement(n) || ts.isForInStatement(n)
    ? `iter:${squash(n.expression.getText(sf))}`
    : null
}

function callToken(n: ts.CallExpression, sf: ts.SourceFile): string | null {
  if (!ts.isPropertyAccessExpression(n.expression)) return null
  const method = n.expression.name.text
  if (method === 'forEach' || method === 'map')
    return `iter:${squash(n.expression.expression.getText(sf))}`
  if (method === 'goto') return `goto:${squash(n.arguments[0]?.getText(sf) ?? '')}`
  if (ACTIONS.has(method)) return `act:${squash(n.getText(sf))}`
  const chain = squash(n.getText(sf))
  return chain.startsWith('expect(') || chain.startsWith('await expect(') ? `expect:${chain}` : null
}

const tokenOf = (n: ts.Node, sf: ts.SourceFile): string | null =>
  ts.isCallExpression(n) ? callToken(n, sf) : mountToken(n, sf)

/** Tokens carry their occurrence index: two clicks are not one click. */
export function fingerprint(body: ts.Node, sf: ts.SourceFile): Set<string> {
  const tokens = new Set<string>()
  const seen = new Map<string, number>()
  const walk = (n: ts.Node): void => {
    const t = tokenOf(n, sf)
    if (t) {
      const k = (seen.get(t) ?? 0) + 1
      seen.set(t, k)
      tokens.add(`${t}#${k}`)
    }
    ts.forEachChild(n, walk)
  }
  walk(body)
  return tokens
}

interface Entry {
  file: string
  name: string
  tokens: Set<string>
}

export function collect(file: string, source: string): Entry[] {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind)
  const out: Entry[] = []
  const visit = (n: ts.Node): void => {
    const name = isTestCall(n) ? titleOf(n) : null
    const fn = isTestCall(n) ? n.arguments[n.arguments.length - 1] : undefined
    if (name !== null && fn && ts.isFunctionLike(fn)) {
      out.push({ file, name, tokens: fingerprint(fn, sf) })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** Visits and mounts alone say nothing: a11y checks and helper-driven tests keep their behavior elsewhere. */
const hasBehavior = (tokens: Set<string>): boolean =>
  [...tokens].some(t => t.startsWith('expect:') || t.startsWith('act:'))

const contains = (big: Set<string>, small: Set<string>): boolean => {
  for (const t of small) if (!big.has(t)) return false
  return true
}

/** `a` is redundant to `b` when its tokens fit inside b's (equal sets: the later one loses). */
function containerOf(a: Entry, i: number, all: Entry[]): Entry | undefined {
  return all.find((b, j) => {
    if (b === a || appOf(b.file) !== appOf(a.file) || !contains(b.tokens, a.tokens)) return false
    return b.tokens.size > a.tokens.size || j < i
  })
}

export function analyze(files: Record<string, string>): PwRow[] {
  const all = Object.entries(files).flatMap(([f, src]) => collect(f, src))
  return all.map((a, i) => {
    const base = { file: a.file, name: a.name, tokens: a.tokens.size }
    if (!hasBehavior(a.tokens)) return { ...base, class: 'no-signal' as const }
    const b = containerOf(a, i, all)
    return b
      ? { ...base, class: 'redundant' as const, containedIn: `${b.file}::${b.name}` }
      : { ...base, class: 'effective' as const }
  })
}

export function rowsFor(root: string): PwRow[] {
  const listed = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(f => FILE_RE.test(f))
  return analyze(Object.fromEntries(listed.map(f => [f, readFileSync(join(root, f), 'utf8')])))
}

export function run(root: string, out: string): PwRow[] {
  const rows = rowsFor(root)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ mode: 'fingerprint', tests: rows }, null, 2) + '\n')
  return rows
}

if (require.main === module) {
  const i = process.argv.indexOf('--out')
  const out = resolve(
    REPO_ROOT,
    i >= 0 ? (process.argv[i + 1] ?? '') : 'test-audit/mutation/playwright.json',
  )
  const rows = run(REPO_ROOT, out)
  const n = (c: PwClass) => rows.filter(r => r.class === c).length
  console.log(
    `playwright fingerprint: tests ${rows.length} · redundant ${n('redundant')} · ` +
      `effective ${n('effective')} · no-signal ${n('no-signal')}\nreport: ${relative(REPO_ROOT, out)}`,
  )
}
