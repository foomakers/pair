import { CLI_URL, CLI, sh, git, write, repo, redContract, PR, PHASE, sealed, green, chainRepo, chainBase, revision, mainCheckout, SEAL_TRAILER_RE, REPO, hasBlob, trackedUnder, trailerBlockOf, sealedManifests, freshRunDir, sealCli, realGhOnPath, witnessRepo, LINT_UNUSED, pkgWitnessRepo, sealEmpty, LINT_REPORTS, AFAIL, GREENT, witnessRow, revContract, commitAll, mergedFromMain, runDirWith, sealedStoryWith, docContract, MULTI, withLine, movedBaseStory, DS, FOO_DS, FOO_MIRROR, BAR_DS, BAR_MIRROR, LLMS, llmsWith, generatedStory, regenerate, REGENERATED, conflictingBase, assert, test, mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, contractHash, baseSync, BASE_SYNC_FIX, llmsDerivedTitle, pushSnapshot, artifactPathsOf, contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath, OVERRIDABLE_BREACH_CODES } from './red-snapshot-lib.mjs'

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

test('verify: GREEN inside fixScope, tests untouched, manifest removed ⇒ verified', () => {
  const { cwd, base, snapshot, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v, { verified: true, contractBreach: false, snapshot, manifest, breaches: [] })
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

test('defect AQ (c): a lint violation IN the listed test is refused as package:lint, nothing committed', () => {
  const r = pkgWitnessRepo({ lintJs: LINT_REPORTS('src/a.test.js') })
  const out = sealEmpty(r)
  assert.deepEqual([out.json.sealed, out.json.reason, out.json.gate, out.json.path], [false, 'static-gate-failed', 'package:lint', r.tf], JSON.stringify(out.json))
  assert.match(out.json.output, /complexity 13 > 10/)
  assert.equal(git(r.cwd, 'rev-parse', 'HEAD'), r.base, 'nothing committed')
})

test('defect AQ: a gate that hangs is killed with its WHOLE process tree on timeout; chatty output is not refused as ENOBUFS', async () => {
  const { runStaticGates } = await import(CLI_URL)
  const { cwd } = repo()
  const pidFile = join(cwd, 'child.pid')
  const contract = { testExempt: false, redTests: [{ file: 'test/a.test.js', kind: 'test' }] }
  const hang = [{ name: 'hang', command: ['sh', '-c', `sleep 60 & echo $! > ${pidFile}; wait`] }]
  const r = runStaticGates({ gates: hang, contract, cwd, timeoutMs: 700 })
  assert.deepEqual([r.refusal.reason, r.refusal.gate], ['static-gate-failed', 'hang'])
  assert.match(r.refusal.output, /timed out/)
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  let alive = true
  try { process.kill(pid, 0) } catch { alive = false }
  assert.equal(alive, false, 'the grandchild died with the group')
  // a daemon that inherits the pipes and outlives the gate must not hang the seal
  const t0 = Date.now()
  const daemon = runStaticGates({ gates: [{ name: 'daemon', command: ['sh', '-c', 'sleep 60 & exit 3'] }], contract, cwd, timeoutMs: 2000 })
  assert.equal(daemon.refusal.reason, 'static-gate-failed')
  assert.ok(Date.now() - t0 < 8000, `returned in ${Date.now() - t0}ms`)
  const chatty = runStaticGates({ gates: [{ name: 'chatty', command: [process.execPath, '-e', 'process.stdout.write("x".repeat(20 * 1024 * 1024))'] }], contract, cwd })
  assert.equal(chatty.refusal, undefined, JSON.stringify(chatty.refusal))
})

test('US-506 T-6 w4 (AC9): a revision whose `changedRows` omits a witness its own diff modifies — or a row it edits — is refused, naming the file or the row', () => {
  let { cwd, head1 } = chainRepo()
  const omitsFile = revision(cwd, head1, { changedRows: [], matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }] })
  assert.deepEqual([omitsFile.sealed, omitsFile.reason, omitsFile.path], [false, 'changed-rows-omit-witness', 'test/a.test.js'], JSON.stringify(omitsFile))
  // an edited row the agent omitted is DERIVED from the diff (union), recorded in the manifest, never refused
  const editsRow = revision(cwd, head1, { matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '3', covers: ['r0-1'] }, { id: 'row-2', kind: 'witness', baseline: 'red', condition: 'empty', oracle: 'node test/a.test.js', expected: '0', covers: ['r1-1'] }] })
  assert.equal(editsRow.sealed, true, JSON.stringify(editsRow))
  assert.deepEqual(JSON.parse(git(cwd, 'show', `${editsRow.snapshot}:${editsRow.manifest}`)).changedRows.sort(), ['row-1', 'row-2'])
  rmSync(cwd, { recursive: true, force: true })
})

