// Tests for red-snapshot.mjs — deterministic Git custody of a RED contract (US-479 c2).
// Every scenario runs against a throwaway git repository: this is the only place the
// seal/verify contract is proven, since the workflow sandbox cannot run git at all.
// The pre-push hook exports GIT_DIR (and friends) to everything it runs; a test that spawns git in a
// temp directory under that environment acts on the REAL repository (2026-09-09: core.bare flipped,
// fixture commits on a story branch). Scrubbed here at import, and asserted by the decoy test in
// engine-boundaries.test.mjs.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath } from '../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs'

const CLI = fileURLToPath(new URL('../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs', import.meta.url))

// The module ships inside the skills that run it — `red-verify` (seal, after validation) and
// `review-phase` (verify + verify-chain, as the final verifier's first step) — because a skill must
// be able to run its script from its own directory on any harness. One source, two installed copies
// (and their dataset sources): this is the guard that keeps them one artifact.
test('red-snapshot.mjs ships byte-identical inside red-verify and review-phase (installed and dataset)', () => {
  const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
  const canonical = read('../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs')
  for (const rel of [
    '../../skills/pair-workflow-review-phase/scripts/red-snapshot.mjs',
    '../../../packages/knowledge-hub/dataset/.skills/workflow/red-verify/scripts/red-snapshot.mjs',
    '../../../packages/knowledge-hub/dataset/.skills/workflow/review-phase/scripts/red-snapshot.mjs',
  ])
    assert.equal(read(rel), canonical, `${rel} drifted from the red-verify copy`)
})

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
    matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }],
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

// Canary run 8 on #482: the contract lives in the main checkout's run directory, so the sealer
// receives an ABSOLUTE path while its cwd is the story worktree. join(cwd, abs) produced
// "<worktree>/Users/.../red-contract.json" → ENOENT, twice, and the card ended failed-fix.
test('seal reads an absolute contract path as-is (the contract lives outside the worktree)', () => {
  const { cwd, base } = repo()
  const { contract } = redContract(cwd)
  const outside = mkdtempSync(join(tmpdir(), 'red-run-dir-'))
  const abs = join(outside, 'r1-g1-red-contract.json')
  writeFileSync(abs, JSON.stringify(contract))
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: abs, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  assert.equal(git(cwd, 'rev-parse', `${s.snapshot}^`), base)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
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
  // …but a NEW decision-log entry (or any non-module file) inside an allowed path is legal under a
  // behavioral scope — the implement process records its decisions there (canary run 12b, CG-3)
  const { cwd: cwd3, base: base3 } = repo()
  redContract(cwd3, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js', '.pair/adoption/decision-log/'] } })
  const s3 = seal({ pr: PR, phase: PHASE, base: base3, contractPath: '.pair/working/red-draft.json', cwd: cwd3 })
  rmSync(join(cwd3, '.pair/working/red-draft.json'))
  green(cwd3, s3.manifest, { 'src/a.js': 'export const a = () => 2\n', '.pair/adoption/decision-log/2026-09-10-walk-strategy.md': '# ADL\n' })
  assert.deepEqual(verify({ pr: PR, phase: PHASE, base: base3, cwd: cwd3 }).breaches, [])
  assert.equal(verifyChain({ pr: PR, base: base3, cwd: cwd3 }).verified, true)
  assert.equal(isModulePath('.pair/adoption/decision-log/x.md'), false)
  assert.equal(isModulePath('docs/guide.md'), false)
  assert.equal(isModulePath('src/helper.js'), true)
  assert.equal(isModulePath('packages/x/src/tool.ts'), true)
  rmSync(cwd3, { recursive: true, force: true })
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

test('mode test: a guard-strength repair seals with no production paths; any production change after it is a breach', () => {
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'guard', mode: 'test', allowedPaths: [] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  // nothing but the manifest removal after the seal ⇒ verified
  green(cwd, s.manifest, {})
  assert.equal(verify({ pr: PR, phase: PHASE, base, cwd }).verified, true)
  // a production edit under a test scope is a breach, whatever the path
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v.breaches, [{ code: 'test-mode-production-change', path: 'src/a.js', status: 'M' }])
  // and a test scope may not name production paths
  assert.match(contractErrors({ fixScope: { owner: 'g', mode: 'test', allowedPaths: ['src/a.js'] }, redTests: [{ file: 'test/a.test.js', sha256: `sha256:${'0'.repeat(64)}`, command: 'x', observed: 'FAIL' }], testExempt: false }).join(), /empty array for mode test/)
  rmSync(cwd, { recursive: true, force: true })
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


// ── US-479 T-13: controls may pass, matrix rows are typed, revisions are successor snapshots ──
test('contractErrors: a `baseline: pass` control needs a passing observation; a red witness needs a failure; matrix rows need id, kind, baseline and covers', () => {
  const scope = { owner: 'x', mode: 'behavioral', allowedPaths: ['src/x.js'] }
  const witness = { file: 'test/x.test.js', sha256: `sha256:${'0'.repeat(64)}`, command: 'node t', observed: 'FAIL' }
  const control = { file: 'test/c.test.js', kind: 'test', baseline: 'pass', sha256: `sha256:${'1'.repeat(64)}`, command: 'node c', observed: 'PASS 3/3' }
  assert.deepEqual(contractErrors({ fixScope: scope, redTests: [witness, control], testExempt: false }), [])
  assert.match(contractErrors({ fixScope: scope, redTests: [witness, { ...control, observed: 'FAIL' }], testExempt: false }).join(), /control.*observed passing/i)
  assert.match(contractErrors({ fixScope: scope, redTests: [{ ...witness, baseline: 'red', observed: 'PASS' }], testExempt: false }).join(), /observed RED failure/)
  assert.match(contractErrors({ fixScope: scope, redTests: [{ ...witness, baseline: 'maybe' }], testExempt: false }).join(), /baseline must be red \| pass/)
  // a contract made only of controls proves nothing about the defect
  assert.match(contractErrors({ fixScope: scope, redTests: [control], testExempt: false }).join(), /at least one red witness/i)
  const row = { id: 'row-1', kind: 'witness', baseline: 'red', condition: 'c', oracle: 'o', expected: 'e', covers: ['AC-1'] }
  assert.deepEqual(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [row] }), [])
  assert.match(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [{ ...row, id: undefined }] }).join(), /matrix\[0\]\.id/)
  assert.match(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [row, row] }).join(), /matrix\[1\]\.id is listed twice/)
  assert.match(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [{ ...row, kind: 'guess' }] }).join(), /matrix\[0\]\.kind/)
  assert.match(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [{ ...row, covers: [] }] }).join(), /matrix\[0\]\.covers/)
  assert.match(contractErrors({ fixScope: scope, redTests: [witness], testExempt: false, matrix: [{ ...row, kind: 'not-applicable' }] }).join(), /matrix\[0\]\.rationale/)
})

