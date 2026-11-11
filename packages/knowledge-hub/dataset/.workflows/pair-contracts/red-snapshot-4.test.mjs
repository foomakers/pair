import { CLI_URL, CLI, sh, git, write, repo, redContract, PR, PHASE, sealed, green, chainRepo, chainBase, revision, mainCheckout, SEAL_TRAILER_RE, REPO, hasBlob, trackedUnder, trailerBlockOf, sealedManifests, freshRunDir, sealCli, realGhOnPath, witnessRepo, LINT_UNUSED, pkgWitnessRepo, sealEmpty, LINT_REPORTS, AFAIL, GREENT, witnessRow, revContract, commitAll, mergedFromMain, runDirWith, sealedStoryWith, docContract, MULTI, withLine, movedBaseStory, DS, FOO_DS, FOO_MIRROR, BAR_DS, BAR_MIRROR, LLMS, llmsWith, generatedStory, regenerate, REGENERATED, conflictingBase, assert, test, mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, contractHash, baseSync, BASE_SYNC_FIX, llmsDerivedTitle, pushSnapshot, artifactPathsOf, contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath, OVERRIDABLE_BREACH_CODES } from './red-snapshot-lib.mjs'

test('seal: one local commit above base with exactly manifest + artifacts, trailer verbatim, idempotent', () => {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const first = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(first.sealed, true, JSON.stringify(first))
  assert.equal(git(cwd, 'rev-parse', `${first.snapshot}^`), base)
  const manifest = manifestPathFor(PR, PHASE)
  assert.deepEqual(
    git(cwd, 'diff-tree', '--no-commit-id', '--name-only', '-r', first.snapshot).split('\n').sort(),
    [manifest, '.prettierignore', 'test/a.test.js'].sort(),
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

test('verify breach: a sealed test changed by GREEN (even one byte) is test-blob-changed', () => {
  const { cwd, base, manifest } = sealed()
  green(cwd, manifest, { 'src/a.js': 'export const a = () => 2\n', 'test/a.test.js': 'import { a } from "../src/a.js"\n// touched\nif (a() !== 2) throw new Error("FAIL")\n' })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.equal(v.contractBreach, true)
  assert.deepEqual(v.breaches.map(b => b.code), ['test-blob-changed'])
  rmSync(cwd, { recursive: true, force: true })
})

test('verify: a generated mirror byte-identical to its dataset file is never out-of-scope nor an unlisted test — its origin carries the verdict; a diverging mirror still breaches', () => {
  const { cwd, base, manifest } = sealed()
  green(cwd, manifest, {
    'src/a.js': 'export const a = () => 2\n',
    'packages/knowledge-hub/dataset/.pair/knowledge/a.md': '# a\n',
    '.pair/knowledge/a.md': '# a\n',
    'packages/knowledge-hub/dataset/.claude/workflows/x.test.mjs': 'ok\n',
    '.claude/workflows/x.test.mjs': 'ok\n',
    '.pair/knowledge/b.md': '# drifted, no dataset origin\n',
  })
  const v = verify({ pr: PR, phase: PHASE, base, cwd })
  assert.deepEqual(v.breaches.map(b => `${b.code}:${b.path}`).sort(), [
    'out-of-scope:.pair/knowledge/b.md',
    'out-of-scope:packages/knowledge-hub/dataset/.pair/knowledge/a.md',
    'unlisted-test-changed:packages/knowledge-hub/dataset/.claude/workflows/x.test.mjs',
  ])
  rmSync(cwd, { recursive: true, force: true })
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

test('defect AQ: a test at the repo ROOT is gated by the root package.json lint; an unparseable package.json is refused, typed', () => {
  const root = pkgWitnessRepo({ root: true, lintJs: LINT_REPORTS('test/w.test.js') })
  const refused = sealEmpty(root)
  assert.deepEqual([refused.json.sealed, refused.json.reason, refused.json.gate, refused.json.path], [false, 'static-gate-failed', 'package:lint', root.tf], JSON.stringify(refused.json))
  const bad = sealEmpty(pkgWitnessRepo({ pkgJsonRaw: '{ not json' }))
  assert.deepEqual([bad.json.sealed, bad.json.reason, bad.json.path], [false, 'package-json-unparseable', 'packages/p/package.json'], JSON.stringify(bad.json))
})

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

test('US-506 F-3 w1 (AC11): a PR-owned file deleted after a base merge, outside fixScope, is still a breach', () => {
  const { cwd, head1, runDir } = sealedStoryWith({ 'src/pr-only.js': 'export const p = 1\n' })
  git(cwd, 'rm', '-q', 'src/pr-only.js')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'delete a PR-owned file out of scope')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path]), [['out-of-scope', 'src/pr-only.js']], JSON.stringify(chain))
  assert.deepEqual(chain.mergedBase?.paths, ['docs/x.md'], 'only what the merge brought in is exempt')
  rmSync(cwd, { recursive: true, force: true })
})

for (const [name, prEdits] of [['E3 the PR never touched it', false], ['E4 the PR had edited it (modify/delete resolved to delete)', true]])
  test(`US-506 Q-2 (AC11): the base deletes a pre-fork file and the merge keeps the deletion ⇒ exempt — ${name}`, () => {
    const { cwd } = repo()
    git(cwd, 'checkout', '-q', '-b', 'story')
    if (prEdits) write(cwd, 'src/other.js', 'export const o = 5 // edited by the implement stage\n')
    else write(cwd, 'src/pr.js', 'export const p = 1\n')
    git(cwd, 'add', '-A')
    git(cwd, 'commit', '-q', '--no-verify', '-m', 'implement')
    const head1 = git(cwd, 'rev-parse', 'HEAD')
    const { contractPath } = redContract(cwd)
    const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
    assert.equal(s.sealed, true, JSON.stringify(s))
    rmSync(join(cwd, contractPath))
    green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
    git(cwd, 'checkout', '-q', 'main')
    git(cwd, 'rm', '-q', 'src/other.js')
    git(cwd, 'commit', '-q', '--no-verify', '-m', 'main deletes src/other.js')
    git(cwd, 'checkout', '-q', 'story')
    spawnSync('git', ['merge', '-q', '--no-ff', '--no-commit', 'main'], { cwd, encoding: 'utf8' }) // E4 conflicts: modify/delete
    spawnSync('git', ['rm', '-q', '--ignore-unmatch', 'src/other.js'], { cwd, encoding: 'utf8' })
    git(cwd, 'commit', '-q', '--no-verify', '-m', 'merge main')
    assert.equal(existsSync(join(cwd, 'src/other.js')), false, 'the merge kept the deletion')
    const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
    const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
    assert.deepEqual({ verified: chain.verified, breaches: chain.breaches }, { verified: true, breaches: [] }, JSON.stringify(chain))
    assert.deepEqual(chain.mergedBase?.paths, ['src/other.js'])
    rmSync(cwd, { recursive: true, force: true })
  })

test('doc contractErrors: a prose scope + checklist is valid; code paths, tests, a missing/duplicate/incomplete checklist are not', () => {
  assert.deepEqual(contractErrors(docContract()), [])
  assert.match(contractErrors(docContract({ fixScope: { owner: 'g', mode: 'doc', allowedPaths: ['src/a.js'] } })).join(), /prose/i)
  assert.match(contractErrors(docContract({ fixScope: { owner: 'g', mode: 'doc', allowedPaths: ['docs/a.md', 'scripts/x.mjs'] } })).join(), /prose/i)
  assert.match(contractErrors(docContract({ redTests: [{ file: 'test/a.test.js', kind: 'test', sha256: 'sha256:' + 'a'.repeat(64), command: 'x', observed: 'FAIL' }] })).join(), /never carries executable tests/i)
  assert.match(contractErrors(docContract({ checklist: undefined })).join(), /checklist/)
  assert.match(contractErrors(docContract({ checklist: [] })).join(), /checklist/)
  assert.match(contractErrors(docContract({ checklist: [{ id: 'c1', finding: 'r0-1', requirement: 'x', authority: 'y' }, { id: 'c1', finding: 'r0-1', requirement: 'x', authority: 'y' }] })).join(), /twice/)
  assert.match(contractErrors(docContract({ checklist: [{ id: 'c1', finding: 'r0-1', requirement: '', authority: 'y' }] })).join(), /requirement/)
  assert.match(contractErrors(docContract({ checklist: [{ id: 'c1', finding: 'r0-1', requirement: 'x' }] })).join(), /authority/)
  assert.equal(artifactPathsOf(docContract()).length, 0)
})

test('AN w2: a SEALED test the base also edited (different hunk) survives the clean merge — verified, listed under mergedBase.sealedPaths', () => {
  const { cwd, head1, runDir } = movedBaseStory({ sealTest: true })
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual({ verified: chain.verified, breaches: chain.breaches }, { verified: true, breaches: [] }, JSON.stringify(chain))
  assert.deepEqual(chain.mergedBase?.sealedPaths, ['test/multi.test.js'])
  rmSync(cwd, { recursive: true, force: true })
})

test('AN tamper: an EVIL merge — content in the merge commit beyond the recomputed three-way merge — is still a breach, for a sealed test and a PR-owned file', () => {
  for (const sealTest of [true, false]) {
    const { cwd, head1, runDir } = movedBaseStory({ sealTest })
    // redo the merge by hand with an extra edit riding inside the merge commit
    git(cwd, 'reset', '-q', '--hard', 'HEAD^')
    git(cwd, 'merge', '-q', '--no-ff', '--no-commit', 'main')
    write(cwd, 'test/multi.test.js', readFileSync(join(cwd, 'test/multi.test.js'), 'utf8').replace('l4', 'l4 // weakened inside the merge'))
    write(cwd, 'docs/shared.md', readFileSync(join(cwd, 'docs/shared.md'), 'utf8').replace('l4', 'l4 // smuggled inside the merge'))
    git(cwd, 'add', '-A')
    git(cwd, 'commit', '-q', '--no-verify', '-m', 'Merge main (evil)')
    const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
    assert.equal(chain.verified, false, `sealTest=${sealTest}`)
    assert.ok(chain.breaches.some(b => b.path === 'docs/shared.md'), JSON.stringify(chain.breaches))
    if (sealTest) assert.ok(chain.breaches.some(b => b.code === 'test-blob-changed' && b.path === 'test/multi.test.js'), JSON.stringify(chain.breaches))
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('AN2 tamper: a mirror that differs from every dataset file of its name is still out-of-scope', () => {
  const { cwd, head1, runDir } = generatedStory()
  regenerate(cwd, { ...REGENERATED, [FOO_MIRROR]: 'foo v2 // smuggled\n' })
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.equal(chain.verified, false)
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path]), [['out-of-scope', FOO_MIRROR]])
  rmSync(cwd, { recursive: true, force: true })
})

test('AN tamper: an UNSEALED production file edited by the agent BEFORE a clean merge of main (different hunks) is a breach — the recomputed merge would otherwise launder the edit', () => {
  const { cwd, head1, runDir } = movedBaseStory()
  git(cwd, 'reset', '-q', '--hard', 'HEAD^')
  write(cwd, 'docs/shared.md', readFileSync(join(cwd, 'docs/shared.md'), 'utf8').replace('l4', 'l4 agent edit before the merge'))
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'edit before merge')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'main')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path]), [['out-of-scope', 'docs/shared.md']], JSON.stringify(chain))
  rmSync(cwd, { recursive: true, force: true })
})

