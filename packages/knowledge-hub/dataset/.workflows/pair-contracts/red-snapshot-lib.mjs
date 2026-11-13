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

import { contractHash, baseSync } from '../../skills/pair-workflow-red-verify/scripts/cycle-state.mjs'
import { BASE_SYNC_FIX, llmsDerivedTitle, pushSnapshot, artifactPaths as artifactPathsOf, contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath, OVERRIDABLE_BREACH_CODES } from '../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs'

export const CLI_URL = new URL('../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs', import.meta.url).href
export const CLI = fileURLToPath(new URL('../../skills/pair-workflow-red-verify/scripts/red-snapshot.mjs', import.meta.url))
export function sh(cwd, ...args) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${args.join(' ')}: ${r.stderr}`)
  return r.stdout.replace(/\n$/, '')
}

export const git = (cwd, ...args) => sh(cwd, 'git', ...args)

export function write(cwd, rel, content) {
  mkdirSync(join(cwd, rel, '..'), { recursive: true })
  writeFileSync(join(cwd, rel), content)
}

export function repo() {
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

export function redContract(cwd, extra = {}) {
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

export const PR = '7'

export const PHASE = 'r1-g1'

export function sealed() {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: PHASE, base, contractPath, cwd })
  assert.equal(s.sealed, true)
  rmSync(join(cwd, contractPath))
  return { cwd, base, snapshot: s.snapshot, manifest: manifestPathFor(PR, PHASE) }
}

export function green(cwd, manifest, files) {
  for (const [rel, content] of Object.entries(files)) write(cwd, rel, content)
  if (existsSync(join(cwd, manifest))) git(cwd, 'rm', '-q', '--', manifest)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'GREEN')
}

export function chainRepo() {
  const { cwd, base } = repo()
  const { contractPath } = redContract(cwd)
  const s1 = seal({ pr: PR, phase: 'r1-g1', base, contractPath, cwd })
  assert.equal(s1.sealed, true)
  rmSync(join(cwd, contractPath))
  green(cwd, s1.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  return { cwd, base, s1, head1 }
}

export const chainBase = cwd => git(cwd, 'rev-list', '--max-parents=0', 'HEAD')

export function revision(cwd, head1, extra = {}) {
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

export function mainCheckout() {
  const main = mkdtempSync(join(tmpdir(), 'main checkout ')) // a space, on purpose
  mkdirSync(join(main, '.pair', 'working', 'runs', 'run-1', '42'), { recursive: true })
  return main
}

export const SEAL_TRAILER_RE = /^Pair-RED-Snapshot: pr=(\d+); phase=([^;]+); base=([0-9a-f]{40}); manifest=(\S+)$/m

export const REPO = git(fileURLToPath(new URL('.', import.meta.url)), 'rev-parse', '--show-toplevel')

export const hasBlob = (cwd, rev, path) => spawnSync('git', ['cat-file', '-e', `${rev}:${path}`], { cwd }).status === 0

export const trackedUnder = (cwd, dir) => git(cwd, 'ls-tree', '-r', '--name-only', 'HEAD', '--', dir).split('\n').filter(Boolean)

export const trailerBlockOf = (cwd, body) => {
  const r = spawnSync('git', ['interpret-trailers', '--parse'], { cwd, input: body, encoding: 'utf8' })
  return r.status === 0 ? r.stdout : ''
}

export function sealedManifests(cwd) {
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

export const freshRunDir = handoffs => {
  const dir = join(mkdtempSync(join(tmpdir(), 'fresh-run-')), '.pair', 'working', 'runs', 'story-7', '7')
  mkdirSync(dir, { recursive: true })
  for (const [name, data] of Object.entries(handoffs)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(data))
  return dir
}

export const sealCli = (cwd, args, env = {}) => {
  const r = spawnSync(process.execPath, [CLI, 'seal', ...args, '--cwd', cwd], { encoding: 'utf8', env: { ...process.env, ...env } })
  return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop() || '{}'), stderr: r.stderr }
}

export function realGhOnPath() {
  const dir = mkdtempSync(join(tmpdir(), 'real-gh-'))
  const log = join(dir, 'reached.log')
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`)
  spawnSync('chmod', ['+x', join(dir, 'gh')])
  return { PATH: `${dir}:${process.env.PATH}`, log }
}