test('seal: an already-correct control that did not change still seals (recorded, hashed, protected) — no artificial RED is required', () => {
  const { cwd, base } = repo()
  const { contract, contractPath } = redContract(cwd)
  // test/other.test.js is a committed, unchanged, already-passing test recorded as a control
  write(cwd, 'test/other.test.js', 'import { o } from "../src/other.js"\nif (o() !== 0) throw new Error("FAIL")\n')
  git(cwd, 'add', '--', 'test/other.test.js')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'control exists')
  const base2 = git(cwd, 'rev-parse', 'HEAD')
  const withControl = { ...contract, redTests: [...contract.redTests, { file: 'test/other.test.js', kind: 'test', baseline: 'pass', sha256: hashFile('test/other.test.js', cwd), command: 'node test/other.test.js', observed: 'PASS' }] }
  write(cwd, contractPath, JSON.stringify(withControl))
  const s = seal({ pr: PR, phase: PHASE, base: base2, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  assert.deepEqual(git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', s.snapshot).split('\n').sort(), [manifestPathFor(PR, PHASE), 'test/a.test.js'].sort(), 'the unchanged control adds no blob to the snapshot commit')
  // …but it IS protected: changing it after the seal is a breach
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n', 'test/other.test.js': 'tampered\n' })
  const v = verify({ pr: PR, phase: PHASE, base: base2, cwd })
  assert.deepEqual(v.breaches.map(b => b.code), ['test-blob-changed'])
  // a red witness that did not change is still refused: it cannot be a witness of anything
  const { cwd: c2, base: b2 } = repo()
  const { contract: k2 } = redContract(c2)
  git(c2, 'checkout', '--', 'test/a.test.js')
  write(c2, '.pair/working/red-draft.json', JSON.stringify({ ...k2, redTests: [{ ...k2.redTests[0], sha256: hashFile('test/a.test.js', c2) }] }))
  assert.equal(seal({ pr: PR, phase: PHASE, base: b2, contractPath: '.pair/working/red-draft.json', cwd: c2 }).reason, 'artifact-not-changed')
  rmSync(cwd, { recursive: true, force: true })
  rmSync(c2, { recursive: true, force: true })
})

// A genuine contract gap found by the final verifier revises the affected group: the revised test
// artifacts are sealed as a SUCCESSOR snapshot on the current head. verify-chain proves the whole
// attempt: every snapshot well-formed on its declared base, every sealed blob at HEAD identical to
// the LATEST snapshot that lists it (the successor is the only commit allowed to change a sealed
// test), every production change inside the scope in force at that point.
function chainRepo() {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s1 = seal({ pr: PR, phase: 'r1-g1', base, contractPath, cwd })
  assert.equal(s1.sealed, true)
  rmSync(join(cwd, contractPath))
  green(cwd, s1.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  return { cwd, base, s1, head1 }
}
const chainBase = cwd => git(cwd, 'rev-list', '--max-parents=0', 'HEAD')
function revision(cwd, head1, extra = {}) {
  // the gap: the empty form; the revised witness extends the SAME sealed test file
  write(cwd, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\nif (a(0) !== 0) throw new Error("FAIL empty")\n')
  const contract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    revision: 2,
    supersedes: 'r1-g1',
    matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }, { id: 'row-2', kind: 'witness', baseline: 'red', condition: 'empty', oracle: 'node test/a.test.js', expected: '0', covers: ['r1-1'] }],
    redTests: [{ file: 'test/a.test.js', kind: 'test', sha256: hashFile('test/a.test.js', cwd), command: 'node test/a.test.js', observed: 'Error: FAIL empty' }],
    testExempt: false,
    ...extra,
  }
  write(cwd, '.pair/working/rev-draft.json', JSON.stringify(contract))
  const s2 = seal({ pr: PR, phase: 'r1-g1-rev2', base: head1, contractPath: '.pair/working/rev-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/rev-draft.json'))
  return s2
}

test('verify-chain: seal → GREEN → successor seal (revision) → GREEN is one verified attempt; the earlier snapshot is history, not a breach', () => {
  const { cwd, base, s1, head1 } = chainRepo()
  const s2 = revision(cwd, head1)
  assert.equal(s2.sealed, true, JSON.stringify(s2))
  assert.equal(git(cwd, 'rev-parse', `${s2.snapshot}^`), head1)
  green(cwd, s2.manifest, { 'src/a.js': 'export const a = (x = 2) => x\n' })
  const chain = verifyChain({ pr: PR, base, cwd })
  assert.equal(chain.verified, true, JSON.stringify(chain))
  assert.deepEqual(chain.snapshots.map(s => s.phase), ['r1-g1', 'r1-g1-rev2'])
  assert.deepEqual(chain.snapshots.map(s => s.snapshot), [s1.snapshot, s2.snapshot])
  // the single-snapshot verify of the superseded phase still reports the changed blob — that is
  // WHY the final verifier runs verify-chain, not verify, once a revision exists
  assert.equal(verify({ pr: PR, phase: 'r1-g1', base, cwd }).contractBreach, true)
  rmSync(cwd, { recursive: true, force: true })
})

test('seal: a revision inherits the predecessor fixScope — it may ADD paths, never drop one or change the mode; without a predecessor snapshot in history it is refused (canary run 11: a0-rev2 narrowed a0 to one file)', () => {
  assert.equal(predecessorPhase('a0-rev2'), 'a0')
  assert.equal(predecessorPhase('r1-g1-rev3'), 'r1-g1-rev2')
  assert.equal(predecessorPhase('r1-g1'), null)
  assert.deepEqual(scopeNarrowing({ fixScope: { mode: 'behavioral', allowedPaths: ['src/a.js', 'docs/'] } }, { fixScope: { mode: 'behavioral', allowedPaths: ['src/a.js', 'docs/', 'src/b.js'] } }), [])
  assert.deepEqual(scopeNarrowing({ fixScope: { mode: 'behavioral', allowedPaths: ['src/a.js', 'docs/'] } }, { fixScope: { mode: 'structural', allowedPaths: ['src/a.js'] } }), ['fixScope.mode changed from behavioral to structural', 'fixScope.allowedPaths drops docs/'])
  // narrowed: refused before any commit
  let { cwd, head1 } = chainRepo()
  const before = git(cwd, 'rev-parse', 'HEAD')
  let s2 = revision(cwd, head1, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/other.js'] } })
  assert.equal(s2.sealed, false)
  assert.equal(s2.reason, 'fixScope-narrowed')
  assert.equal(s2.predecessor, 'r1-g1')
  assert.deepEqual(s2.errors, ['fixScope.allowedPaths drops src/a.js'])
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), before, 'nothing committed')
  // widened: sealed, and the chain verifies with the wider scope in force for the later GREEN
  s2 = revision(cwd, head1, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js', 'src/other.js'] } })
  assert.equal(s2.sealed, true, JSON.stringify(s2))
  green(cwd, s2.manifest, { 'src/a.js': 'export const a = (x = 2) => x\n', 'src/other.js': 'export const o = 1\n' })
  assert.equal(verifyChain({ pr: PR, base: chainBase(cwd), cwd }).verified, true)
  rmSync(cwd, { recursive: true, force: true })
  // a revision with no predecessor snapshot anywhere in history cannot inherit anything
  const fresh = repo()
  const { contractPath } = redContract(fresh.cwd)
  const s = seal({ pr: PR, phase: 'r1-g1-rev2', base: fresh.base, contractPath, cwd: fresh.cwd })
  assert.deepEqual({ sealed: s.sealed, reason: s.reason, predecessor: s.predecessor }, { sealed: false, reason: 'predecessor-snapshot-missing', predecessor: 'r1-g1' })
  rmSync(fresh.cwd, { recursive: true, force: true })
})

test('verify-chain breach: a successor snapshot that narrows the predecessor scope (forged past the sealer) is successor-narrows-scope', () => {
  const { cwd, base, head1 } = chainRepo()
  // forge the successor by hand: the sealer would have refused it
  write(cwd, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\nif (a(0) !== 0) throw new Error("FAIL empty")\n')
  const phase = 'r1-g1-rev2'
  const manifest = manifestPathFor(PR, phase)
  const trailer = trailerFor({ pr: PR, phase, base: head1, manifest })
  const contract = { sourceOfTruth: 'a()', fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/other.js'] }, matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }], redTests: [{ file: 'test/a.test.js', kind: 'test', sha256: hashFile('test/a.test.js', cwd), command: 'node test/a.test.js', observed: 'Error: FAIL empty' }], testExempt: false }
  write(cwd, manifest, JSON.stringify({ $meta: { pr: PR, phase, base: head1, trailer, artifacts: ['test/a.test.js'] }, ...contract }, null, 2) + '\n')
  git(cwd, 'add', '--', manifest, 'test/a.test.js')
  git(cwd, 'commit', '-q', '--no-verify', '-m', `RED snapshot pr=${PR} phase=${phase}\n\n${trailer}`)
  const chain = verifyChain({ pr: PR, base, cwd })
  assert.equal(chain.verified, false)
  assert.deepEqual(chain.breaches.filter(b => b.code === 'successor-narrows-scope'), [{ code: 'successor-narrows-scope', phase, errors: ['fixScope.allowedPaths drops src/a.js'] }])
  rmSync(cwd, { recursive: true, force: true })
})

test('verify-chain spans every seal identity of the cycle (t9-1): a pr=0 initial chain followed by a pr=N remediation seal verifies from the first base under either identity; one dirtied sealed blob is exactly one test-blob-changed', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s1 = seal({ pr: '0', phase: 'a0', base, contractPath, cwd })
  assert.equal(s1.sealed, true, JSON.stringify(s1))
  rmSync(join(cwd, contractPath))
  green(cwd, s1.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  // the remediation group: a NEW witness on another producer, sealed under the PR number
  write(cwd, 'test/other.test.js', 'import { o } from "../src/other.js"\nif (o !== 1) throw new Error("FAIL")\n')
  const c2 = { sourceOfTruth: 'o', fixScope: { owner: 'o', mode: 'behavioral', allowedPaths: ['src/other.js'] }, matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/other.test.js', expected: '1', covers: ['r0-1'] }], redTests: [{ file: 'test/other.test.js', kind: 'test', sha256: hashFile('test/other.test.js', cwd), command: 'node test/other.test.js', observed: 'Error: FAIL' }], testExempt: false }
  write(cwd, '.pair/working/r1-draft.json', JSON.stringify(c2))
  const s2 = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath: '.pair/working/r1-draft.json', cwd })
  assert.equal(s2.sealed, true, JSON.stringify(s2))
  rmSync(join(cwd, '.pair/working/r1-draft.json'))
  green(cwd, s2.manifest, { 'src/other.js': 'export const o = 1\n' })
  for (const pr of ['0', PR]) {
    const chain = verifyChain({ pr, base, cwd })
    assert.equal(chain.verified, true, `pr=${pr}: ${JSON.stringify(chain.breaches)}`)
    assert.deepEqual(chain.snapshots.map(s => [s.phase, s.pr]), [['a0', '0'], ['r1-g1', PR]])
  }
  assert.equal(verifyChain({ pr: PR, base: head1, cwd }).verified, true, 'from the round base too')
  write(cwd, 'test/a.test.js', 'tampered\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'tamper')
  assert.deepEqual(verifyChain({ pr: '0', base, cwd }).breaches.map(b => b.code), ['test-blob-changed'])
  rmSync(cwd, { recursive: true, force: true })
})

test('verify-chain breach: a sealed test changed outside a successor snapshot, a production change out of the scope in force, an unlisted test, a missing snapshot', () => {
  const { cwd, base, head1 } = chainRepo()
  // tamper between seals: a sealed blob edited by an ordinary commit is a breach even though a revision follows
  green(cwd, '.no-manifest', { 'test/a.test.js': 'import { a } from "../src/a.js"\nif (a() !== 3) throw new Error("FAIL")\n' })
  let chain = verifyChain({ pr: PR, base, cwd })
  assert.deepEqual(chain.breaches.map(b => b.code), ['test-blob-changed'])
  const { cwd: c2, base: b2, head1: h2 } = chainRepo()
  const s2 = revision(c2, h2)
  green(c2, s2.manifest, { 'src/a.js': 'export const a = (x = 2) => x\n', 'src/other.js': 'export const o = () => 1\n', 'test/zz.test.js': 'new\n' })
  chain = verifyChain({ pr: PR, base: b2, cwd: c2 })
  assert.deepEqual(chain.breaches.map(b => `${b.code}:${b.path}`).sort(), ['out-of-scope:src/other.js', 'unlisted-test-changed:test/zz.test.js'])
  const { cwd: c3, base: b3 } = repo()
  assert.deepEqual(verifyChain({ pr: PR, base: b3, cwd: c3 }).breaches, [{ code: 'snapshot-missing' }])
  // a successor whose parent is not the head it declares is parent-not-base
  const { cwd: c4, base: b4, head1: h4 } = chainRepo()
  git(c4, 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'moved')
  assert.equal(revision(c4, h4).reason, 'head-not-base', 'the sealer refuses to seal a revision on a moved head')
  for (const d of [cwd, c2, c3, c4]) rmSync(d, { recursive: true, force: true })
})

test('CLI: verify-chain prints JSON and exits 0 on a verified chain, 1 on a breach', () => {
  const { cwd, base, head1 } = chainRepo()
  const s2 = revision(cwd, head1)
  green(cwd, s2.manifest, { 'src/a.js': 'export const a = (x = 2) => x\n' })
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd], { encoding: 'utf8' })
  let r = run('verify-chain', '--pr', PR, '--base', base)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.equal(JSON.parse(r.stdout).verified, true)
  write(cwd, 'test/a.test.js', 'tampered\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'tamper')
  r = run('verify-chain', '--pr', PR, '--base', base)
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).contractBreach, true)
  rmSync(cwd, { recursive: true, force: true })
})

