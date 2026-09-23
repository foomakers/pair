// Tests for red-snapshot.mjs — deterministic Git custody of a RED contract (US-479 c2).
// Every scenario runs against a throwaway git repository: this is the only place the
// seal/verify contract is proven, since the workflow sandbox cannot run git at all.
// The pre-push hook exports GIT_DIR (and friends) to everything it runs; a test that spawns git in a
// temp directory under that environment acts on the REAL repository (2026-09-09: core.bare flipped,
// fixture commits on a story branch). Scrubbed here at import, and asserted by the decoy test in
// engine-boundaries.test.mjs.
// RUNS FROM `.claude/workflows` ONLY (t9d-31): the canonical copy under packages/knowledge-hub/dataset/.workflows/
// is byte-identical and excluded from the install (apps/pair-cli/config.json), but its `../../skills/pair-workflow-*`
// imports resolve nowhere in the dataset tree — execute this suite via `pnpm workflows:test`, never in place there.
for (const k of Object.keys(process.env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/.test(k)) delete process.env[k]
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { contractHash } from '../../skills/pair-workflow-red-verify/scripts/cycle-state.mjs'
import { contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath, OVERRIDABLE_BREACH_CODES } from '../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs'

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
  // …and ONLY documentation / decision evidence is exempt (T-9 re-review, t9b-2): a new CI workflow,
  // Terraform, a SQL migration, a Dockerfile, a JSON config or a script under .pair/ is still a module
  const { cwd: cwd4, base: base4 } = repo()
  redContract(cwd4, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/', 'infra/', '.github/', 'db/', 'Dockerfile', '.pair/', 'docs/'] } })
  const s4 = seal({ pr: PR, phase: PHASE, base: base4, contractPath: '.pair/working/red-draft.json', cwd: cwd4 })
  rmSync(join(cwd4, '.pair/working/red-draft.json'))
  const modules = ['.github/workflows/deploy.yml', 'infra/main.tf', 'db/migrations/001.sql', 'Dockerfile', 'src/config.json', '.pair/scripts/tool.mjs']
  green(cwd4, s4.manifest, Object.fromEntries([['src/a.js', 'export const a = () => 2\n'], ['docs/guide.md', '# guide\n'], ['.pair/adoption/decision-log/2026-09-10-x.md', '# ADL\n'], ['.pair/knowledge/notes.txt', 'n\n'], ...modules.map(m => [m, 'x\n'])]))
  const v4 = verify({ pr: PR, phase: PHASE, base: base4, cwd: cwd4 })
  assert.deepEqual(v4.breaches.map(b => [b.code, b.path]).sort(), modules.map(m => ['behavioral-adds-or-moves-module', m]).sort())
  for (const m of [...modules, 'web/App.vue', 'bin/run', 'package.json', '.env.production']) assert.equal(isModulePath(m), true, m)
  for (const d of ['docs/guide.md', 'README.md', 'notes/x.txt', '.pair/adoption/decision-log/y.md', '.pair/knowledge/g.md']) assert.equal(isModulePath(d), false, d)
  rmSync(cwd4, { recursive: true, force: true })
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

test('t9c-3: a conventional doc without a documentation extension is not a module — a behavioral GREEN may add README, LICENSE or an .rst', () => {
  // The allow-list was written as extensions (`.md`/`.mdx`/`.txt`) plus three directories, so the
  // documents that carry no extension at all — the ones every repository has at its root — were
  // classified as production modules. Nothing live tripped it (existing files change as `M`, and an
  // added one is what a behavioral scope may not do), but the failure is a refusal of correct work.
  for (const d of ['README', 'LICENSE', 'LICENCE', 'COPYING', 'CHANGELOG', 'CONTRIBUTING', 'NOTICE', 'AUTHORS', 'packages/x/README', 'docs/guide.rst', 'notes/x.adoc', 'README.rst', 'LICENSE.txt'])
    assert.equal(isModulePath(d), false, d)
  // The exemption is the WHOLE basename, never a prefix of one, and never an extension it resembles:
  // a file merely starting with an exempt name, or ending in one, is production.
  for (const m of ['readme.js', 'LICENSE.ts', 'src/license.json', 'authors.mjs', 'CHANGELOGGER', 'my-README', 'src/a.rstx'])
    assert.equal(isModulePath(m), true, m)
  // …and end to end: adding one under a behavioral scope verifies instead of breaching.
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n', 'src/README': 'what this package is\n', 'src/LICENSE': 'MIT\n' })
  assert.deepEqual(verify({ pr: PR, phase: PHASE, base, cwd }).breaches, [])
  rmSync(cwd, { recursive: true, force: true })
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
  let r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', contractPath, '--static-gates', '[]')
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
    // US-506 AC9: a revision names every row it changes — row-2 is new and edits the sealed witness file
    changedRows: ['row-2'],
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

test('verify-chain lists only first-parent history (t9b-3): a foreign PR seal merged into the story branch is not a segment boundary of this cycle', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s1 = seal({ pr: '0', phase: 'a0', base, contractPath, cwd })
  assert.equal(s1.sealed, true)
  rmSync(join(cwd, contractPath))
  green(cwd, s1.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // a side branch from the base carries another PR's seal
  git(cwd, 'checkout', '-q', '-b', 'side', base)
  write(cwd, 'other/o.test.mjs', 'throw new Error("FAIL")\n')
  const c777 = { sourceOfTruth: 'o', fixScope: { owner: 'o', mode: 'behavioral', allowedPaths: ['other/'] }, matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'c', oracle: 'node other/o.test.mjs', expected: 'e', covers: ['x-1'] }], redTests: [{ file: 'other/o.test.mjs', kind: 'test', sha256: hashFile('other/o.test.mjs', cwd), command: 'node other/o.test.mjs', observed: 'Error: FAIL' }], testExempt: false }
  write(cwd, '.pair/working/side.json', JSON.stringify(c777))
  assert.equal(seal({ pr: '777', phase: 'a0', base, contractPath: '.pair/working/side.json', cwd }).sealed, true)
  rmSync(join(cwd, '.pair/working/side.json'))
  git(cwd, 'checkout', '-q', 'main')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'side')
  const chain = verifyChain({ pr: '0', base, cwd })
  assert.deepEqual(chain.snapshots.map(s => [s.phase, s.pr]), [['a0', '0']], 'the foreign seal is not part of this cycle')
  assert.ok(!chain.breaches.some(b => b.code === 'successor-not-above-predecessor'), JSON.stringify(chain.breaches))
  rmSync(cwd, { recursive: true, force: true })
})

test('verify-chain: a CONCLUDED cycle`s seals are history, not a perpetual claim on the branch (canary 481-v5)', () => {
  // A finished cycle leaves its snapshot commit in the branch forever. Walk a later cycle`s chain
  // from the branch base and those seals are still in range — so every file the old cycle sealed
  // became untouchable outside the workflow, for good: a hand fix, a hotfix, a merge from main
  // touching one of them fails the NEXT cycle at its first review, before anyone can propose a new
  // contract. The way out the design intends (a successor seal ends the previous segment) is
  // unreachable, because sealing needs `validate` and custody blocks at `r0`.
  // `expectContract: false` states that THIS cycle has sealed nothing. Snapshots found under that
  // statement therefore belong to other, concluded cycles: reported as history, never as breaches.
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // that cycle is over; someone now edits the file it sealed, by hand, outside any workflow
  writeFileSync(join(cwd, 'test/a.test.js'), 'it("edited after the cycle closed", () => {})\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', 'hand fix after the cycle closed')
  // the strict default still sees it — that is the in-cycle guarantee and it must not move
  const strict = verifyChain({ pr: PR, base, cwd })
  assert.equal(strict.verified, false, 'inside a cycle, a changed sealed blob is still a breach')
  assert.ok(strict.breaches.some(b => b.code === 'test-blob-changed'))
  // a NEW cycle that has sealed nothing is not bound by the old one
  const fresh = verifyChain({ pr: PR, base, cwd, expectContract: false })
  assert.deepEqual(
    { verified: fresh.verified, breach: fresh.contractBreach, breaches: fresh.breaches, contract: fresh.contract },
    { verified: true, breach: false, breaches: [], contract: 'none' },
    'a concluded cycle`s seals cannot fail a cycle that has none of its own',
  )
  assert.ok(fresh.historicalSnapshots?.length >= 1, 'and they are REPORTED as history, never silently dropped')
  assert.equal(fresh.historicalSnapshots[0].phase, PHASE)
  rmSync(cwd, { recursive: true, force: true })
})

test('verify-chain on a branch that never sealed anything: a breach only when a contract was EXPECTED (canary 481-v2)', () => {
  // The first review of a PR that has had no remediation round runs against a branch carrying zero
  // `Pair-RED-Snapshot` trailers. There is no contract, so there is nothing to violate — but the
  // chain reported `snapshot-missing` and the coordinator read it as `failed-custody`, killing the
  // cycle at r0 with nothing wrong. Same class as the t9c-1 ADL: custody must not infer a breach
  // from what is not there. It is still a breach when the caller KNOWS a contract was sealed and
  // the chain cannot find it — that is the rebase case `snapshot-missing` exists for — so the
  // expectation comes from the caller and the default stays the strict one.
  const { cwd, base } = repo()
  const clean = verifyChain({ pr: PR, base, cwd, expectContract: false })
  assert.deepEqual(
    { verified: clean.verified, breach: clean.contractBreach, breaches: clean.breaches, snaps: clean.snapshots, contract: clean.contract },
    { verified: true, breach: false, breaches: [], snaps: [], contract: 'none' },
    'nothing sealed and nothing expected: there is no custody to violate',
  )
  // the rebase case is untouched: a caller that expects a contract still gets the breach…
  const expecting = verifyChain({ pr: PR, base, cwd, expectContract: true })
  assert.deepEqual(expecting.breaches, [{ code: 'snapshot-missing' }], 'an expected contract that is gone is still a breach')
  assert.equal(expecting.verified, false)
  // …and so does a caller that says nothing, so no existing caller is silently weakened.
  assert.deepEqual(verifyChain({ pr: PR, base, cwd }).breaches, [{ code: 'snapshot-missing' }], 'the default is the strict one')
  // …and through the REAL CLI, which is what the skill actually runs: the flag has to reach the
  // parser, and the parser takes `--k v` pairs only — a bare `--no-…` switch is a `bad argument`
  // the unit call above would never have caught.
  const cli = (args = []) => spawnSync(process.execPath, [CLI, 'verify-chain', '--pr', String(PR), '--base', base, ...args], { cwd, encoding: 'utf8' })
  const strict = cli()
  assert.equal(strict.status, 1)
  assert.deepEqual(JSON.parse(strict.stdout).breaches, [{ code: 'snapshot-missing' }], 'CLI default stays strict')
  const relaxed = cli(['--contract-expected', 'false'])
  assert.equal(relaxed.status, 0, relaxed.stdout + relaxed.stderr)
  assert.deepEqual(JSON.parse(relaxed.stdout).contract, 'none')
  // only that exact value relaxes it — a typo must not quietly disable a custody check
  for (const v of ['False', '0', 'no', 'nope'])
    assert.equal(JSON.parse(cli(['--contract-expected', v]).stdout).contractBreach, true, `--contract-expected ${v} must not relax the check`)
  // a real chain is unaffected by the new argument
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  for (const expectContract of [undefined, true, false])
    assert.equal(verifyChain({ pr: PR, base, cwd, expectContract }).verified, true, `sealed chain verifies regardless of the expectation (${expectContract})`)
  rmSync(cwd, { recursive: true, force: true })
})

test('t9d-9: `--run-dir` makes the contract expectation MECHANICAL — derived from the sealed red-verify handoffs in the run directory; `--contract-expected false` beside a sealed handoff is refused, never a custody bypass', () => {
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // a real breach: a sealed test edited by an ordinary commit
  writeFileSync(join(cwd, 'test/a.test.js'), 'it("tampered", () => {})\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'tamper')
  const runDir = mkdtempSync(join(tmpdir(), 'run-dir-'))
  // no sealed handoff in THIS cycle's run directory ⇒ derived `none`: history, not a breach
  const fresh = verifyChain({ pr: PR, base, cwd, runDir })
  assert.deepEqual({ verified: fresh.verified, contract: fresh.contract, expected: fresh.contractExpectation?.expectContract }, { verified: true, contract: 'none', expected: false })
  // a sealed red-verify handoff exists ⇒ derived strict, whatever the caller asserts
  writeFileSync(join(runDir, 'r1-g1-red-verify.json'), JSON.stringify({ run: 'run-1', story: '42', phase: 'r1-g1', skill: 'red-verify', verified: true, sealed: true }))
  const derived = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(derived.verified, false)
  assert.ok(derived.breaches.some(b => b.code === 'test-blob-changed'), 'the strict walk ran')
  assert.deepEqual(derived.contractExpectation.sealedHandoffs, ['r1-g1-red-verify.json'])
  const refused = verifyChain({ pr: PR, base, cwd, runDir, expectContract: false })
  assert.equal(refused.verified, false)
  assert.equal(refused.contractBreach, true)
  assert.ok(refused.breaches.some(b => b.code === 'contract-expected-refused' && b.sealedHandoffs[0] === 'r1-g1-red-verify.json'), JSON.stringify(refused.breaches))
  assert.ok(refused.breaches.some(b => b.code === 'test-blob-changed'), 'the flag never short-circuits the walk')
  // through the REAL CLI
  const cli = (...args) => spawnSync(process.execPath, [CLI, 'verify-chain', '--pr', String(PR), '--base', base, '--run-dir', runDir, ...args], { cwd, encoding: 'utf8' })
  const r = cli('--contract-expected', 'false')
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.ok(JSON.parse(r.stdout).breaches.some(b => b.code === 'contract-expected-refused'))
  rmSync(join(runDir, 'r1-g1-red-verify.json'))
  const ok = cli('--contract-expected', 'false')
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.equal(JSON.parse(ok.stdout).contract, 'none')
  // without --run-dir nothing changes for existing callers
  assert.equal(verifyChain({ pr: PR, base, cwd, expectContract: false }).verified, true)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(runDir, { recursive: true, force: true })
})

test('t9d-19 (DT-32): an unknown flag is refused before anything runs', () => {
  const { cwd, base } = repo()
  const r = spawnSync(process.execPath, [CLI, 'verify-chain', '--pr', String(PR), '--base', base, '--bogusFlag', 'pwned'], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 2, r.stdout + r.stderr)
  assert.match(JSON.parse(r.stdout).error, /unknown flag.*--bogusFlag/)
  rmSync(cwd, { recursive: true, force: true })
})

test('t9d-18: `--pr` is a number — a traversal in it never reaches a manifest path (unit and CLI)', () => {
  assert.throws(() => manifestPathFor('../../ESCAPED', 'a0'), /pr must be a number/)
  assert.equal(manifestPathFor('7', 'a0'), '.pair/red-snapshots/pr-7-a0.json')
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const r = spawnSync(process.execPath, [CLI, 'seal', '--pr', '../../ESCAPED', '--phase', PHASE, '--base', base, '--contract', '.pair/working/red-draft.json', '--static-gates', '[]', '--cwd', cwd], { encoding: 'utf8' })
  assert.equal(r.status, 2, r.stdout + r.stderr)
  assert.match(JSON.parse(r.stdout).error, /--pr/)
  assert.equal(existsSync(join(cwd, '.pair', 'red-snapshots')), false, 'nothing was written')
  rmSync(cwd, { recursive: true, force: true })
})

test('t9d-21: a non-ASCII test path changed above the seal is reported as `unlisted-test-changed` with its real name — never misclassified through git`s quoted output', () => {
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n', 'test/\u00fcn\u00efcode.test.js': 'new\n' })
  const chain = verifyChain({ pr: PR, base, cwd })
  assert.deepEqual(chain.breaches.map(b => `${b.code}:${b.path}`), ['unlisted-test-changed:test/\u00fcn\u00efcode.test.js'])
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
  let r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', '/etc/passwd', '--static-gates', '[]')
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stdout).reason, 'path-outside-root')
  r = run('seal', '--pr', PR, '--phase', PHASE, '--base', base, '--contract', abs, '--static-gates', '[]')
  assert.equal(r.status, 0, r.stdout)
  assert.equal(JSON.parse(r.stdout).sealed, true)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(main, { recursive: true, force: true })
})