export function witnessRepo(testBody) {
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

export const LINT_UNUSED = JSON.stringify([{ name: 'lint', command: [process.execPath, '-e', 'const s=require("fs").readFileSync(process.argv[1],"utf8"); if (/const unusedLocal/.test(s)) { console.error(process.argv[1] + ": unusedLocal is assigned a value but never used"); process.exit(1) }', '{file}'] }])

export function pkgWitnessRepo({ lintJs, scripts = lintJs ? { lint: 'node lint.js' } : {}, testBody, pkgJsonRaw, root = false } = {}) {
  const { cwd } = repo()
  const dir = root ? '' : 'packages/p/'
  const tf = `${dir}${root ? 'test/w.test.js' : 'src/a.test.js'}`
  write(cwd, `${dir}package.json`, pkgJsonRaw ?? JSON.stringify({ name: 'p', scripts }))
  if (lintJs) write(cwd, `${dir}lint.js`, lintJs)
  write(cwd, `${dir}src/a.js`, 'export const a = () => 1\n')
  write(cwd, `${dir}src/other.js`, 'export const o = 0\n')
  write(cwd, tf, 'import("./a.js").then(m => { if (m.a() !== 3) throw new Error("FAIL") })\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'pkg')
  const base = git(cwd, 'rev-parse', 'HEAD')
  write(cwd, tf, testBody ?? 'import("./a.js").then(m => { if (m.a() !== 2) throw new Error("FAIL") })\n')
  const contract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'test', allowedPaths: [] },
    matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: `node ${tf}`, expected: '2', covers: ['r0-1'] }],
    redTests: [{ file: tf, kind: 'test', sha256: hashFile(tf, cwd), command: `node ${tf}`, observed: 'Error: FAIL' }],
    testExempt: false,
  }
  write(cwd, '.pair/working/w-draft.json', JSON.stringify(contract))
  return { cwd, base, tf, contractPath: '.pair/working/w-draft.json' }
}

export const sealEmpty = r => sealCli(r.cwd, ['--pr', PR, '--phase', PHASE, '--base', r.base, '--contract', r.contractPath, '--static-gates', '[]'])

export const LINT_REPORTS = (file, tail = '✖ 1 problem (1 error, 0 warnings)') => `console.error(require('path').resolve(${JSON.stringify(file)}) + '\\n  38:1  error  complexity 13 > 10\\n\\n${tail}'); process.exit(1)`

export const AFAIL = 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\nif (a(0) !== 0) throw new Error("FAIL empty")\n'

export const GREENT = 'import { a } from "../src/a.js"\nif (a() !== 2) throw new Error("FAIL")\n'

export const witnessRow = (id, file, covers) => ({ id, kind: 'witness', baseline: 'red', condition: id, oracle: `node ${file}`, expected: '2', covers: [covers] })

export const revContract = (cwd, files, matrix, extra = {}) => {
  const contract = {
    sourceOfTruth: 'a()',
    fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
    revision: 2,
    supersedes: 'r1-g1',
    matrix,
    redTests: files.map(f => ({ file: f, kind: 'test', sha256: hashFile(f, cwd), command: `node ${f}`, observed: 'Error: FAIL' })),
    testExempt: false,
    ...extra,
  }
  write(cwd, '.pair/working/rev-draft.json', JSON.stringify(contract))
}

export const commitAll = (cwd, msg) => {
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', msg)
  return git(cwd, 'rev-parse', 'HEAD')
}

export function mergedFromMain() {
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

export const runDirWith = handoffs => {
  const dir = join(mkdtempSync(join(tmpdir(), 'merge-run-')), '.pair', 'working', 'runs', 'story-7', '7')
  mkdirSync(dir, { recursive: true })
  for (const [name, data] of Object.entries(handoffs)) writeFileSync(join(dir, `${name}.json`), JSON.stringify(data))
  return dir
}

export function sealedStoryWith(prOwned) {
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

export const docContract = (extra = {}) => ({
  sourceOfTruth: 'docs/guide.md',
  fixScope: { owner: 'guide', mode: 'doc', allowedPaths: ['docs/guide.md', 'docs/'] },
  checklist: [
    { id: 'c1', finding: 'r0-1', requirement: 'The guide states that the cache is invalidated on write.', authority: 'src/cache.ts invalidates on write (line 12)' },
  ],
  ...extra,
})

export const MULTI = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].map(l => `${l}\n`)

export const withLine = (n, text) => MULTI.map((l, i) => (i === n ? `${text}\n` : l)).join('')

export function movedBaseStory({ sealTest = false } = {}) {
  const { cwd } = repo()
  write(cwd, 'docs/shared.md', MULTI.join(''))
  write(cwd, 'test/multi.test.js', MULTI.join(''))
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'shared files')
  git(cwd, 'checkout', '-q', '-b', 'story')
  write(cwd, 'docs/shared.md', withLine(0, 'story edit'))
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  let sealRes
  if (sealTest) {
    write(cwd, 'test/multi.test.js', withLine(0, 'sealed witness'))
    write(cwd, '.pair/working/red-draft.json', JSON.stringify({
      sourceOfTruth: 'a()',
      fixScope: { owner: 'a()', mode: 'behavioral', allowedPaths: ['src/a.js'] },
      matrix: [{ id: 'row-1', kind: 'witness', baseline: 'red', condition: 'default', oracle: 'node test/multi.test.js', expected: '2', covers: ['r0-1'] }],
      redTests: [{ file: 'test/multi.test.js', kind: 'test', sha256: hashFile('test/multi.test.js', cwd), command: 'node test/multi.test.js', observed: 'Error: FAIL' }],
      testExempt: false,
    }))
    sealRes = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath: '.pair/working/red-draft.json', cwd })
    assert.equal(sealRes.sealed, true, JSON.stringify(sealRes))
    rmSync(join(cwd, '.pair/working/red-draft.json'))
    green(cwd, sealRes.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  } else {
    const { contractPath } = redContract(cwd)
    sealRes = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
    assert.equal(sealRes.sealed, true, JSON.stringify(sealRes))
    rmSync(join(cwd, contractPath))
    green(cwd, sealRes.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  }
  // main advances: the OTHER end of the same files (a different hunk)
  git(cwd, 'checkout', '-q', 'main')
  write(cwd, 'docs/shared.md', withLine(7, 'main edit'))
  write(cwd, 'test/multi.test.js', withLine(7, 'main edit'))
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'main moves on')
  git(cwd, 'checkout', '-q', 'story')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'main')
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  return { cwd, head1, runDir }
}