test('AN2: a mirror whose dataset origin was REMOVED by the merged main is exempt when deleted; a mirror deleted while its dataset file lives is a breach', () => {
  const { cwd, head1, runDir } = generatedStory()
  git(cwd, 'rm', '-q', FOO_DS) // the dataset origin goes away in a post-merge commit of main's line… simulated as part of the regeneration
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'drop foo from the dataset')
  git(cwd, 'rm', '-q', FOO_MIRROR)
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'chore: regenerate mirrors')
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.ok(!chain.breaches.some(b => b.path === FOO_MIRROR), JSON.stringify(chain.breaches))
  assert.ok(chain.breaches.some(b => b.path === FOO_DS), 'the dataset deletion itself is never exempt')
  rmSync(cwd, { recursive: true, force: true })
  const again = generatedStory()
  git(again.cwd, 'rm', '-q', FOO_MIRROR) // the dataset file lives on: deleting only its mirror is the agent's doing
  git(again.cwd, 'commit', '-q', '--no-verify', '-m', 'delete a mirror')
  const tampered = verifyChain({ pr: PR, base: again.head1, cwd: again.cwd, runDir: again.runDir, baseRef: 'main' })
  assert.deepEqual(tampered.breaches.map(b => [b.code, b.path]), [['out-of-scope', FOO_MIRROR]])
  rmSync(again.cwd, { recursive: true, force: true })
})