// ── US-479 T-17 / TC-07: the contract path is validated once, against the declared main-checkout root ──
// The sealer runs inside the story worktree while the contract lives in the main checkout's run
// directory. `--root <main checkout>` declares that root: an absolute path is accepted only when its
// REAL path lies under `<root>/.pair/working/runs/` (a symlink pointing outside is an escape); a
// relative path resolves against the ROOT, never the worktree cwd; `..` escapes, a root-prefix
// sibling (`/main-evil/…`) and a path outside the root are refused before any file is read.
function mainCheckout() {
  const main = mkdtempSync(join(tmpdir(), 'main checkout ')) // a space, on purpose
  mkdirSync(join(main, '.pair', 'working', 'runs', 'run-1', '42'), { recursive: true })
  return main
}
test('seal --root: an absolute contract under <root>/.pair/working/runs is accepted (spaces included); a relative path resolves against the root, not the worktree', () => {
  const { cwd, base } = repo()
  const { contract } = redContract(cwd)
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  const main = mainCheckout()
  const abs = join(main, '.pair/working/runs/run-1/42/r1-g1-red-contract.json')
  writeFileSync(abs, JSON.stringify(contract))
  let s = seal({ pr: PR, phase: PHASE, base, contractPath: abs, cwd, root: main })
  assert.equal(s.sealed, true, JSON.stringify(s))
  // relative to the ROOT
  const { cwd: c2, base: b2 } = repo()
  const { contract: k2 } = redContract(c2)
  rmSync(join(c2, '.pair/working/red-draft.json'))
  const main2 = mainCheckout()
  writeFileSync(join(main2, '.pair/working/runs/run-1/42/r1-g1-red-contract.json'), JSON.stringify(k2))
  s = seal({ pr: PR, phase: PHASE, base: b2, contractPath: '.pair/working/runs/run-1/42/r1-g1-red-contract.json', cwd: c2, root: main2 })
  assert.equal(s.sealed, true, JSON.stringify(s))
  for (const d of [cwd, c2, main, main2]) rmSync(d, { recursive: true, force: true })
})