// ── r0-1: the transient seal manifest never survives in the repository tree ──────────────────
// `seal` commits `.pair/red-snapshots/pr-<n>-<phase>.json` so the contract's record lives in
// HISTORY, and `verify` filters that exact path out of the post-seal delta (`path !== manifest`)
// precisely because the file is meant to be REMOVED above the snapshot. US-482 did it once in
// a5f4da50; this repository grew the same file back at `pr-0-a0.json`.
// Left in the tree it is the ONE path failing this repo's format gate: the gate's file set is
// `git ls-files --cached --others --exclude-standard` (scripts/format-lib/git-tracked-paths.sh),
// whose only exclusion arms are third-party skills, `.claude/workflows` and `.claude/agents` —
// never `.pair/`. So `pnpm prettier:check` exits 1, `pnpm quality-gate` and
// `.github/workflows/format.yml` cannot go green, and the head is unmergeable.
// These assertions run against THIS repository rather than a fixture because the defect IS a tree
// state; the fixture row at the bottom proves the same predicate discriminates.
const SEAL_TRAILER_RE = /^Pair-RED-Snapshot: pr=(\d+); phase=([^;]+); base=([0-9a-f]{40}); manifest=(\S+)$/m
const REPO = git(fileURLToPath(new URL('.', import.meta.url)), 'rev-parse', '--show-toplevel')
const hasBlob = (cwd, rev, path) => spawnSync('git', ['cat-file', '-e', `${rev}:${path}`], { cwd }).status === 0
const trackedUnder = (cwd, dir) => git(cwd, 'ls-tree', '-r', '--name-only', 'HEAD', '--', dir).split('\n').filter(Boolean)
// A GitHub squash-merge commit's body concatenates every original subcommit's subject+body — a
// seal commit's own subject and trailer can reappear verbatim in the MIDDLE of that text (US-486
// r0-5: main's squash-merge of #494 did exactly this for phase a0's seal). Scanning the whole body
// for a matching LINE therefore mistakes the squash commit itself for a seal it never made. A real
// git trailer only lives in the trailer BLOCK at the very end of a message (`git interpret-trailers`
// is git's own authority on that shape) — restricting the match to that block's output is exactly
// what distinguishes "this commit's own trailer" from "a trailer-shaped line quoted from history".
const trailerBlockOf = (cwd, body) => {
  const r = spawnSync('git', ['interpret-trailers', '--parse'], { cwd, input: body, encoding: 'utf8' })
  return r.status === 0 ? r.stdout : ''
}

