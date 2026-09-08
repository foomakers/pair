// Tests for red-snapshot.mjs — deterministic Git custody of a RED contract (US-479 c2).
// Every scenario runs against a throwaway git repository: this is the only place the
// seal/verify contract is proven, since the workflow sandbox cannot run git at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  contractErrors,
  hashFile,
  isTestPath,
  manifestPathFor,
  seal,
  trailerFor,
  verify,
} from './red-snapshot.mjs'

const CLI = fileURLToPath(new URL('./red-snapshot.mjs', import.meta.url))

function sh(cwd, ...args) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}`)
  return r.stdout.replace(/\n$/, '')
}
const git = (cwd, ...args) => sh(cwd, 'git', ...args)

function write(cwd, rel, content) {
  mkdirSync(join(cwd, rel, '..'), { recursive: true })
  writeFileSync(join(cwd, rel), content)
}

// A repo with one production file, one test file and one committed base.
function repo() {
  const cwd = mkdtempSync(join(tmpdir(), 'red-seal-'))
  git(cwd, 'init', '-q', '-b', 'main')
  git(cwd, 'config', 'user.email', 't@example.com')
  git(cwd, 'config', 'user.name', 'T')
  git(cwd, 'config', 'commit.gpgsign', 'false')
  write(cwd, 'src/a.js', 'export const a = () => 1\n')
  write(cwd, 'src/other.js', 'export const o = 0\n')
  write(cwd, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 1) throw new Error("FAIL")\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'base')
  return { cwd, base: git(cwd, 'rev-parse', 'HEAD') }
}

// The RED step: change the test so it fails against unfixed source, and describe it.
function redContract(cwd, extra = {}) {
  write(cwd, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\n')
  const contract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    matrix: [{ condition: 'default', oracle: 'node test/a.test.js', expected: '2' }],
    redTests: [{ file: 'test/a.test.js', kind: 'test', sha256: hashFile('test/a.test.js', cwd), command: 'node test/a.test.js', observed: 'Error: FAIL' }],
    testExempt: false,
    ...extra,
  }
  write(cwd, '.pair/working/red-draft.json', JSON.stringify(contract))
  return { contract, contractPath: '.pair/working/red-draft.json' }
}

const PR = '7'
const PHASE = 'r1-g1'

// ── contract shape ──────────────────────────────────────────────────────────
test('contractErrors: a well-formed contract has none; every defect is named', () => {
  const ok = {
    fixScope: { owner: 'x', mode: 'behavioral', allowedPaths: ['src/x.js'] },
    redTests: [
      { file: 'test/x.test.js', sha256: `sha256:${'0'.repeat(64)}`, command: 'node t', observed: 'FAIL' },
      { file: 'test/fixtures/x.json', kind: 'fixture', sha256: `sha256:${'1'.repeat(64)}`, consumedBy: 'test/x.test.js' },
    ],
    testExempt: false,
  }
  assert.deepEqual(contractErrors(ok), [])
  assert.match(contractErrors({ ...ok, fixScope: { ...ok.fixScope, mode: 'both' } }).join(), /mode must be/)
  assert.match(contractErrors({ ...ok, fixScope: { ...ok.fixScope, allowedPaths: ['../x'] } }).join(), /invalid path/)
  assert.match(contractErrors({ ...ok, redTests: [] }).join(), /non-empty/)
  assert.match(contractErrors({ ...ok, redTests: [{ ...ok.redTests[0], observed: 'PASS' }] }).join(), /observed RED failure/)
  assert.match(contractErrors({ ...ok, redTests: [ok.redTests[1]] }).join(), /does not name a listed RED test/)
  assert.match(contractErrors({ ...ok, redTests: [ok.redTests[0], ok.redTests[0]] }).join(), /listed twice/)
  assert.deepEqual(contractErrors({ fixScope: ok.fixScope, testExempt: true, exemptionRationale: 'docs only' }), [])
  assert.match(contractErrors({ fixScope: ok.fixScope, testExempt: true }).join(), /exemptionRationale/)
})

test('isTestPath recognises test dirs and suffixes, not production paths', () => {
  for (const p of ['test/a.js', 'src/__tests__/a.js', 'a.test.ts', 'b.spec.mjs', 'fixtures/x.json', 'src/fixture/x.json']) assert.ok(isTestPath(p), p)
  for (const p of ['src/a.js', 'src/testing-utils.js', 'docs/test.md']) assert.equal(isTestPath(p), false, p)
})

// ── seal ────────────────────────────────────────────────────────────────────
test('seal: one local commit above base with exactly manifest + artifacts, trailer verbatim, idempotent', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const first = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(first.sealed, true, JSON.stringify(first))
  assert.equal(git(cwd, 'rev-parse', `${first.snapshot}^`), base)
  const manifest = manifestPathFor(PR, PHASE)
  assert.deepEqual(
    git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', first.snapshot).split('\n').sort(),
    [manifest, 'test/a.test.js'].sort(),
  )
  assert.ok(git(cwd, 'log', '-1', '--format=%B').includes(trailerFor({ pr: PR, phase: PHASE, base, manifest })))
  const persisted = JSON.parse(readFileSync(join(cwd, manifest), 'utf8'))
  assert.equal(persisted.$meta.base, base)
  assert.equal(persisted.fixScope.mode, 'behavioral')
  // Lost agent response ⇒ the skill re-runs seal: same snapshot, no second commit.
  const again = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.deepEqual({ sealed: again.sealed, snapshot: again.snapshot, reused: again.reused }, { sealed: true, snapshot: first.snapshot, reused: true })
  assert.equal(git(cwd, 'rev-list', '--count', `${base}..HEAD`), '1')
  rmSync(cwd, { recursive: true, force: true })
})

test('seal refuses: HEAD not at base, artifact hash mismatch, dirty production path', () => {
  const { cwd, base } = repo()
  const { contractPath, contract } = redContract(cwd)
  // production dirty alongside the test
  write(cwd, 'src/a.js', 'export const a = () => 2\n')
  let r = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(r.reason, 'dirty-outside-contract')
  assert.deepEqual(r.paths, ['src/a.js'])
  git(cwd, 'checkout', '--', 'src/a.js')
  // hash lies
  write(cwd, contractPath, JSON.stringify({ ...contract, redTests: [{ ...contract.redTests[0], sha256: `sha256:${'f'.repeat(64)}` }] }))
  r = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(r.reason, 'artifact-hash-mismatch')
  write(cwd, contractPath, JSON.stringify(contract))
  // HEAD moved past base
  git(cwd, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'moved')
  r = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(r.reason, 'head-not-base')
  rmSync(cwd, { recursive: true, force: true })
})

test('seal refuses a malformed contract before touching git', () => {
  const { cwd, base } = repo()
  write(cwd, 'draft.json', JSON.stringify({ fixScope: { owner: 'a', mode: 'nope', allowedPaths: [] }, redTests: [], testExempt: false }))
  const r = seal({ pr: PR, phase: PHASE, base, contractPath: 'draft.json', cwd })
  assert.equal(r.reason, 'contract-invalid')
  assert.ok(r.errors.length >= 2)
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base)
  rmSync(cwd, { recursive: true, force: true })
})

// ── verify ──────────────────────────────────────────────────────────────────
function sealed() {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(s.sealed, true)
  rmSync(join(cwd, contractPath))
  return { cwd, base, snapshot: s.snapshot, manifest: manifestPathFor(PR, PHASE) }
}
function green(cwd, manifest, files) {
  for (const [rel, content] of Object.entries(files)) write(cwd, rel, content)
  if (existsSync(join(cwd, manifest))) git(cwd, 'rm', '-q', '--', manifest)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'GREEN')
}

test('verify: GREEN inside fixScope, tests untouched, manifest removed ⇒ verified', () => {
  const { cwd, base, snapshot, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v, { verified: true, contractBreach: false, snapshot, manifest, breaches: [] })
  rmSync(cwd, { recursive: true, force: true })
})

test('verify breach: a sealed test changed by GREEN (even one byte) is test-blob-changed', () => {
  const { cwd, base, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n', 'test/a.test.js': 'import { a } from "../src/a.js"\n// touched\nif (a() !== 2) throw new Error("FAIL")\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.equal(v.contractBreach, true)
  assert.deepEqual(v.breaches.map(b => b.code), ['test-blob-changed'])
  rmSync(cwd, { recursive: true, force: true })
})

test('verify breach: an unlisted test file added after the seal, and an out-of-scope production change', () => {
  const { cwd, base, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n', 'test/b.test.js': 'ok\n', 'src/other.js': 'export const o = 1\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v.breaches.map(b => `${b.code}:${b.path}`).sort(), ['out-of-scope:src/other.js', 'unlisted-test-changed:test/b.test.js'])
  rmSync(cwd, { recursive: true, force: true })
})

test('verify breach: a behavioral scope may not add a production module even inside an allowed directory', () => {
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  assert.equal(s.sealed, true)
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n', 'src/helper.js': 'export const h = 1\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v.breaches, [{ code: 'behavioral-adds-or-moves-module', path: 'src/helper.js', status: 'A' }])
  // the same change under a structural scope is in scope
  const { cwd: cwd2, base: base2 } = repo()
  redContract(cwd2, { fixScope: { owner: 'a()', mode: 'structural', allowedPaths: ['src/'] } })
  const s2 = seal({ pr: PR, phase: PHASE, base: base2, contractPath: '.pair/working/red-draft.json', cwd: cwd2 })
  rmSync(join(cwd2, '.pair/working/red-draft.json'))
  green(cwd2, s2.manifest, { 'src/a.js': 'export const a = () => 2\n', 'src/helper.js': 'export const h = 1\n' })
  assert.equal(verify({ pr: PR, phase: PHASE, base: base2, cwd: cwd2 }).verified, true)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(cwd2, { recursive: true, force: true })
})

test('verify breach: a rebase that rewrote the snapshot is snapshot-missing — never repaired', () => {
  const { cwd, base, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // "rebase": rewrite history above base without the snapshot commit
  git(cwd, 'reset', '-q', '--soft', base)
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'squashed')
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v, { verified: false, contractBreach: true, breaches: [{ code: 'snapshot-missing' }] })
  rmSync(cwd, { recursive: true, force: true })
})

test('verify breach: a snapshot whose parent is not the declared base, or which carries an extra file', () => {
  const { cwd, base } = repo()
  // hand-made bad snapshot: right trailer, but built on a moved head and carrying src/a.js
  git(cwd, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'moved')
  const manifest = manifestPathFor(PR, PHASE)
  write(cwd, 'test/a.test.js', 'changed\n')
  write(cwd, 'src/a.js', 'export const a = () => 2\n')
  write(cwd, manifest, JSON.stringify({ fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] }, redTests: [{ file: 'test/a.test.js', sha256: hashFile('test/a.test.js', cwd), command: 'x', observed: 'FAIL' }], testExempt: false }))
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', `bad\n\n${trailerFor({ pr: PR, phase: PHASE, base, manifest })}`)
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v.breaches.map(b => b.code).sort(), ['parent-not-base', 'snapshot-carries-unlisted-file'])
  rmSync(cwd, { recursive: true, force: true })
})

// ── CLI ─────────────────────────────────────────────────────────────────────
test('CLI: seal then verify print JSON and exit 0; a breach exits 1; a usage error exits 2', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd], { encoding: 'utf8' })
  let r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', contractPath)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const out = JSON.parse(r.stdout)
  assert.equal(out.sealed, true)
  rmSync(join(cwd, contractPath))
  green(cwd, out.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  r = run('verify', '--pr', PR, '--phase', PHASE, '--base', base)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(JSON.parse(r.stdout).verified, true)
  write(cwd, 'test/a.test.js', 'tampered\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'tamper')
  r = run('verify', '--pr', PR, '--phase', PHASE, '--base', base)
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).contractBreach, true)
  r = run('frobnicate', '--pr', PR, '--phase', PHASE, '--base', base)
  assert.equal(r.status, 2)
  assert.match(JSON.parse(r.stdout).error, /unknown command/)
  rmSync(cwd, { recursive: true, force: true })
})