test('seal --root refuses: a `..` escape, a root-prefix sibling, a path outside the root, a symlink escaping the root, an absent or partial contract — before touching git', () => {
  const { cwd, base } = repo()
  const { contract } = redContract(cwd)
  const main = mainCheckout()
  const outside = mkdtempSync(join(tmpdir(), 'outside-'))
  writeFileSync(join(outside, 'c.json'), JSON.stringify(contract))
  // root-prefix sibling: "<root>-evil/…" shares the prefix string but is not under the root
  const sibling = `${main}-evil`
  mkdirSync(join(sibling, '.pair', 'working', 'runs'), { recursive: true })
  writeFileSync(join(sibling, '.pair/working/runs/c.json'), JSON.stringify(contract))
  // symlink inside the run dir pointing outside
  const link = join(main, '.pair/working/runs/run-1/42/escape.json')
  spawnSync('ln', ['-s', join(outside, 'c.json'), link])
  const cases = [
    [`${main}/.pair/working/runs/../../../../etc/passwd`, 'path-escape'],
    ['../../outside/c.json', 'path-escape'],
    [join(sibling, '.pair/working/runs/c.json'), 'path-outside-root'],
    [join(outside, 'c.json'), 'path-outside-root'],
    [link, 'path-escape'],
    [join(main, '.pair/working/runs/run-1/42/missing.json'), 'contract-missing'],
  ]
  for (const [p, reason] of cases) {
    const r = seal({ pr: PR, phase: PHASE, base, contractPath: p, cwd, root: main })
    assert.equal(r.sealed, false, p)
    assert.equal(r.reason, reason, `${p}: ${JSON.stringify(r)}`)
  }
  writeFileSync(join(main, '.pair/working/runs/run-1/42/partial.json'), '{"fixScope": {"owner": "a"')
  assert.equal(seal({ pr: PR, phase: PHASE, base, contractPath: join(main, '.pair/working/runs/run-1/42/partial.json'), cwd, root: main }).reason, 'contract-not-json')
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base, 'nothing was committed')
  assert.equal(git(cwd, 'status', '--porcelain').split('\n').filter(Boolean).length, 2, 'the worktree is untouched (the RED test + the draft)')
  for (const d of [cwd, main, outside, sibling]) rmSync(d, { recursive: true, force: true })
})

test('CLI: seal accepts --root and reports the same typed refusals', () => {
  const { cwd, base } = repo()
  const { contract } = redContract(cwd)
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  const main = mainCheckout()
  const abs = join(main, '.pair/working/runs/run-1/42/r1-g1-red-contract.json')
  writeFileSync(abs, JSON.stringify(contract))
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd, '--root', main], { encoding: 'utf8' })
  let r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', '/etc/passwd')
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).reason, 'path-outside-root')
  r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', abs)
  assert.equal(r.status, 0, r.stdout)
  assert.equal(JSON.parse(r.stdout).sealed, true)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(main, { recursive: true, force: true })
})