// Every RED seal on HEAD's first-parent history, with where its manifest can still be read. A
// shallow checkout simply sees fewer commits; it never invents a manifest that is not there.
function sealedManifests(cwd) {
  return git(cwd, 'log', '--first-parent', '--format=%H%x1f%B%x1e', 'HEAD')
    .split('\x1e')
    .map(e => e.trim())
    .filter(e => e.includes('\x1f'))
    .map(e => {
      const sha = e.slice(0, e.indexOf('\x1f'))
      const body = e.slice(e.indexOf('\x1f') + 1)
      return { sha, m: SEAL_TRAILER_RE.exec(trailerBlockOf(cwd, body)) }
    })
    .filter(({ m }) => m)
    .map(({ sha, m }) => ({ sha, phase: m[2], manifest: m[4], inHistory: hasBlob(cwd, sha, m[4]), atHead: hasBlob(cwd, 'HEAD', m[4]) }))
}

test('r0-1 w1: no RED seal manifest is tracked at HEAD — the transient record belongs to history, not the tree', () => {
  assert.deepEqual(
    trackedUnder(REPO, '.pair/red-snapshots/'),
    [],
    'the seal manifest is transient: `seal` commits it so the contract is in history, and it must be REMOVED above the snapshot (US-482, a5f4da50). Left tracked it is the one path failing `pnpm prettier:check`, so `pnpm quality-gate` and .github/workflows/format.yml cannot go green.',
  )
})

test('r0-1 c1: the record survives the removal — every seal still carries its own manifest blob', () => {
  // The control the fix must not break: deleting the file from the TREE may never delete it from
  // the commit that sealed it, which is where `verify` reads the contract (`git show <snap>:<m>`).
  for (const s of sealedManifests(REPO)) assert.ok(s.inHistory, `${s.sha} (${s.phase}) no longer carries ${s.manifest}`)
})

test('r0-1 i1: readable at its snapshot commit AND absent from HEAD — for every seal of this branch', () => {
  // The interaction c1 and w1 do not cover on their own: the invariant is per-seal, so a second
  // round that seals again and removes only the FIRST manifest is still a defect.
  const seals = sealedManifests(REPO)
  assert.deepEqual(seals.filter(s => !s.inHistory).map(s => s.manifest), [], 'a seal commit that lost its manifest')
  assert.deepEqual(seals.filter(s => s.atHead).map(s => s.manifest), [], 'a manifest still present at HEAD was never removed above its snapshot')
})

test('r0-1 c3: the invariant may not be discharged by hiding — the format gate still sees `.pair/red-snapshots/`', () => {
  const ignored = spawnSync('git', ['check-ignore', '-q', '--', '.pair/red-snapshots/pr-0-a0.json'], { cwd: REPO }).status === 0
  assert.equal(ignored, false, 'gitignoring the directory hides the defect from the gate instead of fixing it')
  const derivation = readFileSync(join(REPO, 'scripts/format-lib/git-tracked-paths.sh'), 'utf8')
  assert.equal(/red-snapshots/.test(derivation), false, 'the gate derivation must not learn to skip the manifest')
  assert.equal(/^\s*\.pair\/[^)\n]*\)\s*continue/m.test(derivation), false, 'no `.pair/` exclusion arm may be added to the gate derivation')
})