test('US-587 AC5 replay: omitted changedRows + unchanged witness + green-at-head witness seal in a single revision, manifest carries all three derivations', () => {
  const { cwd } = chainRepo()
  write(cwd, 'test/c.test.js', 'throw new Error("FAIL c")\n')
  const head = commitAll(cwd, 'c already at head')
  write(cwd, 'test/a.test.js', AFAIL)
  write(cwd, 'test/b.test.js', GREENT)
  revContract(cwd, ['test/a.test.js', 'test/b.test.js', 'test/c.test.js'], [witnessRow('row-1', 'test/a.test.js', 'r0-1'), witnessRow('row-2', 'test/a.test.js', 'r1-1'), witnessRow('row-3', 'test/b.test.js', 'r1-2'), witnessRow('row-4', 'test/c.test.js', 'r1-3')])
  const s = seal({ pr: PR, phase: 'r1-g1-rev2', base: head, contractPath: '.pair/working/rev-draft.json', cwd, hermetic: true })
  assert.equal(s.sealed, true, JSON.stringify(s))
  assert.deepEqual(s.preSeal.reclassified, ['test/b.test.js'])
  const m = JSON.parse(git(cwd, 'show', `${s.snapshot}:${s.manifest}`))
  for (const id of ['row-2', 'row-3', 'row-4']) assert.ok(m.changedRows.includes(id), id)
  assert.equal(m.reattest.reason, 'witness unchanged at head')
  assert.deepEqual(m.matrix.map(r => r.baseline), ['red', 'red', 'pass', 'red'])
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

test('pushSnapshot: a local-only seal reaches the story branch; the repo pre-push hook that rejects tracked RED manifests passes because the manifest is removed first (the commit green-fix makes), and custody still finds the snapshot', () => {
  const { cwd, base } = repo()
  const remote = mkdtempSync(join(tmpdir(), 'red-remote-'))
  git(remote, 'init', '-q', '--bare', '-b', 'main')
  git(cwd, 'remote', 'add', 'origin', remote)
  git(cwd, 'push', '-q', 'origin', 'main:refs/heads/feature/US-1-x')
  // the repository's own hygiene gate: no tracked `.pair/red-snapshots/*.json` may be pushed (husky pre-push, live)
  const hooks = mkdtempSync(join(tmpdir(), 'red-hooks-'))
  mkdirSync(hooks, { recursive: true })
  writeFileSync(join(hooks, 'pre-push'), '#!/bin/sh\nif git ls-files | grep -q "^.pair/red-snapshots/"; then echo "tracked RED manifest" >&2; exit 1; fi\n', { mode: 0o755 })
  git(cwd, 'config', 'core.hooksPath', hooks)
  const { contractPath } = redContract(cwd)
  const sealed = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(sealed.sealed, true, JSON.stringify(sealed))
  const manifest = manifestPathFor(PR, PHASE)
  assert.ok(git(cwd, 'ls-files').split('\n').includes(manifest), 'precondition: the seal tracks the manifest')

  const clone = () => {
    const d = mkdtempSync(join(tmpdir(), 'red-clone-'))
    git(d, 'clone', '-q', '-b', 'feature/US-1-x', remote, '.')
    return d
  }
  assert.notEqual(verify({ pr: PR, phase: PHASE, base, cwd: clone() }).verified, true)

  const out = pushSnapshot({ snapshot: sealed.snapshot, branch: 'feature/US-1-x', cwd })
  assert.equal(out.pushed, true, JSON.stringify(out))
  assert.equal(out.removedManifest, true)
  assert.equal(out.remoteHead, git(cwd, 'rev-parse', 'HEAD'))
  assert.equal(git(cwd, 'rev-parse', `${out.outputHead}^`), sealed.snapshot, 'one removal commit directly on top of the seal')
  assert.equal(git(cwd, 'ls-files').split('\n').includes(manifest), false)

  const fresh = clone()
  git(fresh, 'merge-base', '--is-ancestor', sealed.snapshot, 'HEAD')
  assert.equal(verifyChain({ pr: PR, base, cwd: fresh, expectContract: true }).verified, true, JSON.stringify(verifyChain({ pr: PR, base, cwd: fresh, expectContract: true })))
  assert.equal(verify({ pr: PR, phase: PHASE, base, cwd: fresh }).verified, true)

  // idempotent
  assert.equal(pushSnapshot({ snapshot: sealed.snapshot, branch: 'feature/US-1-x', cwd }).pushed, true)
})

test('pushSnapshot: a passing pre-push hook that prints more than 1 MB (a full quality gate) still pushes — the output never kills the push', () => {
  const { cwd, base } = repo()
  const remote = mkdtempSync(join(tmpdir(), 'red-remote-'))
  git(remote, 'init', '-q', '--bare', '-b', 'main')
  git(cwd, 'remote', 'add', 'origin', remote)
  git(cwd, 'push', '-q', 'origin', 'main:refs/heads/feature/US-1-x')
  const hooks = mkdtempSync(join(tmpdir(), 'red-hooks-'))
  writeFileSync(join(hooks, 'pre-push'), '#!/bin/sh\nhead -c 3000000 /dev/zero | tr "\\\\0" "x"\necho\nexit 0\n', { mode: 0o755 })
  git(cwd, 'config', 'core.hooksPath', hooks)
  const { contractPath } = redContract(cwd)
  const sealed = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  const out = pushSnapshot({ snapshot: sealed.snapshot, branch: 'feature/US-1-x', cwd })
  assert.equal(out.pushed, true, JSON.stringify(out).slice(0, 400))
})

test('C1 doc custody: a DIRECTORY in allowedPaths admits only PROSE files — code inside it (skills/x/scripts/run.mjs) is a breach in verify AND verify-chain, prose is not', () => {
  const { cwd } = repo()
  write(cwd, 'skills/x/SKILL.md', 'old\n')
  git(cwd, 'add', '-A'); git(cwd, 'commit', '-q', '--no-verify', '-m', 'skill')
  const docBase = git(cwd, 'rev-parse', 'HEAD')
  write(cwd, '.pair/working/doc-draft.json', JSON.stringify(docContract({ fixScope: { owner: 'x', mode: 'doc', allowedPaths: ['skills/x/'] } })))
  const sealed = seal({ pr: PR, phase: PHASE, base: docBase, contractPath: '.pair/working/doc-draft.json', cwd })
  assert.equal(sealed.sealed, true, JSON.stringify(sealed))
  write(cwd, 'skills/x/SKILL.md', 'new\n')
  git(cwd, 'add', 'skills/x/SKILL.md'); git(cwd, 'commit', '-q', '--no-verify', '-m', 'prose')
  assert.equal(verify({ pr: PR, phase: PHASE, base: docBase, cwd }).verified, true)
  assert.equal(verifyChain({ pr: PR, base: docBase, cwd, expectContract: true }).verified, true, JSON.stringify(verifyChain({ pr: PR, base: docBase, cwd, expectContract: true })))
  write(cwd, 'skills/x/scripts/run.mjs', 'export const run = () => 1\n')
  git(cwd, 'add', 'skills/x/scripts/run.mjs'); git(cwd, 'commit', '-q', '--no-verify', '-m', 'code in a doc segment')
  const one = verify({ pr: PR, phase: PHASE, base: docBase, cwd })
  assert.equal(one.verified, false)
  assert.ok(one.breaches.some(b => b.code === 'doc-code-change' && b.path === 'skills/x/scripts/run.mjs'), JSON.stringify(one.breaches))
  const chain = verifyChain({ pr: PR, base: docBase, cwd, expectContract: true })
  assert.equal(chain.verified, false)
  assert.ok(chain.breaches.some(b => b.code === 'doc-code-change'), JSON.stringify(chain.breaches))
})

test('AN w1: a path BOTH sides edited (different hunks) merges clean — the recomputed merge is not the agent`s change; verified, reported under mergedBase', () => {
  const { cwd, head1, runDir } = movedBaseStory()
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual({ verified: chain.verified, breaches: chain.breaches }, { verified: true, breaches: [] }, JSON.stringify(chain))
  assert.ok(chain.mergedBase?.paths?.includes('docs/shared.md'), JSON.stringify(chain.mergedBase))
  rmSync(cwd, { recursive: true, force: true })
})

test('AN tamper: an edit AFTER the merge to a sealed test, or to a merged PR-owned file, is still a breach', () => {
  const { cwd, head1, runDir } = movedBaseStory({ sealTest: true })
  write(cwd, 'test/multi.test.js', withLine(3, 'weakened after the merge') .replace('sealed witness', 'sealed witness'))
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'weaken the witness')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.equal(chain.verified, false)
  assert.ok(chain.breaches.some(b => b.code === 'test-blob-changed' && b.path === 'test/multi.test.js'), JSON.stringify(chain.breaches))
  rmSync(cwd, { recursive: true, force: true })
  const second = movedBaseStory()
  write(second.cwd, 'docs/shared.md', readFileSync(join(second.cwd, 'docs/shared.md'), 'utf8') + 'late edit\n')
  git(second.cwd, 'commit', '-q', '--no-verify', '-am', 'late edit')
  const late = verifyChain({ pr: PR, base: second.head1, cwd: second.cwd, runDir: second.runDir, baseRef: 'main' })
  assert.deepEqual(late.breaches.map(b => [b.code, b.path]), [['out-of-scope', 'docs/shared.md']])
  rmSync(second.cwd, { recursive: true, force: true })
})

test('AN2 tamper: a mirror matching a dataset blob by BASENAME only (unrelated path), a chmod-only mirror and a symlink mirror are still breaches', () => {
  for (const variant of ['unrelated-path', 'chmod', 'symlink']) {
    const { cwd, head1, runDir } = generatedStory()
    regenerate(cwd, REGENERATED)
    if (variant === 'unrelated-path') regenerate(cwd, { '.claude/hooks/SKILL.md': 'foo v2\n' })
    if (variant === 'chmod') {
      git(cwd, 'update-index', '--chmod=+x', FOO_MIRROR)
      git(cwd, 'commit', '-q', '--no-verify', '-m', 'chmod')
    }
    if (variant === 'symlink') {
      const blob = git(cwd, 'rev-parse', `HEAD:${FOO_MIRROR}`)
      git(cwd, 'update-index', '--cacheinfo', `120000,${blob},${FOO_MIRROR}`)
      git(cwd, 'commit', '-q', '--no-verify', '-m', 'symlink')
    }
    const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
    const expected = variant === 'unrelated-path' ? '.claude/hooks/SKILL.md' : FOO_MIRROR
    assert.deepEqual(chain.breaches.map(b => b.path), [expected], variant + JSON.stringify(chain.breaches))
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('US-575 AC5: a mechanical base sync (story-owned conflict keeps ours, base-only change merged) passes custody', () => {
  const { cwd, head1, runDir } = conflictingBase()
  const out = baseSync({ cwd, base: 'main', story: PR, owned: ['src/a.js'] })
  assert.deepEqual(out.conflicts, [{ path: 'src/a.js', side: 'ours' }], JSON.stringify(out))
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual({ verified: chain.verified, breaches: chain.breaches }, { verified: true, breaches: [] }, JSON.stringify(chain))
  rmSync(cwd, { recursive: true, force: true })
})