export const DS = 'packages/knowledge-hub/dataset/'

export const FOO_DS = `${DS}.skills/capability/foo/SKILL.md`

export const FOO_MIRROR = '.claude/skills/pair-capability-foo/SKILL.md'

export const BAR_DS = `${DS}.skills/capability/bar/SKILL.md`

export const BAR_MIRROR = '.claude/skills/pair-capability-bar/SKILL.md'

export const LLMS = '.pair/llms.txt'

export const llmsWith = (...entries) => ['# pair', '', '> KB.', '', '## Skills', '', ...entries.map(([t, p]) => `- [${t}](${p})`), ''].join('\n')

export function generatedStory() {
  const { cwd } = repo()
  write(cwd, FOO_DS, 'foo v1\n')
  write(cwd, FOO_MIRROR, 'foo v1\n')
  write(cwd, '.pair/knowledge/foo.md', '# foo\n')
  write(cwd, LLMS, llmsWith(['Foo', '.pair/knowledge/foo.md']))
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'generated base')
  git(cwd, 'checkout', '-q', '-b', 'story')
  write(cwd, 'src/a.js', 'export const a = () => 1 // implemented\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  // main moves: the dataset changes (a new skill, a changed one, a new KB doc) — its OWN mirrors not regenerated yet
  git(cwd, 'checkout', '-q', 'main')
  write(cwd, FOO_DS, 'foo v2\n')
  write(cwd, BAR_DS, 'bar v1\n')
  write(cwd, '.pair/knowledge/bar.md', '# bar\n')
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'main moves on')
  git(cwd, 'checkout', '-q', 'story')
  git(cwd, 'merge', '-q', '--no-ff', '--no-edit', 'main')
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  return { cwd, head1, runDir }
}

export const regenerate = (cwd, files) => {
  for (const [rel, content] of Object.entries(files)) write(cwd, rel, content)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '--no-verify', '-m', 'chore: regenerate mirrors')
}

export const REGENERATED = { [FOO_MIRROR]: 'foo v2\n', [BAR_MIRROR]: 'bar v1\n', [LLMS]: llmsWith(['Foo', '.pair/knowledge/foo.md'], ['bar', '.pair/knowledge/bar.md']) }

export function conflictingBase() {
  const { cwd } = repo()
  git(cwd, 'checkout', '-q', '-b', 'story')
  write(cwd, 'src/a.js', 'export const a = () => 1 // implemented\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'implement')
  const head1 = git(cwd, 'rev-parse', 'HEAD')
  const { contractPath } = redContract(cwd)
  const s = seal({ pr: PR, phase: 'r1-g1', base: head1, contractPath, cwd })
  assert.equal(s.sealed, true, JSON.stringify(s))
  rmSync(join(cwd, contractPath))
  green(cwd, s.manifest, { 'src/a.js': 'export const a = () => 2\n' })
  git(cwd, 'checkout', '-q', 'main')
  write(cwd, 'src/a.js', 'export const a = () => 1 // reformatted on main\n')
  write(cwd, 'src/other.js', 'export const o = 7\n')
  git(cwd, 'commit', '-q', '--no-verify', '-am', 'main moves on')
  git(cwd, 'checkout', '-q', 'story')
  const runDir = runDirWith({ 'r1-g1-red-verify': { skill: 'red-verify', phase: 'r1-g1', verified: true, sealed: true, inputHead: head1 } })
  return { cwd, head1, runDir }
}
export { assert, test, mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, tmpdir, join, spawnSync, fileURLToPath, contractHash, baseSync, BASE_SYNC_FIX, llmsDerivedTitle, pushSnapshot, artifactPathsOf, contractErrors, hashFile, isTestPath, manifestPathFor, seal, trailerFor, verify, verifyChain, predecessorPhase, scopeNarrowing, isModulePath, OVERRIDABLE_BREACH_CODES }