test('r0-1 b1: vacuous where nothing was sealed, exact where a manifest was left behind (fixture)', () => {
  const { cwd, base } = repo()
  assert.deepEqual(sealedManifests(cwd), [], 'nothing sealed: nothing to report')
  assert.deepEqual(trackedUnder(cwd, '.pair/red-snapshots/'), [])
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'structural', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  const state = () => sealedManifests(cwd).map(x => [x.manifest, x.inHistory, x.atHead])
  assert.deepEqual(state(), [[s.manifest, true, true]], 'straight after the seal: in history AND in the tree — the defect state this repo is in')
  assert.deepEqual(trackedUnder(cwd, '.pair/red-snapshots/'), [s.manifest])
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  assert.deepEqual(state(), [[s.manifest, true, false]], 'removed above the snapshot: the record survives, the tree is clean')
  assert.deepEqual(trackedUnder(cwd, '.pair/red-snapshots/'), [])
  assert.equal(verifyChain({ pr: PR, base, cwd }).verified, true, 'custody is unaffected by the removal')
  rmSync(cwd, { recursive: true, force: true })
})

test('r0-1 b2: a trailer-shaped line embedded inside a LATER, unrelated commit body (a squash merge concatenates every original subcommit message into one) is never mistaken for that commit sealing anything — only a REAL trailer block (git interpret-trailers) counts (US-486 r0-5: main`s own squash-merge of #494 embedded phase a0`s seal trailer inside the merge commit`s body, and the naive line-scan mistook that merge commit for the seal itself, `inHistory:false` because a squash commit`s tree never matches the real seal`s)', () => {
  const { cwd, base } = repo()
  redContract(cwd, { fixScope: { owner: 'a()', mode: 'structural', allowedPaths: ['src/'] } })
  const s = seal({ pr: PR, phase: PHASE, base, contractPath: '.pair/working/red-draft.json', cwd })
  rmSync(join(cwd, '.pair/working/red-draft.json'))
  const sealSha = git(cwd, 'rev-parse', 'HEAD')
  const sealSubject = git(cwd, 'log', '-1', '--format=%s', sealSha)
  const sealTrailer = trailerFor({ pr: PR, phase: PHASE, base, manifest: s.manifest })
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  assert.deepEqual(
    sealedManifests(cwd).map(x => [x.manifest, x.inHistory, x.atHead]),
    [[s.manifest, true, false]],
    'exactly one real seal, correctly recorded, before the squash-shaped commit lands',
  )
  // A later commit whose body is a GitHub-squash-style concatenation: the seal's own subject +
  // trailer line reappear verbatim in the MIDDLE of the message, followed by more unrelated
  // history and a real trailer block at the very end. This never carries the manifest in ITS
  // OWN tree (it is a different commit entirely) and must never be reported as a seal.
  // No file change here (--allow-empty): the point under test is the message-scanning, not
  // custody's out-of-scope check — a real content change is not needed to reproduce the defect.
  const squashBody = [
    'chore: squash-merge everything (simulates a GitHub squash-merge PR)',
    '',
    `* ${sealSubject}`,
    '',
    sealTrailer,
    '',
    '* docs: unrelated follow-up',
    '',
    'Some unrelated body text.',
    '',
    'Co-authored-by: Someone Else <someone@example.com>',
  ].join('\n')
  git(cwd, 'commit', '-q', '--no-verify', '--allow-empty', '-m', squashBody)
  assert.deepEqual(
    sealedManifests(cwd).map(x => [x.manifest, x.inHistory, x.atHead]),
    [[s.manifest, true, false]],
    'the squash-shaped commit must not surface as a second (broken) seal — the embedded line is not a real trailer of that commit',
  )
  assert.equal(verifyChain({ pr: PR, base, cwd }).verified, true, 'custody stays intact through the squash-shaped commit')
  rmSync(cwd, { recursive: true, force: true })
})

