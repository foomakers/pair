// US-479 T-17 / TC-07, TC-10, TC-14 — the engine's REAL boundaries, before any live canary:
// the shipped artifact provisioned by the real installer into a clean temporary directory; real Git
// repositories with a main checkout and a separate story worktree; the installed scripts invoked
// through the same argument chain the coordinator hands the skills (an absolute contract path from
// the main checkout's run directory, validated by the coordinator's predicate, sealed from inside the
// worktree); the interruption matrix at every persisted or side-effect boundary. LLM judgment is not
// exercised here — nothing below stubs the filesystem, Git or the installer being asserted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const CLI = join(REPO, 'apps/pair-cli/dist/cli.js')
const DATASET = join(REPO, 'packages/knowledge-hub/dataset')
const SRC = readFileSync(new URL('../pair-implement-batch.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const SHA256 = c => `sha256:${c.repeat(64)}`

const sh = (cwd, cmd, ...args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} (in ${cwd}): ${r.stderr || r.stdout}`)
  return r.stdout.replace(/\n$/, '')
}
const git = (cwd, ...a) => sh(cwd, 'git', ...a)
const node = (cwd, script, ...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
  let json = null
  try {
    json = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}
const write = (cwd, rel, content) => {
  mkdirSync(join(cwd, rel, '..'), { recursive: true })
  writeFileSync(join(cwd, rel), content)
}

// ── 1. Provision the shipped artifact with the REAL installer ─────────────────────────────────
let INSTALLED = null
function provision() {
  if (INSTALLED) return INSTALLED
  assert.ok(existsSync(CLI), `the CLI is not built at ${CLI} — run pnpm --filter @pair/pair-cli build`)
  const project = mkdtempSync(join(tmpdir(), 'pair install target '))
  // The CLI resolves a bare target from INIT_CWD when pnpm sets it (pre-push runs under pnpm):
  // pin the target through the environment too, or the install lands in the monorepo itself.
  const r = spawnSync(process.execPath, [CLI, 'install', '--source', DATASET, '--offline', project], { encoding: 'utf8', cwd: project, env: { ...process.env, INIT_CWD: project } })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  INSTALLED = project
  return project
}
const installed = rel => join(provision(), '.claude/skills', rel)

test('TC-14 / TC-07: `pair install` lands the six phase skills with every script they run, and none of the retired ones', () => {
  const project = provision()
  const skills = readdirSync(join(project, '.claude/skills')).filter(d => d.startsWith('pair-workflow-')).sort()
  assert.deepEqual(skills, ['pair-workflow-contract-phase', 'pair-workflow-green-fix', 'pair-workflow-implement-phase', 'pair-workflow-red-spec', 'pair-workflow-red-verify', 'pair-workflow-review-phase'])
  for (const f of ['pair-workflow-contract-phase/scripts/ensure-contract.mjs', 'pair-workflow-red-spec/scripts/cycle-state.mjs', 'pair-workflow-red-verify/scripts/cycle-state.mjs', 'pair-workflow-red-verify/scripts/red-snapshot.mjs', 'pair-workflow-implement-phase/scripts/cycle-state.mjs', 'pair-workflow-green-fix/scripts/cycle-state.mjs', 'pair-workflow-green-fix/scripts/pr-comment.mjs', 'pair-workflow-review-phase/scripts/cycle-state.mjs', 'pair-workflow-review-phase/scripts/red-snapshot.mjs', 'pair-workflow-review-phase/scripts/pr-comment.mjs'])
    assert.ok(existsSync(installed(f)), `${f} did not install`)
  // the installed copies are the dataset's bytes, and every skill names its own script directory
  assert.equal(readFileSync(installed('pair-workflow-red-verify/scripts/red-snapshot.mjs'), 'utf8'), readFileSync(join(DATASET, '.skills/workflow/red-verify/scripts/red-snapshot.mjs'), 'utf8'))
  for (const s of ['red-spec', 'red-verify', 'implement-phase', 'green-fix', 'review-phase']) assert.match(readFileSync(installed(`pair-workflow-${s}/SKILL.md`), 'utf8'), /\$SKILL_DIR\/scripts\/cycle-state\.mjs/)
  for (const gone of ['pair-workflow-remediation-plan', 'pair-workflow-red-seal', 'pair-workflow-p3-verify', 'pair-workflow-cycle-comments', 'pair-workflow-pr-phase']) assert.equal(existsSync(join(project, '.claude/skills', gone)), false, gone)
  assert.deepEqual(readdirSync(join(project, '.claude/agents')).sort(), ['pair-contract-generator.md', 'pair-fix-test-author.md', 'pair-implementer.md', 'pair-red-contract-verifier.md', 'pair-reviewer.md'])
  assert.equal(existsSync(join(project, '.claude/workflows/pair-implement-batch.test.mjs')), false, 'dry-run suites never install')
  assert.equal(existsSync(join(project, '.claude/workflows/pair-contracts/engine-boundaries.test.mjs')), false)
  // Every shipped script must ANSWER when invoked through a symlinked install path (macOS /var →
  // /private/var, a linked skills directory): a string comparison of import.meta.url with argv[1]
  // silently made the CLI a no-op that exited 0 — the boundary suite's first real catch.
  const linked = join(mkdtempSync(join(tmpdir(), 'linked-')), 'skills')
  symlinkSync(join(project, '.claude/skills'), linked)
  for (const [rel, args] of [
    ['pair-workflow-red-spec/scripts/cycle-state.mjs', ['frobnicate']],
    ['pair-workflow-red-verify/scripts/red-snapshot.mjs', ['frobnicate', '--pr', '1', '--phase', 'x', '--base', 'y']],
    ['pair-workflow-review-phase/scripts/pr-comment.mjs', ['frobnicate', '--pr', '1', '--marker', '<!-- pair:x #1 PR#1 -->']],
    ['pair-workflow-contract-phase/scripts/ensure-contract.mjs', ['frobnicate']],
  ]) {
    const r = spawnSync(process.execPath, [join(linked, rel), ...args], { encoding: 'utf8' })
    assert.notEqual(r.status, 0, `${rel} exited 0 with no answer through a symlinked path`)
    assert.ok(r.stdout.trim() || r.stderr.trim(), `${rel} printed nothing through a symlinked path`)
  }
})

// ── 2. A real main checkout + story worktree, driven through the coordinator's own predicate ───
function mainAndWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'main checkout ')) // spaces in the path, on purpose
  const main = join(root, 'repo')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 't@e.com')
  git(main, 'config', 'user.name', 'T')
  git(main, 'config', 'commit.gpgsign', 'false')
  write(main, 'src/a.js', 'export const a = () => 1\n')
  write(main, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 1) throw new Error("FAIL")\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '--no-verify', '-m', 'base')
  const base = git(main, 'rev-parse', 'HEAD')
  const worktree = join(root, 'pair-worktrees', '42')
  mkdirSync(join(root, 'pair-worktrees'))
  git(main, 'worktree', 'add', '-q', worktree, '-B', 'feature/US-42', 'main')
  const runDir = join(main, '.pair/working/runs/run-1/42')
  mkdirSync(runDir, { recursive: true })
  return { root, main, worktree, base, runDir }
}
// The coordinator's predicate, extracted from the real source so this test cannot drift from it.
const isContractPath = new Function(`${SRC.slice(SRC.indexOf('const isRelPath ='), SRC.indexOf('// A skill NAME'))}\n${SRC.slice(SRC.indexOf('const isContractPath ='), SRC.indexOf('const validScope ='))}\nreturn isContractPath`)()

test("TC-07: the author's ABSOLUTE contract path passes the coordinator's predicate and reaches the installed seal and verify-chain scripts from inside the worktree — spaces and all", () => {
  const { root, main, worktree, base, runDir } = mainAndWorktree()
  const cycle = installed('pair-workflow-red-spec/scripts/cycle-state.mjs')
  const snapshot = installed('pair-workflow-red-verify/scripts/red-snapshot.mjs')
  const verifier = installed('pair-workflow-review-phase/scripts/red-snapshot.mjs')
  // preparation, as the skill does it: RED test in the worktree, contract in the MAIN run dir
  write(worktree, 'test/a.test.js', 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\n')
  const hash = sh(worktree, 'shasum', '-a', '256', 'test/a.test.js').split(' ')[0]
  const contractPath = join(runDir, 'r1-g1-red-contract.json')
  const contract = { sourceOfTruth: 'a()', fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] }, inventory: [{ id: 'r0-1', producer: 'a()', classes: ['default'] }], matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/a.test.js', expected: '2', covers: ['r0-1'] }], redTests: [{ file: 'test/a.test.js', kind: 'test', baseline: 'red', sha256: `sha256:${hash}`, command: 'node test/a.test.js', observed: 'Error: FAIL' }], testExempt: false }
  writeFileSync(contractPath, JSON.stringify(contract))
  assert.ok(isContractPath(contractPath), `the coordinator refuses the absolute path ${contractPath}`)
  const h = node(main, cycle, 'hash', '--file', contractPath)
  assert.match(h.json.contractHash, /^sha256:/)
  // publish the preparation handoff in the main checkout, then seal from INSIDE the worktree
  writeFileSync(join(runDir, 'draft.json'), JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', phase: 'r1-g1', skill: 'red-spec', inputHead: base, status: 'red', mode: 'remediation', contractPath, contractHash: h.json.contractHash, plan: { groups: [{ groupId: 'r1-g1', findings: ['r0-1'], owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] }], carried: [] } }))
  assert.equal(node(main, cycle, 'publish', '--dir', runDir, '--file', join(runDir, 'draft.json'), '--phase', 'r1-g1', '--skill', 'red-spec', '--workflowVersion', '3.0.0').json.published, true)
  const seal = node(worktree, snapshot, 'seal', '--pr', '7', '--phase', 'r1-g1', '--base', base, '--contract', contractPath, '--root', main)
  assert.equal(seal.status, 0, seal.stdout + seal.stderr)
  assert.equal(seal.json.sealed, true)
  assert.equal(git(worktree, 'rev-parse', `${seal.json.snapshot}^`), base)
  // the same call again (lost response) returns the same snapshot, no second commit
  assert.deepEqual(node(worktree, snapshot, 'seal', '--pr', '7', '--phase', 'r1-g1', '--base', base, '--contract', contractPath, '--root', main).json.snapshot, seal.json.snapshot)
  assert.equal(git(worktree, 'rev-list', '--count', `${base}..HEAD`), '1')
  // validation handoff → resolve says GREEN next, with the snapshot
  writeFileSync(join(runDir, 'v.json'), JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', phase: 'r1-g1', skill: 'red-verify', inputHead: base, verified: true, findings: [], sealed: true, snapshot: seal.json.snapshot, contractHash: h.json.contractHash }))
  assert.equal(node(main, cycle, 'publish', '--dir', runDir, '--file', join(runDir, 'v.json'), '--phase', 'r1-g1', '--skill', 'red-verify', '--workflowVersion', '3.0.0', '--predecessor', 'r1-g1-red-spec').json.published, true)
  const r = node(main, cycle, 'resolve', '--dir', runDir, '--workflowVersion', '3.0.0', '--policy', '{"maxFixRounds":3,"redRepairs":1,"greenRetries":1,"reviewers":1}', '--entry', 'pr', '--pr', '7').json
  assert.equal(r.next.step, 'green')
  assert.equal(r.next.contract.snapshot, seal.json.snapshot)
  // GREEN in the worktree, then the final verifier's custody check from a DETACHED review worktree
  write(worktree, 'src/a.js', 'export const a = () => 2\n')
  git(worktree, 'rm', '-q', '--', seal.json.manifest)
  git(worktree, 'add', '-A')
  git(worktree, 'commit', '-q', '--no-verify', '-m', 'GREEN')
  const review = join(root, 'pair-worktrees', '42-review')
  git(main, 'worktree', 'add', '-q', '--detach', review, 'feature/US-42')
  const chain = node(review, verifier, 'verify-chain', '--pr', '7', '--base', base)
  assert.equal(chain.status, 0, chain.stdout)
  assert.equal(chain.json.verified, true)
  // the detached review worktree is removed at the end — the handoffs in the main checkout survive it
  git(main, 'worktree', 'remove', '--force', review)
  assert.ok(existsSync(join(runDir, 'r1-g1-red-verify.json')))
  assert.equal(node(main, cycle, 'resolve', '--dir', runDir, '--workflowVersion', '3.0.0', '--policy', '{}', '--entry', 'pr', '--pr', '7').json.next.step, 'green', 'handoffs still readable from the main checkout')
  rmSync(root, { recursive: true, force: true })
})

test('TC-07: the coordinator predicate and the installed sealer refuse the same hostile paths — relative-to-worktree, `..`, root-prefix sibling, symlink escape, absent and partial JSON', () => {
  const { root, main, worktree, base, runDir } = mainAndWorktree()
  const snapshot = installed('pair-workflow-red-verify/scripts/red-snapshot.mjs')
  write(worktree, 'test/a.test.js', 'changed\n')
  const outside = mkdtempSync(join(tmpdir(), 'outside-'))
  writeFileSync(join(outside, 'c.json'), '{}')
  const sibling = `${main}-evil`
  mkdirSync(join(sibling, '.pair/working/runs'), { recursive: true })
  writeFileSync(join(sibling, '.pair/working/runs/c.json'), '{}')
  symlinkSync(join(outside, 'c.json'), join(runDir, 'link.json'))
  writeFileSync(join(runDir, 'partial.json'), '{"fixScope":')
  for (const [p, coordinatorAccepts, reason] of [
    [`${main}/.pair/working/runs/../../../x.json`, false, 'path-escape'],
    ['../evil.json', false, 'path-escape'],
    [join(sibling, '.pair/working/runs/c.json'), true, 'path-outside-root'], // lexically plausible to a root-blind coordinator — only the root-bound script can refuse it
    [join(outside, 'c.json'), false, 'path-outside-root'],
    [join(runDir, 'link.json'), true, 'path-escape'], // lexically fine — only the REAL path reveals it
    [join(runDir, 'missing.json'), true, 'contract-missing'],
    [join(runDir, 'partial.json'), true, 'contract-not-json'],
  ]) {
    assert.equal(isContractPath(p), coordinatorAccepts, `coordinator on ${p}`)
    const r = node(worktree, snapshot, 'seal', '--pr', '7', '--phase', 'r1-g1', '--base', base, '--contract', p, '--root', main)
    assert.equal(r.status, 1, p)
    assert.equal(r.json.reason, reason, `${p}: ${r.stdout}`)
  }
  assert.equal(git(worktree, 'rev-parse', 'HEAD'), base, 'nothing sealed')
  for (const d of [root, outside, sibling]) rmSync(d, { recursive: true, force: true })
})

// ── 3. The interruption matrix at the persisted boundaries ─────────────────────────────────────
test('TC-10: interruption before/after a handoff publish, a partial handoff, two concurrent resumes and a held lock — resume from the durable state, never a duplicate or an inferred clean review', () => {
  const { root, main, base, runDir } = mainAndWorktree()
  const cycle = installed('pair-workflow-red-spec/scripts/cycle-state.mjs')
  const resolve = () => node(main, cycle, 'resolve', '--dir', runDir, '--workflowVersion', '3.0.0', '--policy', '{"maxFixRounds":3,"redRepairs":1,"greenRetries":1,"reviewers":1}', '--entry', 'pr', '--pr', '7').json
  const draft = (name, data) => {
    writeFileSync(join(runDir, name), JSON.stringify({ run: 'run-1', story: '42', pr: 7, branch: 'feature/US-42', inputHead: base, ...data }))
    return join(runDir, name)
  }
  // (a) killed BEFORE publishing: nothing in the dir → the entry step; the draft is not a handoff
  const reviewed = { custody: { verified: true, contractBreach: false }, readiness: { ready: true, remoteHead: base } }
  draft('draft.json', { phase: 'r0', skill: 'review-phase', reviewedHead: base, verdict: 'x', findings: [], ...reviewed })
  assert.equal(resolve().status, 'empty')
  // (b) published, then killed before returning: a resume sees the published step, not a repeat
  const first = node(main, cycle, 'publish', '--dir', runDir, '--file', join(runDir, 'draft.json'), '--phase', 'r0', '--skill', 'review-phase', '--workflowVersion', '3.0.0').json
  assert.equal(first.published, true)
  assert.equal(resolve().status, 'completed')
  // (c) two concurrent resumes: the second writer for the same step is refused, the first stays
  const again = node(main, cycle, 'publish', '--dir', runDir, '--file', draft('again.json', { phase: 'r0', skill: 'review-phase', reviewedHead: 'f'.repeat(40), verdict: 'y', findings: [], ...reviewed }), '--phase', 'r0', '--skill', 'review-phase', '--workflowVersion', '3.0.0').json
  assert.equal(again.published, false)
  assert.equal(again.reason, 'stale-write')
  assert.equal(JSON.parse(readFileSync(join(runDir, 'r0-review-phase.json'), 'utf8')).reviewedHead, base)
  // (d) a partial (interrupted) handoff write is `invalid`, never read as a clean review
  writeFileSync(join(runDir, 'r1-g1-red-spec.json'), '{"status": "red", "contractPath": "/x", "contractHash": "sha256:')
  assert.equal(resolve().status, 'invalid')
  rmSync(join(runDir, 'r1-g1-red-spec.json'))
  // (e) a lock left by a dead writer is respected, and reported, not broken
  mkdirSync(join(runDir, '.lock'))
  const locked = node(main, cycle, 'publish', '--dir', runDir, '--file', draft('l.json', { phase: 'r1-g1', skill: 'red-spec', status: 'red' }), '--phase', 'r1-g1', '--skill', 'red-spec', '--workflowVersion', '3.0.0').json
  assert.equal(locked.reason, 'locked')
  assert.ok(existsSync(join(runDir, '.lock')))
  rmSync(join(runDir, '.lock'), { recursive: true })
  // (f) an engine of another major finds the cycle incompatible instead of continuing it
  assert.equal(node(main, cycle, 'resolve', '--dir', runDir, '--workflowVersion', '4.0.0', '--policy', '{}', '--entry', 'pr', '--pr', '7').json.status, 'incompatible')
  // (g) a different invocation id for the same PR is routed to the existing run directory
  const other = join(main, '.pair/working/runs/run-2/42')
  mkdirSync(other, { recursive: true })
  const found = node(main, cycle, 'resolve', '--dir', other, '--workflowVersion', '3.0.0', '--policy', '{}', '--entry', 'pr', '--pr', '7', '--runsRoot', join(main, '.pair/working/runs'), '--story', '42').json
  assert.deepEqual({ status: found.status, runId: found.runId }, { status: 'other-run', runId: 'run-1' })
  rmSync(root, { recursive: true, force: true })
})

test('TC-08 / TC-14: the installed scripts run outside the monorepo cwd — no repository configuration is touched and no unowned file is deleted by any refusal', () => {
  const { root, main, worktree, base, runDir } = mainAndWorktree()
  const snapshot = installed('pair-workflow-red-verify/scripts/red-snapshot.mjs')
  const cfg = (cwd, key) => spawnSync('git', ['config', '--get', key], { cwd, encoding: 'utf8' }).stdout.trim() || '(unset)'
  const before = { bare: cfg(main, 'core.bare'), hooks: cfg(worktree, 'core.hooksPath') }
  write(worktree, 'test/a.test.js', 'changed\n')
  write(worktree, 'src/a.js', 'dirty production\n')
  write(worktree, 'notes.txt', 'unknown work\n')
  const contractPath = join(runDir, 'c.json')
  writeFileSync(contractPath, JSON.stringify({ sourceOfTruth: 's', fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] }, redTests: [{ file: 'test/a.test.js', sha256: `sha256:${sh(worktree, 'shasum', '-a', '256', 'test/a.test.js').split(' ')[0]}`, command: 'x', observed: 'FAIL' }], testExempt: false }))
  const r = node(worktree, snapshot, 'seal', '--pr', '7', '--phase', 'r1-g1', '--base', base, '--contract', contractPath, '--root', main).json
  assert.equal(r.reason, 'dirty-outside-contract')
  assert.deepEqual(r.paths.sort(), ['notes.txt', 'src/a.js'])
  assert.ok(existsSync(join(worktree, 'notes.txt')) && readFileSync(join(worktree, 'src/a.js'), 'utf8') === 'dirty production\n', 'the refusal deleted or reset nothing')
  assert.deepEqual({ bare: cfg(main, 'core.bare'), hooks: cfg(worktree, 'core.hooksPath') }, before, 'repository configuration untouched')
  assert.equal(git(worktree, 'rev-parse', 'HEAD'), base)
  rmSync(root, { recursive: true, force: true })
})