test('US-575 AC5: a merge whose Pair-Base-Sync record does not match its bytes (edited by hand) fails custody, saying how to fix it', () => {
  const { cwd, head1, runDir } = conflictingBase()
  spawnSync('git', ['merge', '--no-ff', '--no-commit', 'main'], { cwd })
  write(cwd, 'src/a.js', 'export const a = () => 2 // hand-resolved\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'sync', '-m', `Pair-Base-Sync: base=${git(cwd, 'rev-parse', 'main')}; ours=src/a.js`)
  const chain = verifyChain({ pr: PR, base: head1, cwd, runDir, baseRef: 'main' })
  assert.equal(chain.verified, false)
  assert.deepEqual(chain.breaches.map(b => [b.code, b.path, b.side, b.fix]), [['base-sync-mismatch', 'src/a.js', 'ours', BASE_SYNC_FIX]])
  rmSync(cwd, { recursive: true, force: true })
})

test('US-623 AC7: a seal in a repo without the ignore entry adds it in the snapshot, once, and verify accepts it', () => {
  const { cwd, base } = repo()
  write(cwd, '.prettierignore', 'dist')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'ignore file without entry')
  const head = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: PHASE, base: head, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  assert.equal(git(cwd, 'show', `${s.snapshot}:.prettierignore`), 'dist\n.pair/red-snapshots/')
  assert.equal(verify({ pr: PR, phase: PHASE, base: head, cwd }).verified, true)
  rmSync(cwd, { recursive: true, force: true })
  void base
})