// ── custody overrides (<runDir>/custody-overrides.json) ─────────────────────────────────────
test('verify-chain: an out-of-scope breach on an already-sealed segment is overridden by a human-authorized, attributed entry in <runDir>/custody-overrides.json — verified against its claimed source, never on trust; malformed or mismatched entries leave the breach blocking', () => {
  const { cwd, base } = chainRepo()
  // A change to src/other.js outside r1-g1's allowedPaths (['src/a.js']) — stands in for content
  // a merge from origin/main carries into an already-sealed segment.
  write(cwd, 'src/other.js', 'export const o = 1\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'merge-carried change to src/other.js')

  const bare = verifyChain({ pr: PR, base, cwd })
  assert.equal(bare.verified, false)
  assert.ok(bare.breaches.some(b => b.code === 'out-of-scope' && b.path === 'src/other.js' && b.segment === 'r1-g1'))
  assert.equal(bare.overriddenBreaches, undefined)

  const runDir = mkdtempSync(join(tmpdir(), 'run-dir-'))
  const overridesPath = join(runDir, 'custody-overrides.json')
  // A sealed handoff must exist in runDir or `expectContract` derives to false and verifyChainCore
  // short-circuits to `verified: true` before ever reaching the segment loop — unrelated to overrides.
  writeFileSync(join(runDir, 'r1-g1-red-verify.json'), JSON.stringify({ skill: 'red-verify', sealed: true }))

  // Malformed (missing authorizedBy): dropped, never partially trusted — the breach still blocks.
  writeFileSync(overridesPath, JSON.stringify({ overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1', reason: 'x', at: new Date().toISOString() }] }))
  const malformed = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(malformed.verified, false)
  assert.ok(malformed.breaches.some(b => b.code === 'out-of-scope' && b.path === 'src/other.js'))

  // Well-formed, but its claimed source (`verifyAgainst`) disagrees with HEAD: refused, not honored on trust.
  git(cwd, 'branch', 'origin-main-stand-in', base) // at base, src/other.js still reads 'export const o = 0\n'
  writeFileSync(
    overridesPath,
    JSON.stringify({ overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1', reason: 'merge-carried from main', authorizedBy: 'maintainer', at: new Date().toISOString(), verifyAgainst: 'origin-main-stand-in' }] }),
  )
  const mismatched = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(mismatched.verified, false)
  assert.ok(mismatched.breaches.some(b => b.code === 'out-of-scope' && b.path === 'src/other.js'))
  assert.equal(mismatched.overriddenBreaches, undefined)

  // The claimed source now agrees byte-for-byte: honored, moved to overriddenBreaches, attributed.
  // It carries the same blob at a commit OF ITS OWN — a ref resolving to HEAD would compare the
  // path with itself and prove nothing (r0-3), so the stand-in gets its own history here.
  git(cwd, 'checkout', '-q', '-b', 'source-branch')
  write(cwd, 'docs/side.md', 'unrelated content on the source branch\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'source-branch commit carrying the same src/other.js')
  git(cwd, 'branch', '-f', 'origin-main-stand-in', 'source-branch')
  git(cwd, 'checkout', '-q', 'main')
  const honored = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(honored.verified, true, JSON.stringify(honored))
  assert.equal(honored.breaches.length, 0)
  assert.equal(honored.overriddenBreaches?.length, 1)
  assert.equal(honored.overriddenBreaches[0].code, 'out-of-scope')
  assert.equal(honored.overriddenBreaches[0].path, 'src/other.js')
  assert.equal(honored.overriddenBreaches[0].override.authorizedBy, 'maintainer')
  assert.equal(honored.overriddenBreaches[0].override.verifyAgainst, 'origin-main-stand-in')

  // A different segment / different code never matches this entry — no accidental over-reach.
  writeFileSync(
    overridesPath,
    JSON.stringify({ overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g2-not-this-one', reason: 'wrong segment', authorizedBy: 'maintainer', at: new Date().toISOString() }] }),
  )
  const wrongSegment = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(wrongSegment.verified, false)
  assert.ok(wrongSegment.breaches.some(b => b.code === 'out-of-scope' && b.path === 'src/other.js'))

  rmSync(cwd, { recursive: true, force: true })
  rmSync(runDir, { recursive: true, force: true })
})

test('verify-chain: a `verifyAgainst` that proves nothing — declared but empty, or resolving to HEAD itself — never honors an override (r0-3)', () => {
  const { cwd, base } = chainRepo()
  write(cwd, 'src/other.js', 'export const o = 1\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'merge-carried change to src/other.js')
  const runDir = mkdtempSync(join(tmpdir(), 'run-dir-'))
  writeFileSync(join(runDir, 'r1-g1-red-verify.json'), JSON.stringify({ skill: 'red-verify', sealed: true }))
  const overridesPath = join(runDir, 'custody-overrides.json')
  const put = extra =>
    writeFileSync(
      overridesPath,
      JSON.stringify({
        overrides: [{ code: 'out-of-scope', path: 'src/other.js', segment: 'r1-g1', reason: 'merge-carried from main', authorizedBy: 'maintainer', at: new Date().toISOString(), ...extra }],
      }),
    )
  const blocked = why => {
    const r = verifyChain({ pr: PR, base, cwd, runDir })
    assert.equal(r.verified, false, why)
    assert.ok(
      r.breaches.some(b => b.code === 'out-of-scope' && b.path === 'src/other.js'),
      why,
    )
    assert.equal(r.overriddenBreaches, undefined, why)
  }
  // (a) the field is DECLARED, so it must prove something. Empty, blank or not a string is not a
  // claim that passed its check — it is a claim that cannot be checked, and fail-safe means the
  // breach stays blocking. (`''` short-circuited to "honored" before r0-3; `[]` stringified to
  // `:<path>`, the INDEX version of the file, which matches HEAD after any commit.)
  for (const v of ['', '   ', null, 42, [], {}]) {
    put({ verifyAgainst: v })
    blocked(`verifyAgainst: ${JSON.stringify(v)}`)
  }
  // (b) a ref resolving to HEAD compares the path with ITSELF — always true, self-attested.
  // A ref that NAMES a non-commit object at HEAD (an annotated tag, a tree) is included here
  // deliberately: `rev-parse --verify` alone returns what the ref NAMES, not what it peels to, so
  // without `^{commit}` on both sides these two slipped through the OTHER-COMMIT check (their
  // rev-parse output differs from HEAD's raw commit sha) while `${ref}:${path}` still resolved
  // through HEAD's own tree — the same self-attestation as the bare `HEAD` case, one layer deeper.
  git(cwd, 'branch', '-f', 'self-ref', 'HEAD')
  git(cwd, 'tag', '-a', 'self-ref-annotated', '-m', 'an annotated tag naming HEAD, not a commit id', 'HEAD')
  for (const v of ['HEAD', 'self-ref', git(cwd, 'rev-parse', 'HEAD'), 'self-ref-annotated', 'HEAD^{tree}']) {
    put({ verifyAgainst: v })
    blocked(`verifyAgainst: ${v} (resolves to HEAD)`)
  }
  put({ verifyAgainst: 'no-such-ref' })
  blocked('an unresolvable ref')
  // A DIFFERENT commit carrying the same blob is the proof the override needs: honored.
  git(cwd, 'checkout', '-q', '-b', 'source-branch')
  write(cwd, 'docs/side.md', 'unrelated content on the source branch\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'source-branch commit carrying the same src/other.js')
  git(cwd, 'checkout', '-q', 'main')
  put({ verifyAgainst: 'source-branch' })
  const honored = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(honored.verified, true, JSON.stringify(honored))
  assert.equal(honored.overriddenBreaches?.[0].override.verifyAgainst, 'source-branch')
  // No `verifyAgainst` at all is a different statement — nothing is claimed, so nothing is
  // checked: the override stands on its attribution alone, as documented.
  put({})
  const noClaim = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(noClaim.verified, true, JSON.stringify(noClaim))
  assert.equal(noClaim.overriddenBreaches?.[0].override.verifyAgainst, undefined)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(runDir, { recursive: true, force: true })
})

test('verify-chain: only an allow-listed breach code accepts a human override — the set is named, never inferred from the shape of the breach (r0-4)', () => {
  assert.deepEqual([...OVERRIDABLE_BREACH_CODES].sort(), ['behavioral-adds-or-moves-module', 'out-of-scope', 'test-blob-changed', 'test-mode-production-change', 'unlisted-test-changed'])
  assert.ok(!OVERRIDABLE_BREACH_CODES.includes('parent-not-base'), 'ancestry is not a human-overridable property')
  const { cwd, base } = chainRepo()
  // A crafted snapshot whose trailer names a base that is NOT its parent → `parent-not-base`.
  const head = git(cwd, 'rev-parse', 'HEAD')
  const trailer = trailerFor({ pr: PR, phase: 'r1-g2', base: 'a'.repeat(40), manifest: manifestPathFor(PR, 'r1-g2') })
  const crafted = git(cwd, 'commit-tree', git(cwd, 'rev-parse', 'HEAD^{tree}'), '-p', head, '-m', `red: crafted snapshot\n\n${trailer}`)
  git(cwd, 'reset', '-q', '--hard', crafted)
  const runDir = mkdtempSync(join(tmpdir(), 'run-dir-'))
  writeFileSync(join(runDir, 'r1-g1-red-verify.json'), JSON.stringify({ skill: 'red-verify', sealed: true }))
  // A malicious (or merely mistaken) entry naming a non-overridable code, dressed in the
  // path+segment shape the old duck-typed check keyed on: never honored.
  writeFileSync(
    join(runDir, 'custody-overrides.json'),
    JSON.stringify({
      overrides: [{ code: 'parent-not-base', path: 'src/a.js', segment: 'r1-g1', reason: 'ancestry is not mine to waive', authorizedBy: 'maintainer', at: new Date().toISOString() }],
    }),
  )
  const r = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(r.verified, false)
  assert.ok(
    r.breaches.some(b => b.code === 'parent-not-base'),
    JSON.stringify(r.breaches),
  )
  assert.equal(r.overriddenBreaches, undefined)
  rmSync(cwd, { recursive: true, force: true })
  rmSync(runDir, { recursive: true, force: true })
})

// ── reattest (a sealed witness whose content already changed via a commit outside this contract) ──
test('seal: a `reattest` revision re-seals a witness whose content is ALREADY at HEAD (a merge committed it, nothing left to make dirty) — without it, seal refuses artifact-not-changed exactly as before; a malformed reattest is refused by contractErrors, never partially trusted; the seal alone does not clear the per-segment custody breach, which stays a separate, ordinary human-authorized override', () => {
  const { cwd, base, s1, head1 } = chainRepo()
  // Simulate a merge from elsewhere: the sealed test file gets NEW content in an ORDINARY commit,
  // not through this contract's own GREEN — exactly like PR #497 landing inside r2-g2's fixScope.
  write(cwd, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\n// merge-carried addition\nif (typeof a !== "function") throw new Error("FAIL not-a-fn")\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'merge-carried: extend the sealed witness')
  const mergedHead = git(cwd, 'rev-parse', 'HEAD')
  const newHash = hashFile('test/a.test.js', cwd)

  const revisionContract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    revision: 2,
    supersedes: 'r1-g1',
    matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }],
    redTests: [{ file: 'test/a.test.js', kind: 'test', baseline: 'red', sha256: newHash, command: 'node test/a.test.js', observed: 'Original failure at base (unchanged): FAIL. Re-sealed at merged head with no new dirty change — content already matches via the merge commit above.' }],
    testExempt: false,
    // US-506 AC9: the re-sealed witness file differs from the predecessor's — the revision names its row
    changedRows: ['row-1'],
  }

  // Without `reattest`: refused exactly as it always was — nothing silently widened.
  write(cwd, '.pair/working/no-reattest.json', JSON.stringify(revisionContract))
  const bare = seal({ pr: PR, phase: 'r1-g1-rev2', base: mergedHead, contractPath: '.pair/working/no-reattest.json', cwd })
  assert.equal(bare.sealed, false)
  assert.equal(bare.reason, 'artifact-not-changed')
  assert.deepEqual(bare.paths, ['test/a.test.js'])
  rmSync(join(cwd, '.pair/working/no-reattest.json'))

  // A malformed reattest (no reason): contractErrors refuses it before seal ever runs its own checks.
  assert.match(contractErrors({ ...revisionContract, reattest: {} }).join(), /reattest\.reason missing/)
  assert.match(contractErrors({ ...revisionContract, reattest: 'yes' }).join(), /reattest must be an object/)
  assert.deepEqual(contractErrors({ ...revisionContract, reattest: { reason: 'merge-carried' } }), [])

  // With a well-formed `reattest`: seal proceeds, writing the manifest alone (the witness file is
  // already at its declared content — nothing to commit for it).
  write(cwd, '.pair/working/rev-draft.json', JSON.stringify({ ...revisionContract, reattest: { reason: "Content already at HEAD via a merge this branch's own gate forced; nothing left to make dirty." } }))
  const s2 = seal({ pr: PR, phase: 'r1-g1-rev2', base: mergedHead, contractPath: '.pair/working/rev-draft.json', cwd })
  assert.equal(s2.sealed, true, JSON.stringify(s2))
  assert.equal(git(cwd, 'rev-parse', `${s2.snapshot}^`), mergedHead, 'the seal commit sits directly above the merge commit — nothing else was committed in between')
  rmSync(join(cwd, '.pair/working/rev-draft.json'))

  // verify-chain WITHOUT an override still reports the segment-level breach: `reattest` only
  // waives seal()'s own dirty requirement, never the per-segment custody rule that a sealed blob
  // changed inside r1-g1's own segment (before r1-g1-rev2 existed) was unauthorized AT THAT TIME —
  // custody is never retroactive. This breach carries `path` + `segment`, so — unlike the global
  // blob-identity form — it IS reachable by the ordinary human-authorized override mechanism.
  const bareChain = verifyChain({ pr: PR, base, cwd })
  assert.equal(bareChain.verified, false)
  assert.ok(bareChain.breaches.some(b => b.code === 'test-blob-changed' && b.path === 'test/a.test.js' && b.segment === 'r1-g1'))

  const runDir = mkdtempSync(join(tmpdir(), 'run-dir-'))
  writeFileSync(join(runDir, 'r1-g1-red-verify.json'), JSON.stringify({ skill: 'red-verify', sealed: true }))
  writeFileSync(
    join(runDir, 'custody-overrides.json'),
    JSON.stringify({
      overrides: [
        {
          code: 'test-blob-changed',
          path: 'test/a.test.js',
          segment: 'r1-g1',
          reason: 'The r1-g1-rev2 seal (validated independently) re-attests this exact content — this is the segment-level record of the same authorized reattest, not a new unreviewed change.',
          authorizedBy: 'maintainer',
          at: new Date().toISOString(),
        },
      ],
    }),
  )
  const chain = verifyChain({ pr: PR, base, cwd, runDir })
  assert.equal(chain.verified, true, JSON.stringify(chain))
  assert.deepEqual(chain.snapshots.map(s => s.phase), ['r1-g1', 'r1-g1-rev2'])
  assert.equal(chain.overriddenBreaches?.length, 1)
  rmSync(runDir, { recursive: true, force: true })

  rmSync(cwd, { recursive: true, force: true })
})

// ══ US-506 T-2 — a fresh run has no `a0` seal: custody starts at the base, with no `a0` segment ══
const freshRunDir = handoffs => {
  const dir = join(mkdtempSync(join(tmpdir(), 'fresh-run-')), '.pair', 'working', 'runs', 'story-7', '7')
  mkdirSync(dir, { recursive: true })
  for (const [name, data] of Object.entries(handoffs)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(data))
  return dir
}
test('US-506 T-2 w1: a fresh run implemented above the base with no seal — its tests and code change freely — verify-chain over the run directory is verified, contract none', () => {
  const { cwd, base } = repo()
  // the implement stage: tests and code together, test-first, no RED snapshot anywhere
  write(cwd, 'test/new.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\n')
  write(cwd, 'src/a.js', 'export const a = () => 2\n')
  write(cwd, 'src/added.js', 'export const b = 1\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'implement')
  const runDir = freshRunDir({ 'a0-implement-phase': { skill: 'implement-phase', phase: 'a0', status: 'ok', gatesPassed: true } })
  const chain = verifyChain({ pr: PR, base, cwd, runDir })
  assert.deepEqual({ verified: chain.verified, contract: chain.contract, breaches: chain.breaches }, { verified: true, contract: 'none', breaches: [] })
  assert.equal(chain.contractExpectation.expectContract, false)
  rmSync(cwd, { recursive: true, force: true })
})

test('US-506 T-2 w2: a fresh run that reached a remediation round — the implement commits precede the first seal and are never a segment; the r1 segment keeps every guarantee', () => {
  const { cwd, base } = repo()
  write(cwd, 'test/new.test.js', 'if (1 !== 1) throw new Error("FAIL")\n')
  write(cwd, 'src/other.js', 'export const o = 5\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const runDir = freshRunDir({ 'a0-implement-phase': { skill: 'implement-phase', phase: 'a0', status: 'ok' }, 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  // walked from the base (no `a0` segment) and from the round base: both verified
  for (const from of [base, head1]) {
    const chain = verifyChain({ pr: PR, base: from, cwd, runDir })
    assert.equal(chain.verified, true, JSON.stringify(chain.breaches))
    assert.deepEqual(chain.snapshots.map(x => x.phase), ['r1-g1'])
  }
  // control: a production change outside the r1 scope, after the seal, is still a breach
  write(cwd, 'src/other.js', 'export const o = 6\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'out of scope')
  assert.deepEqual(verifyChain({ pr: PR, base, cwd, runDir }).breaches.map(b => [b.code, b.path]), [['out-of-scope', 'src/other.js']])
  rmSync(cwd, { recursive: true, force: true })
})

// ══ US-506 T-6 — ONE pre-seal guard: static gates, hermeticity, provenance, changedRows ══════════
// Carried from US-487 T-8: the `a0` contract sealed an unused local (quality-gate red for ANY
// implementation) and a witness that passes for anything. Each refusal below names the file.
const sealCli = (cwd, args, env = {}) => {
  const r = spawnSync(process.execPath, [CLI, 'seal', ...args, '--cwd', cwd], { encoding: 'utf8', env: { ...process.env, ...env } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop() || '{}'), stderr: r.stderr }
}
// A "real" `gh` standing FIRST on PATH, so a witness that shells out to `gh` is observable and the
// suite never reaches the operator's real tracker, before or after the guard exists.
function realGhOnPath() {
  const dir = mkdtempSync(join(tmpdir(), 'real-gh-'))
  const log = join(dir, 'reached.log')
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`)
  spawnSync('chmod', ['+x', join(dir, 'gh')])
  return { PATH: `${dir}:${process.env.PATH}`, log }
}
function witnessRepo(testBody) {
  const { cwd, base } = repo()
  write(cwd, 'test/w.test.js', testBody)
  const contract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/w.test.js', expected: '2', covers: ['r0-1'] }],
    redTests: [{ file: 'test/w.test.js', kind: 'test', sha256: hashFile('test/w.test.js', cwd), command: 'node test/w.test.js', observed: 'Error: FAIL' }],
    testExempt: false,
  }
  write(cwd, '.pair/working/w-draft.json', JSON.stringify(contract))
  return { cwd, base, contractPath: '.pair/working/w-draft.json' }
}
const LINT_UNUSED = JSON.stringify([{ name: 'lint', command: [process.execPath, '-e', 'const s=require("fs").readFileSync(process.argv[1],"utf8"); if (/const unusedLocal/.test(s)) { console.error(process.argv[1] + ": unusedLocal is assigned a value but never used"); process.exit(1) }', '{file}'] }])

test('US-506 T-6 w1 (AC9): a listed test that fails the repo static gates is refused before the seal, naming the file; a clean one seals', () => {
  const bad = witnessRepo('const unusedLocal = 1\nimport("../src/a.js").then(m => { if (m.a() !== 2) throw new Error("FAIL") })\n')
  const refused = sealCli(bad.cwd, ['--pr', PR, '--phase', PHASE, '--base', bad.base, '--contract', bad.contractPath, '--static-gates', LINT_UNUSED])
  assert.equal(refused.status, 1, JSON.stringify(refused.json))
  assert.deepEqual([refused.json.sealed, refused.json.reason, refused.json.path, refused.json.gate], [false, 'static-gate-failed', 'test/w.test.js', 'lint'])
  assert.match(refused.json.output, /unusedLocal is assigned a value but never used/)
  assert.equal(git(bad.cwd, 'rev-parse', 'HEAD'), bad.base, 'nothing committed')
  const good = witnessRepo('import("../src/a.js").then(m => { if (m.a() !== 2) throw new Error("FAIL") })\n')
  const ok = sealCli(good.cwd, ['--pr', PR, '--phase', PHASE, '--base', good.base, '--contract', good.contractPath, '--static-gates', LINT_UNUSED])
  assert.equal(ok.json.sealed, true, JSON.stringify(ok.json))
  assert.deepEqual(ok.json.preSeal.staticGates.map(g => [g.gate, g.path, g.exitCode]), [['lint', 'test/w.test.js', 0]])
})

test('US-506 T-6 w2 (AC9): a listed test that spawns a REAL `gh` or reaches the network is refused, naming the file; a stubbed `gh` and a loopback socket seal', () => {
  const real = realGhOnPath()
  const gh = witnessRepo('require("child_process").spawnSync("gh", ["issue", "view", "7"])\nthrow new Error("FAIL")\n')
  const r1 = sealCli(gh.cwd, ['--pr', PR, '--phase', PHASE, '--base', gh.base, '--contract', gh.contractPath, '--static-gates', '[]'], { PATH: real.PATH })
  assert.deepEqual([r1.json.sealed, r1.json.reason, r1.json.path], [false, 'test-spawns-gh', 'test/w.test.js'], JSON.stringify(r1.json))
  assert.equal(existsSync(real.log), false, 'the probe intercepted gh before any real one ran')
  const net = witnessRepo('const s = require("net").connect({ host: "pair-seal-probe.invalid", port: 443 }); s.on("error", () => {}); setTimeout(() => { throw new Error("FAIL") }, 50)\n')
  const r2 = sealCli(net.cwd, ['--pr', PR, '--phase', PHASE, '--base', net.base, '--contract', net.contractPath, '--static-gates', '[]'], { PATH: real.PATH })
  assert.deepEqual([r2.json.sealed, r2.json.reason, r2.json.path, r2.json.host], [false, 'test-reaches-network', 'test/w.test.js', 'pair-seal-probe.invalid'], JSON.stringify(r2.json))
  // hermetic tests seal: gh is the test's own stub, the socket is loopback
  const stubbed = witnessRepo('const { mkdtempSync, writeFileSync, chmodSync } = require("fs"); const { join } = require("path"); const d = mkdtempSync(join(require("os").tmpdir(), "stub-")); writeFileSync(join(d, "gh"), "#!/bin/sh\\nexit 0\\n"); chmodSync(join(d, "gh"), 0o755)\nrequire("child_process").spawnSync("gh", ["x"], { env: { ...process.env, PATH: d + ":" + process.env.PATH } })\nconst s = require("net").connect({ host: "127.0.0.1", port: 9 }); s.on("error", () => {}); setTimeout(() => { throw new Error("FAIL") }, 50)\n')
  const r3 = sealCli(stubbed.cwd, ['--pr', PR, '--phase', PHASE, '--base', stubbed.base, '--contract', stubbed.contractPath, '--static-gates', '[]'], { PATH: real.PATH })
  assert.equal(r3.json.sealed, true, JSON.stringify(r3.json))
  assert.equal(r3.json.preSeal.hermetic.probed, 1)
  assert.equal(existsSync(real.log), false)
})

test('US-506 T-6 w3 (AC9): a `predecessorContractHash` that matches no sealed predecessor is refused; the real one seals', () => {
  const { cwd, head1 } = chainRepo()
  const sealedManifest = JSON.parse(git(cwd, 'show', `HEAD~1:${manifestPathFor(PR, 'r1-g1')}`))
  const { $meta, ...sealedContract } = sealedManifest
  void $meta
  const wrong = revision(cwd, head1, { predecessorContractHash: `sha256:${'f'.repeat(64)}` })
  assert.deepEqual([wrong.sealed, wrong.reason, wrong.stated], [false, 'predecessor-hash-unmatched', `sha256:${'f'.repeat(64)}`])
  assert.match(String(wrong.path), /rev-draft\.json$/, 'names the contract file')
  const right = revision(cwd, head1, { predecessorContractHash: contractHash(sealedContract) })
  assert.equal(right.sealed, true, JSON.stringify(right))
  rmSync(cwd, { recursive: true, force: true })
})

test('US-506 T-6 w4 (AC9): a revision whose `changedRows` omits a witness its own diff modifies — or a row it edits — is refused, naming the file or the row', () => {
  let { cwd, head1 } = chainRepo()
  const omitsFile = revision(cwd, head1, { changedRows: [] })
  assert.deepEqual([omitsFile.sealed, omitsFile.reason, omitsFile.path], [false, 'changed-rows-omit-witness', 'test/a.test.js'], JSON.stringify(omitsFile))
  const editsRow = revision(cwd, head1, { matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '3', covers: ['r0-1'] }, { id: 'row-2', kind: 'witness', baseline: 'red', condition: 'empty', oracle: 'node test/a.test.js', expected: '0', covers: ['r1-1'] }] })
  assert.deepEqual([editsRow.sealed, editsRow.reason, editsRow.rows], [false, 'changed-rows-omit-row', ['row-1']], JSON.stringify(editsRow))
  const complete = revision(cwd, head1)
  assert.equal(complete.sealed, true, JSON.stringify(complete))
  rmSync(cwd, { recursive: true, force: true })
})

test('US-506 T-6 c1 (control): a clean contract seals unchanged through the CLI — the same commit shape, the same manifest — and the guard reports what it ran', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const out = sealCli(cwd, ['--pr', PR, '--phase', PHASE, '--base', base, '--contract', contractPath, '--static-gates', '[]'])
  assert.equal(out.json.sealed, true, JSON.stringify(out.json))
  assert.deepEqual(git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', out.json.snapshot).split('\n').sort(), [manifestPathFor(PR, PHASE), 'test/a.test.js'].sort())
  assert.deepEqual(out.json.preSeal.staticGates, [])
  // without --static-gates the CLI refuses to seal blind: the repo's gates are a required input
  const { cwd: c2, base: b2 } = repo()
  const { contractPath: p2 } = redContract(c2)
  const blind = sealCli(c2, ['--pr', PR, '--phase', PHASE, '--base', b2, '--contract', p2])
  assert.equal(blind.status, 2)
  assert.match(blind.json.error, /--static-gates/)
})

// ══ US-506 T-7 — a merge from the base is not a PR change ═══════════════════════════════════════
// US-487: the maintainer-decided merge of origin/main (`f9d71a2d`) brought 7 files byte-identical to
// main into the r0 custody walk, which counted them as the PR's own changes — 7 attributed overrides.
function mergedFromMain() {
  const { cwd, base } = repo()
  // the story: a fresh implement, then a remediation seal and its GREEN
  git(cwd, 'checkout', '-q', '-b', 'story')
  write(cwd, 'src/a.js', 'export const a = () => 1 // implemented\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // meanwhile main moves: 7 files — production outside the fix scope, tests, a new module
  git(cwd, 'checkout', '-q', 'main')
  const mainFiles = { 'src/other.js': 'export const o = 7\n', 'src/new-module.js': 'export const n = 1\n', 'docs/guide.md': '# guide\n', 'apps/cli/run.ts': 'export {}\n', 'test/other.test.js': 'if (1 !== 1) throw new Error("FAIL")\n', 'apps/cli/run.test.ts': 'export {}\n', '.github/workflows/ci.yml': 'on: push\n' }
  for (const [rel, content] of Object.entries(mainFiles)) write(cwd, rel, content)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'main moves on')
  const mainHead = git(cwd, 'rev-parse', 'HEAD')
  git(cwd, 'checkout', '-q', 'story')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'main')
  return { cwd, head1, mainHead, mainFiles }
}
const runDirWith = handoffs => {
  const dir = join(mkdtempSync(join(tmpdir(), 'merge-run-')), '.pair', 'working', 'runs', 'story-7', '7')
  mkdirSync(dir, { recursive: true })
  for (const [name, data] of Object.entries(handoffs)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(data))
  return dir
}

test('US-506 T-7 w1 (AC11): the files a merge of the base brought in, byte-identical to it, are not PR changes — verified with no override', () => {
  const { cwd, head1, mainFiles } = mergedFromMain()
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  // the US-487 shape: without knowing the base, every merged file is a breach of the r1-g1 segment
  const strict = verifyChain({ pr: PR, base: head1, cwd, runDir })
  assert.deepEqual(strict.breaches.map(b => b.path).sort(), Object.keys(mainFiles).sort(), JSON.stringify(strict.breaches))
  // told the base the story merged, the walk excludes what is byte-identical to it
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual({ verified: chain.verified, breaches: chain.breaches, overridden: chain.overriddenBreaches }, { verified: true, breaches: [], overridden: undefined })
  assert.deepEqual(chain.mergedBase?.paths?.sort(), Object.keys(mainFiles).sort())
  // and through the CLI the review-phase runs
  const r = spawnSync(process.execPath, [CLI, 'verify-chain', '--pr', PR, '--base', head1, '--run-dir', runDir, '--base-ref', 'main', '--cwd', cwd], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  rmSync(cwd, { recursive: true, force: true })
})

test('US-506 T-7 w2 (AC11): a merged file edited AFTER the merge differs from the base and is still a breach; a branch that is not the base earns no exemption', () => {
  const { cwd, head1 } = mergedFromMain()
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  write(cwd, 'src/other.js', 'export const o = 8 // edited by the PR after the merge\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'post-merge edit')
  assert.deepEqual(verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' }).breaches.map(b => [b.code, b.path]), [['out-of-scope', 'src/other.js']])
  // a side branch merged in is not the declared base: its files stay the PR's changes
  git(cwd, 'checkout', '-q', '-b', 'side', 'main')
  write(cwd, 'src/side.js', 'export const s = 1\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'side')
  git(cwd, 'checkout', '-q', 'story')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'side')
  const codes = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' }).breaches.map(b => b.path)
  assert.ok(codes.includes('src/side.js'), JSON.stringify(codes))
  rmSync(cwd, { recursive: true, force: true })
})

// ── US-506 F-3 (AC11): only what the MERGE brought in is exempt — never a PR-owned deletion, never a
// fixer's own revert to base content ──────────────────────────────────────────────────────────────
function sealedStoryWith(prOwned) {
  const { cwd } = repo()
  git(cwd, 'checkout', '-q', '-b', 'story')
  for (const [rel, content] of Object.entries(prOwned)) write(cwd, rel, content)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  git(cwd, 'checkout', '-q', 'main')
  write(cwd, 'docs/x.md', '# x\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'main moves on')
  git(cwd, 'checkout', '-q', 'story')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'main')
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  return { cwd, head1, runDir }
}
test('US-506 F-3 w1 (AC11): a PR-owned file deleted after a base merge, outside fixScope, is still a breach', () => {
  const { cwd, head1, runDir } = sealedStoryWith({ 'src/pr-only.js': 'export const p = 1\n' })
  git(cwd, 'rm', '-q', 'src/pr-only.js')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'delete a PR-owned file out of scope')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path]), [['out-of-scope', 'src/pr-only.js']], JSON.stringify(chain))
  assert.deepEqual(chain.mergedBase?.paths, ['docs/x.md'], 'only what the merge brought in is exempt')
  rmSync(cwd, { recursive: true, force: true })
})
test('US-506 F-3 w2 (AC11): a fixer\'s own edit that restores an out-of-scope file to the base content — a path the merge never changed — is still a breach', () => {
  const { cwd, head1, runDir } = sealedStoryWith({ 'src/other.js': 'export const o = 99 // changed by the implement stage\n' })
  write(cwd, 'src/other.js', 'export const o = 0\n') // byte-identical to main, but the merge did not bring it
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'revert an out-of-scope file to base')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path]), [['out-of-scope', 'src/other.js']], JSON.stringify(chain))
  rmSync(cwd, { recursive: true, force: true })
})
