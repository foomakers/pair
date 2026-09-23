#!/usr/bin/env node
// Deterministic Git custody for a RED contract. Ships inside the `red-verify` skill (seal, after
// the independent validation) and, byte-identical, inside the `review-phase` skill (verify /
// verify-chain, the final verifier's first step) — a test keeps the copies equal. Every command runs
// INSIDE the story or review worktree by the phase skill that owns it, never by the workflow sandbox
// (which has no filesystem) and never re-implemented by an LLM agent:
//
//   node <skill dir>/scripts/red-snapshot.mjs seal   --pr <n> --phase <p> --base <sha> --contract <contract.json> --static-gates '<json>' [--root <main checkout>]
//     Verifies HEAD is exactly <base>, every listed artifact hashes to its stated sha256, and the
//     working tree is dirty ONLY at those artifacts; runs the PRE-SEAL GUARD (US-506 AC-9: the repo's
//     static gates over every listed test, a hermetic probe of every witness command — no real `gh`,
//     no network — the `predecessorContractHash` against the sealed predecessors, a revision's
//     `changedRows` against its own diff); writes the manifest, creates ONE local `--no-verify` commit
//     carrying the `Pair-RED-Snapshot` trailer, prints {sealed, snapshot, preSeal}.
//     Idempotent: an existing snapshot with the same trailer, parent and blobs is returned as-is.
//
//   node <skill dir>/scripts/red-snapshot.mjs verify --pr <n> --phase <p> --base <sha>
//     Finds the ONE snapshot in <base>..HEAD by trailer, proves parent == base, tree == manifest +
//     listed artifacts, every listed blob byte-identical at HEAD, no unlisted test artifact changed
//     after the seal, and every production change inside the manifest's fixScope.allowedPaths
//     (a `behavioral` scope adds/moves no production module; a `test` scope changes no production
//     path at all). Prints {verified, contractBreach,
//     breaches[]}. Any breach is terminal for the attempt; the script repairs nothing.
//
//   node <skill dir>/scripts/red-snapshot.mjs verify-chain --pr <n> --base <sha> [--run-dir <dir>] [--base-ref <story base ref>]
//     The whole attempt since <base>: every snapshot of this PR in order, each well-formed on its
//     declared base; every sealed blob at HEAD identical to the LATEST snapshot that lists it (a
//     successor snapshot — a contract REVISION — is the only commit allowed to change a sealed
//     test); every production change inside the scope in force at that point. This is what the
//     final verifier runs: a revision keeps the earlier seal as history, never as a breach.
//
// Artifacts carry a `baseline`: `red` (a witness — its recorded observation is a FAILURE, and the
// seal requires it to have changed at the base) or `pass` (a positive / already-correct control —
// its observation is a pass, it may be unchanged, and it is protected by blob identity like every
// other sealed artifact). A contract with no red witness proves nothing and is invalid.
//
// A rebase is never repaired (US-479 c1): a snapshot that is no longer an ancestor is simply
// `snapshot-missing`, and the attempt fails closed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
// The ONE canonical contract identity (US-506 AC-9: `predecessorContractHash` is checked against it).
// `cycle-state.mjs` ships beside this script in every skill that ships this one.
import { canonical, contractHash } from './cycle-state.mjs'

export const TRAILER_KEY = 'Pair-RED-Snapshot'
export const SHA_RE = /^[0-9a-f]{40}$/
export const SHA256_RE = /^sha256:[0-9a-f]{64}$/
// Repository-relative paths only: no absolute, no `..`, no leading `-` (a flag to git). A single
// trailing `/` is legal — it spells a directory prefix in `fixScope.allowedPaths`.
export const isRelPath = p =>
  typeof p === 'string' &&
  p.length > 0 &&
  !p.startsWith('/') &&
  !p.startsWith('-') &&
  !p.replace(/\/$/, '').split('/').some(seg => seg === '' || seg === '.' || seg === '..')
// A test artifact, by path shape. Used ONLY to catch test files changed after the seal that the
// manifest does not list — a listed artifact is checked by blob identity regardless of its name.
// A production MODULE — what a `behavioral` scope may edit but never create, move or split. ONLY
// documentation and decision evidence is exempt (an explicit allow-list, T-9 re-review t9b-2):
// `.md` / `.mdx` / `.txt` / `.rst` / `.adoc` anywhere, the conventional repository documents that
// carry NO extension at all (`README`, `LICENSE`, `CHANGELOG`, `CONTRIBUTING`, `NOTICE`, `AUTHORS`
// — t9c-3: written as extensions, the list classified exactly the documents every repository keeps
// at its root as production, and a behavioral GREEN adding one was refused), or anything under
// `.pair/adoption/`, `.pair/knowledge/`, `docs/`. Everything else added or moved under a behavioral
// scope — a CI workflow, Terraform, a migration, a Dockerfile, a JSON config, a script under
// `.pair/` — is a module and a breach. The basename match is WHOLE: `readme.js` is production.
export const DOC_BASENAMES = /^(README|LICEN[CS]E|CHANGELOG|CONTRIBUTING|NOTICE|AUTHORS|COPYING)$/i
export const isModulePath = p => {
  const s = String(p ?? '')
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(s)) return false
  if (DOC_BASENAMES.test(s.split('/').pop() ?? '')) return false
  if (/^(\.pair\/(adoption|knowledge)\/|docs\/)/.test(s)) return false
  return true
}
export const isTestPath = p =>
  /(^|\/)(test|tests|__tests__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)

// t9d-18: `pr` is a number — never interpolated raw into a path (`--pr '../../ESCAPED'` sealed outside).
export const manifestPathFor = (pr, phase) => {
  if (!/^\d+$/.test(String(pr))) throw new Error(`pr must be a number, got ${JSON.stringify(pr)}`)
  return `.pair/red-snapshots/pr-${pr}-${String(phase).replace(/[^a-zA-Z0-9._-]/g, '-')}.json`
}
export const trailerFor = ({ pr, phase, base, manifest }) =>
  `${TRAILER_KEY}: pr=${pr}; phase=${phase}; base=${base}; manifest=${manifest}`

export function hashFile(path, cwd) {
  return `sha256:${createHash('sha256').update(readFileSync(join(cwd, path))).digest('hex')}`
}

// A git process must act on the repository named by `cwd`, never on one named by an INHERITED
// environment: a pre-push hook exports GIT_DIR (and friends) to everything it runs, and a script
// that spawned `git init` / `git commit` in a temp directory under that environment re-initialised
// and committed into the REAL repository (core.bare flipped to true, fixture commits on the branch —
// the 2026-09-09 canary incident). Scrub the whole family before every spawn.
const GIT_ENV_RE = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/
export const cleanGitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_ENV_RE.test(k)))

export function git(args, cwd, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv() })
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null
}

// A GitHub squash-merge commit's body concatenates every original subcommit's subject+body — a
// seal commit's own subject and trailer can reappear verbatim in the MIDDLE of that text (US-486
// r0-5: main's own squash-merge of a PR carrying red-snapshot commits did exactly this). A real
// git trailer only lives in the trailer BLOCK at the very end of a message; restricting the match
// to `git interpret-trailers`'s own output is what tells "this commit's own trailer" apart from
// "a trailer-shaped line quoted from an earlier, now-squashed commit's history".
function trailerBlockOf(body, cwd) {
  const r = spawnSync('git', ['interpret-trailers', '--parse'], { cwd, input: body, encoding: 'utf8', env: cleanGitEnv() })
  return r.status === 0 ? r.stdout : ''
}

// ── Contract shape (the RED author's return value, persisted as the manifest) ──────────────
export function contractErrors(c) {
  const errs = []
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['contract must be an object']
  const scope = c.fixScope
  if (!scope || typeof scope !== 'object') errs.push('fixScope missing')
  else {
    if (!String(scope.owner ?? '').trim()) errs.push('fixScope.owner missing')
    if (!['behavioral', 'structural', 'test'].includes(scope.mode)) errs.push('fixScope.mode must be behavioral | structural | test')
    // A `test` scope repairs a guard: it declares NO production paths, and verify treats any
    // production change after the seal as a breach.
    if (scope.mode === 'test') {
      if (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length !== 0) errs.push('fixScope.allowedPaths must be an empty array for mode test')
    } else if (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length === 0) errs.push('fixScope.allowedPaths must be a non-empty array')
    else for (const p of scope.allowedPaths) if (!isRelPath(p)) errs.push(`fixScope.allowedPaths has an invalid path: ${JSON.stringify(p)}`)
  }
  if (c.testExempt === true) {
    if (!String(c.exemptionRationale ?? '').trim()) errs.push('testExempt requires exemptionRationale')
    return errs
  }
  if (!Array.isArray(c.redTests) || c.redTests.length === 0) errs.push('redTests must be a non-empty array')
  else {
    const seen = new Set()
    let witnesses = 0
    for (const [i, a] of c.redTests.entries()) {
      const kind = a?.kind ?? 'test'
      const baseline = artifactBaseline(a)
      if (!isRelPath(a?.file)) errs.push(`redTests[${i}].file must be a repository-relative path`)
      else if (seen.has(a.file)) errs.push(`redTests[${i}].file is listed twice: ${a.file}`)
      else seen.add(a.file)
      if (!SHA256_RE.test(String(a?.sha256 ?? ''))) errs.push(`redTests[${i}].sha256 must be sha256:<64 hex>`)
      if (!['red', 'pass'].includes(baseline)) errs.push(`redTests[${i}].baseline must be red | pass`)
      if (kind === 'test') {
        if (!String(a?.command ?? '').trim()) errs.push(`redTests[${i}] (test) needs its ${baseline === 'pass' ? 'passing' : 'failing'} command`)
        const observed = String(a?.observed ?? '')
        if (baseline === 'pass') {
          if (/fail/i.test(observed) || !/pass|ok|green|\d+\/\d+/i.test(observed)) errs.push(`redTests[${i}] (control) needs an observed PASSING run, not ${JSON.stringify(observed)}`)
        } else if (!/fail/i.test(observed)) errs.push(`redTests[${i}] (test) needs an observed RED failure`)
        else witnesses++
      } else if (kind === 'fixture') {
        if (!String(a?.consumedBy ?? '').trim()) errs.push(`redTests[${i}] (fixture) needs consumedBy`)
      } else errs.push(`redTests[${i}].kind must be test | fixture`)
    }
    for (const [i, a] of c.redTests.entries())
      if ((a?.kind ?? 'test') === 'fixture' && a.consumedBy) {
        const consumer = c.redTests.find(t => t.file === a.consumedBy && (t.kind ?? 'test') === 'test')
        if (!consumer) errs.push(`redTests[${i}] (fixture) consumedBy does not name a listed RED test: ${a.consumedBy}`)
      }
    // Controls prove what already works; only a witness that fails for the defect proves the fix.
    if (witnesses === 0 && scope?.mode !== 'test' && !errs.some(e => /RED failure/.test(e))) errs.push('redTests needs at least one red witness (baseline red, observed failing) — a contract made only of controls proves nothing')
  }
  if (c.matrix !== undefined) {
    if (!Array.isArray(c.matrix)) errs.push('matrix must be an array')
    else {
      const ids = new Set()
      for (const [i, row] of c.matrix.entries()) {
        if (!String(row?.id ?? '').trim()) errs.push(`matrix[${i}].id is required (stable row id)`)
        else if (ids.has(row.id)) errs.push(`matrix[${i}].id is listed twice: ${row.id}`)
        else ids.add(row.id)
        if (!['witness', 'control', 'boundary', 'interaction', 'not-applicable'].includes(row?.kind)) errs.push(`matrix[${i}].kind must be witness | control | boundary | interaction | not-applicable`)
        if (!['red', 'pass'].includes(row?.baseline)) errs.push(`matrix[${i}].baseline must be red | pass`)
        if (!Array.isArray(row?.covers) || row.covers.length === 0) errs.push(`matrix[${i}].covers must name at least one obligation`)
        if (row?.kind === 'not-applicable' && !String(row?.rationale ?? '').trim()) errs.push(`matrix[${i}].rationale is required for a not-applicable row`)
      }
    }
  }
  // `reattest` (2026-09-18): a revision whose witness artifact's content is ALREADY at HEAD — it
  // arrived through a commit outside this contract's own history (a merge this story's own gate
  // forced, never an agent's own edit) — has nothing left to make `dirty` for seal() to commit: the
  // content it would write is byte-identical to what is already there. Never inferred: the contract
  // must say so, with a reason, or seal() refuses exactly as it always has (`artifact-not-changed`).
  // The hash check above `dirty` still runs unconditionally — reattest waives ONLY the dirty
  // requirement, never the proof that the declared sha256 matches the artifact's real content.
  if (c.reattest !== undefined) {
    const r = c.reattest
    if (!r || typeof r !== 'object' || Array.isArray(r)) errs.push('reattest must be an object when present')
    else if (!String(r.reason ?? '').trim()) errs.push('reattest.reason missing')
  }
  return errs
}

export const artifactBaseline = a => String(a?.baseline ?? 'red')
export const artifactPaths = c => (c.testExempt === true ? [] : c.redTests.map(a => a.file))
// Artifacts the seal requires to have CHANGED at the base: red witnesses. A `pass` control is an
// already-correct test and may be sealed unchanged.
export const witnessPaths = c => (c.testExempt === true ? [] : c.redTests.filter(a => artifactBaseline(a) === 'red').map(a => a.file))

// ── scope inheritance ──────────────────────────────────────────────────────────────────────
// A repair or a revision (`<stem>-rev<m>`) re-contracts the SAME obligation: it inherits the
// predecessor's fixScope — the mode and every allowedPaths entry — and may only ADD paths. Canary
// run 11: a0-rev2 narrowed a0's scope to the one production file, so the implementer could neither
// record its decision in the decision log nor document the convention, and reported both as gaps.
export const predecessorPhase = phase => {
  const m = /^(.+)-rev(\d+)$/.exec(String(phase ?? ''))
  if (!m) return null
  const n = Number(m[2])
  return n > 2 ? `${m[1]}-rev${n - 1}` : m[1]
}
export function scopeNarrowing(prev, next) {
  const errs = []
  const a = prev?.fixScope, b = next?.fixScope
  if (!a || !b) return errs
  if (a.mode !== b.mode) errs.push(`fixScope.mode changed from ${a.mode} to ${b.mode}`)
  for (const p of a.allowedPaths ?? []) if (!inScope(p.replace(/\/$/, ''), b.allowedPaths ?? []) && !(b.allowedPaths ?? []).includes(p)) errs.push(`fixScope.allowedPaths drops ${p}`)
  return errs
}
// The snapshot of <phase> anywhere in HEAD's history (a predecessor predates the revision's base).
export function findSnapshotByPhase({ pr, phase, cwd }) {
  const re = new RegExp(`^${TRAILER_KEY}: pr=${String(pr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}; phase=${String(phase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}; base=([0-9a-f]{40}); manifest=(\\S+)$`)
  const out = git(['log', '--format=%H%x00%B%x1e'], cwd) ?? ''
  for (const rec of out.split('\x1e').map(r => r.replace(/^\n/, '')).filter(Boolean)) {
    const [sha, body] = rec.split('\x00')
    for (const line of trailerBlockOf(body ?? '', cwd).split('\n')) {
      const m = re.exec(line.trim())
      if (m) {
        const raw = git(['show', `${sha}:${m[2]}`], cwd, { allowFail: true })
        let contract = null
        try {
          contract = raw === null ? null : JSON.parse(raw)
        } catch {}
        return { sha, base: m[1], manifest: m[2], contract }
      }
    }
  }
  return null
}

// ── seal ───────────────────────────────────────────────────────────────────────────────────
export function findSnapshot({ pr, phase, base, cwd }) {
  const manifest = manifestPathFor(pr, phase)
  const trailer = trailerFor({ pr, phase, base, manifest })
  const head = git(['rev-parse', 'HEAD'], cwd)
  const range = head === base ? [] : [`${base}..HEAD`]
  const out = git(['log', '--format=%H%x00%B%x1e', ...range], cwd) ?? ''
  const matches = out
    .split('\x1e')
    .map(rec => rec.replace(/^\n/, ''))
    .filter(Boolean)
    .map(rec => {
      const [sha, body] = rec.split('\x00')
      return { sha, body: body ?? '' }
    })
    .filter(({ body }) => trailerBlockOf(body, cwd).split('\n').some(line => line.trim() === trailer))
    .map(({ sha }) => sha)
  return { manifest, trailer, matches }
}

// The contract lives in the main checkout's run directory while cwd is the story worktree. With a
// declared `root` (the main checkout) the path is validated ONCE, before any read: no `..`
// anywhere; an absolute path must lie lexically under `<root>/.pair/working/runs/` (a sibling
// sharing the prefix string is outside); a relative path resolves against the ROOT, never cwd; the
// REAL path must stay under the run root, so a symlink pointing elsewhere is an escape. Without a
// root (legacy callers) an absolute path is read as-is and a relative one resolves against cwd.
export function resolveContractPath(contractPath, { cwd, root }) {
  const p = String(contractPath ?? '').trim()
  if (!p) return { error: 'contract-missing' }
  if (p.split(/[\\/]/).includes('..')) return { error: 'path-escape', path: p }
  if (!root) {
    const candidate = resolve(cwd, p)
    return existsSync(candidate) ? { path: candidate } : { error: 'contract-missing', path: candidate }
  }
  const runsLexical = join(resolve(root), '.pair', 'working', 'runs')
  const candidate = isAbsolute(p) ? resolve(p) : resolve(root, p)
  if (candidate !== runsLexical && !candidate.startsWith(runsLexical + sep)) return { error: 'path-outside-root', path: candidate, root: runsLexical }
  if (!existsSync(candidate)) return { error: 'contract-missing', path: candidate }
  const runsReal = join(realpathSync(root), '.pair', 'working', 'runs')
  const real = realpathSync(candidate)
  if (!real.startsWith(runsReal + sep)) return { error: 'path-escape', path: candidate, real }
  return { path: real }
}

// ── the pre-seal guard (US-506 T-6, AC-9) ─────────────────────────────────────────────────────
// Carried from US-487 T-8: its `a0` contract sealed a test with an unused local (the quality gate was
// red for ANY implementation) and a witness that passes for anything — both byte-identical to the
// seal, so nobody could fix them afterwards. Four refusals, each naming the file:
//   static-gate-failed          a listed test fails one of the repo's static gates (lint, tsc, …)
//   test-spawns-gh / test-reaches-network   a witness command reaches the real tracker or the network
//   predecessor-hash-unmatched  `predecessorContractHash` is no sealed predecessor's contract hash
//   changed-rows-omit-witness / changed-rows-omit-row   a revision edits a witness or a row it does not name
const SNAP_TRAILER_RE = new RegExp(`^${TRAILER_KEY}: pr=(\\d+); phase=([^;]+); base=([0-9a-f]{40}); manifest=(\\S+)$`)
// Every sealed contract in HEAD's history, with the canonical hash of the contract it sealed.
export function sealedContracts(cwd) {
  const out = []
  const log = git(['log', '--format=%H%x00%B%x1e'], cwd) ?? ''
  for (const rec of log.split('\x1e').map(r => r.replace(/^\n/, '')).filter(Boolean)) {
    const [sha, body] = rec.split('\x00')
    for (const line of trailerBlockOf(body ?? '', cwd).split('\n')) {
      const m = SNAP_TRAILER_RE.exec(line.trim())
      if (!m) continue
      const raw = git(['show', `${sha}:${m[4]}`], cwd, { allowFail: true })
      try {
        const manifest = JSON.parse(raw)
        out.push({ sha, pr: m[1], phase: m[2], manifest: m[4], contractHash: contractHash(manifest) })
      } catch {}
    }
  }
  return out
}
const testArtifacts = c => (c.testExempt === true ? [] : c.redTests.filter(a => (a?.kind ?? 'test') === 'test'))
const rowMentions = (row, file) => {
  const base = basename(file)
  return Object.values(row ?? {}).some(v => (Array.isArray(v) ? v : [v]).some(x => typeof x === 'string' && (x.includes(file) || x.includes(base))))
}
// A revision names every row it adds or edits, and every sealed witness file its diff modifies is
// covered by one of those rows — `changedRows` is checked against what the diff actually touched.
export function changedRowsErrors({ prev, contract, cwd }) {
  const changed = new Set(Array.isArray(contract.changedRows) ? contract.changedRows : [])
  const prevListed = new Map((prev.contract?.redTests ?? []).map(a => [a.file, a]))
  const changedRows = (contract.matrix ?? []).filter(r => changed.has(r?.id))
  for (const a of contract.testExempt === true ? [] : contract.redTests) {
    if (!prevListed.has(a.file)) continue
    const atPrev = git(['rev-parse', '--verify', '-q', `${prev.sha}:${a.file}`], cwd, { allowFail: true })
    const now = existsSync(join(cwd, a.file)) ? git(['hash-object', a.file], cwd) : null
    if (atPrev === now) continue
    if (!changedRows.some(r => rowMentions(r, a.file))) return { reason: 'changed-rows-omit-witness', path: a.file, changedRows: [...changed] }
  }
  const before = new Map((prev.contract?.matrix ?? []).map(r => [r?.id, canonical(r)]))
  const rows = (contract.matrix ?? []).filter(r => r?.id && before.get(r.id) !== canonical(r) && !changed.has(r.id)).map(r => r.id)
  if (rows.length) return { reason: 'changed-rows-omit-row', rows, changedRows: [...changed] }
  return null
}
const tail = s => String(s ?? '').trim().split('\n').slice(-20).join('\n')
// The repo's static gates over every listed TEST artifact. A gate is `{ name, command: [argv] }`; `{file}`
// runs it once per file (so the refusal names the file), `{files}` once over all of them.
export function runStaticGates({ gates, contract, cwd, timeoutMs = 300000 }) {
  if (!Array.isArray(gates) || gates.some(g => !g || typeof g !== 'object' || !String(g.name ?? '').trim() || !Array.isArray(g.command) || !g.command.length || g.command.some(a => typeof a !== 'string')))
    return { refusal: { reason: 'static-gates-invalid', detail: 'each gate is { name, command: [argv…] } with an optional {file} or {files} placeholder' } }
  const files = testArtifacts(contract).map(a => a.file)
  const results = []
  const run = argv => spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: timeoutMs, env: cleanGitEnv() })
  for (const g of gates) {
    const perFile = g.command.includes('{file}')
    const groups = perFile ? files.map(f => [f]) : [files]
    for (const group of groups) {
      if (!group.length) continue
      const argv = g.command.flatMap(a => (a === '{file}' ? group : a === '{files}' ? group : [a]))
      const r = run(argv)
      const output = tail(`${r.stdout ?? ''}\n${r.stderr ?? ''}`)
      const exitCode = r.status ?? (r.error ? -1 : 0)
      if (exitCode !== 0) {
        const named = group.find(f => output.includes(f)) ?? group[0]
        return { refusal: { reason: 'static-gate-failed', gate: g.name, path: named, exitCode, output } }
      }
      results.push({ gate: g.name, path: perFile ? group[0] : group.join(','), exitCode })
    }
  }
  return { results }
}
const NET_TRAP = `'use strict'
const fs = require('fs')
const net = require('net')
const log = process.env.PAIR_SEAL_TRAP_LOG
const loopback = h => h === undefined || h === null || h === '' || h === 'localhost' || h === '::1' || /^127\\./.test(String(h)) || h === '0.0.0.0'
const orig = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const a0 = Array.isArray(args[0]) ? args[0][0] : args[0]
  let host
  if (a0 && typeof a0 === 'object') {
    if (a0.path) return orig.apply(this, args)
    host = a0.host
  } else if (typeof a0 === 'number' || /^\\d+$/.test(String(a0))) host = typeof args[1] === 'string' ? args[1] : undefined
  else return orig.apply(this, args)
  if (loopback(host)) return orig.apply(this, args)
  try { fs.appendFileSync(log, 'net ' + host + '\\n') } catch {}
  const err = Object.assign(new Error('pair seal probe: network access to ' + host + ' refused'), { code: 'EPAIRSEAL' })
  process.nextTick(() => this.destroy(err))
  return this
}
`
// Every witness command, run once with a `gh` trap FIRST on PATH and a Node preload that refuses any
// non-loopback socket. A test that stubs `gh` itself (its own PATH entry, PAIR_GH_BIN) never reaches
// the trap; one that shells out to the operator's `gh` or opens a socket to a real host does. Its exit
// code is not judged here — only what it reached. The probe never reaches the network or a real `gh`.
export function hermeticProbe({ contract, cwd, timeoutMs = 120000 }) {
  const trap = mkdtempSync(join(tmpdir(), 'pair-seal-trap-'))
  try {
    writeFileSync(join(trap, 'gh'), '#!/bin/sh\nprintf \'gh %s\\n\' "$*" >> "$PAIR_SEAL_TRAP_LOG"\nexit 97\n', { mode: 0o755 })
    const preload = join(trap, 'net-trap.cjs')
    writeFileSync(preload, NET_TRAP)
    let probed = 0
    for (const [i, a] of testArtifacts(contract).entries()) {
      if (!String(a.command ?? '').trim()) continue
      const log = join(trap, `t${i}.log`)
      const env = { ...cleanGitEnv(), PATH: `${trap}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${JSON.stringify(preload)}`.trim(), PAIR_SEAL_TRAP_LOG: log }
      const r = spawnSync('/bin/sh', ['-c', a.command], { cwd, encoding: 'utf8', timeout: timeoutMs, env })
      probed++
      if (r.error?.code === 'ETIMEDOUT') return { refusal: { reason: 'hermetic-probe-timeout', path: a.file, command: a.command, timeoutMs } }
      const hits = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
      const gh = hits.find(l => l.startsWith('gh'))
      if (gh) return { refusal: { reason: 'test-spawns-gh', path: a.file, command: a.command, detail: gh } }
      const netHit = hits.find(l => l.startsWith('net '))
      if (netHit) return { refusal: { reason: 'test-reaches-network', path: a.file, command: a.command, host: netHit.slice(4) } }
    }
    return { probed }
  } finally {
    rmSync(trap, { recursive: true, force: true })
  }
}

export function seal({ pr, phase, base, contractPath, cwd, root, staticGates, hermetic = false }) {
  if (!SHA_RE.test(String(base))) return { sealed: false, reason: 'base-not-a-sha' }
  const resolved = resolveContractPath(contractPath, { cwd, root })
  if (resolved.error) return { sealed: false, reason: resolved.error, path: resolved.path, root: resolved.root }
  const raw = readFileSync(resolved.path, 'utf8')
  let contract
  try {
    contract = JSON.parse(raw)
  } catch {
    return { sealed: false, reason: 'contract-not-json' }
  }
  const errs = contractErrors(contract)
  if (errs.length) return { sealed: false, reason: 'contract-invalid', errors: errs }
  const predecessor = predecessorPhase(phase)
  let prev = null
  if (predecessor) {
    prev = findSnapshotByPhase({ pr, phase: predecessor, cwd })
    if (!prev) return { sealed: false, reason: 'predecessor-snapshot-missing', predecessor }
    if (!prev.contract) return { sealed: false, reason: 'predecessor-manifest-unreadable', predecessor, snapshot: prev.sha }
    const narrowed = scopeNarrowing(prev.contract, contract)
    if (narrowed.length) return { sealed: false, reason: 'fixScope-narrowed', predecessor, snapshot: prev.sha, errors: narrowed }
  }
  const { manifest, trailer, matches } = findSnapshot({ pr, phase, base, cwd })
  const files = artifactPaths(contract)

  // Idempotency: a lost agent response must not seal twice. Same trailer + parent + blobs ⇒ same seal.
  if (matches.length === 1) {
    const snap = matches[0]
    const parent = git(['rev-parse', `${snap}^`], cwd)
    const sameBlobs = files.every(f => {
      const atSnap = git(['rev-parse', '--verify', '-q', `${snap}:${f}`], cwd, { allowFail: true })
      const inTree = existsSync(join(cwd, f)) ? git(['hash-object', f], cwd) : null
      return atSnap && inTree && atSnap === inTree
    })
    if (parent === base && sameBlobs) return { sealed: true, snapshot: snap, manifest, reused: true }
    return { sealed: false, reason: 'snapshot-exists-but-differs', snapshot: snap }
  }
  if (matches.length > 1) return { sealed: false, reason: 'snapshot-ambiguous', snapshots: matches }

  const head = git(['rev-parse', 'HEAD'], cwd)
  if (head !== base) return { sealed: false, reason: 'head-not-base', head, base }
  for (const f of files) {
    if (!existsSync(join(cwd, f))) return { sealed: false, reason: 'artifact-missing', path: f }
    const actual = hashFile(f, cwd)
    const stated = contract.redTests.find(a => a.file === f).sha256
    if (actual !== stated) return { sealed: false, reason: 'artifact-hash-mismatch', path: f, stated, actual }
  }
  const dirty = (git(['status', '--porcelain', '--untracked-files=all'], cwd) ?? '')
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).replace(/^"|"$/g, ''))
    .filter(p => p !== contractPath && resolve(cwd, p) !== resolved.path && p !== manifest)
  const outside = dirty.filter(p => !files.includes(p))
  if (outside.length) return { sealed: false, reason: 'dirty-outside-contract', paths: outside }
  const notDirty = witnessPaths(contract).filter(f => !dirty.includes(f))
  if (notDirty.length && contract.testExempt !== true) {
    // A well-formed `reattest` (contractErrors already refused a malformed one) waives ONLY this
    // dirty requirement — every notDirty path's sha256 was already proven against the real artifact
    // above, before `dirty` was even computed. Nothing here trusts the content; it only stops
    // demanding a working-tree change that a merge already made moot.
    const reattestOk = contract.reattest && typeof contract.reattest === 'object' && String(contract.reattest.reason ?? '').trim()
    if (!reattestOk) return { sealed: false, reason: 'artifact-not-changed', paths: notDirty }
  }

  // ── the pre-seal guard (US-506 AC-9): refused with a typed reason naming the file, nothing committed
  const preSeal = { provenance: 'none' }
  if (contract.predecessorContractHash !== undefined) {
    const sealedHashes = sealedContracts(cwd).map(x => x.contractHash)
    if (!sealedHashes.includes(contract.predecessorContractHash)) return { sealed: false, reason: 'predecessor-hash-unmatched', path: contractPath, stated: contract.predecessorContractHash, sealedPredecessors: [...new Set(sealedHashes)] }
    preSeal.provenance = 'matched'
  }
  if (prev) {
    const omitted = changedRowsErrors({ prev, contract, cwd })
    if (omitted) return { sealed: false, predecessor, ...omitted }
  }
  if (staticGates !== undefined) {
    const gates = runStaticGates({ gates: staticGates, contract, cwd })
    if (gates.refusal) return { sealed: false, ...gates.refusal }
    preSeal.staticGates = gates.results
  }
  if (hermetic) {
    const probe = hermeticProbe({ contract, cwd })
    if (probe.refusal) return { sealed: false, ...probe.refusal }
    preSeal.hermetic = { probed: probe.probed }
  }

  const manifestAbs = join(cwd, manifest)
  mkdirSync(dirname(manifestAbs), { recursive: true })
  writeFileSync(
    manifestAbs,
    JSON.stringify({ $meta: { pr, phase, base, trailer, artifacts: files }, ...contract }, null, 2) + '\n',
  )
  git(['add', '--', manifest, ...files], cwd)
  git(['commit', '--no-verify', '-q', '-m', `RED snapshot pr=${pr} phase=${phase}\n\n${trailer}`], cwd)
  const snapshot = git(['rev-parse', 'HEAD'], cwd)
  return { sealed: true, snapshot, manifest, preSeal }
}

// ── verify ─────────────────────────────────────────────────────────────────────────────────
const inScope = (path, allowed) =>
  allowed.some(a => (a.endsWith('/') ? path.startsWith(a) : path === a || path.startsWith(`${a}/`)))

export function verify({ pr, phase, base, cwd }) {
  const breaches = []
  const breach = (code, extra = {}) => breaches.push({ code, ...extra })
  if (!SHA_RE.test(String(base))) return { verified: false, contractBreach: true, breaches: [{ code: 'base-not-a-sha' }] }
  const { manifest, matches } = findSnapshot({ pr, phase, base, cwd })
  if (matches.length === 0) return { verified: false, contractBreach: true, breaches: [{ code: 'snapshot-missing' }] }
  if (matches.length > 1) return { verified: false, contractBreach: true, breaches: [{ code: 'snapshot-ambiguous', snapshots: matches }] }
  const snapshot = matches[0]
  const parent = git(['rev-parse', `${snapshot}^`], cwd)
  if (parent !== base) breach('parent-not-base', { parent })

  const manifestRaw = git(['show', `${snapshot}:${manifest}`], cwd, { allowFail: true })
  let contract = null
  if (manifestRaw === null) breach('manifest-missing-in-snapshot', { manifest })
  else {
    try {
      contract = JSON.parse(manifestRaw)
    } catch {
      breach('manifest-not-json', { manifest })
    }
  }
  if (contract) {
    const errs = contractErrors(contract)
    if (errs.length) breach('manifest-invalid', { errors: errs })
  }
  const listed = contract && !contractErrors(contract).length ? artifactPaths(contract) : []

  const tree = (git(['diff-tree', '--no-commit-id', '--name-only', '-r', snapshot], cwd) ?? '').split('\n').filter(Boolean)
  const expected = new Set([manifest, ...listed])
  for (const p of tree) if (!expected.has(p)) breach('snapshot-carries-unlisted-file', { path: p })
  // Witnesses changed at the base, so they appear in the snapshot's diff; a `pass` control may be
  // an unchanged file — it must exist in the snapshot's TREE, not in its diff.
  // A well-formed `reattest` means the seal never required these witnesses to be dirty (see seal()),
  // so a valid seal never put them in this commit's OWN diff either — they must exist in the
  // snapshot's tree (checked below via `listed`), never in `mustDiff`.
  const reattested = contract && !contractErrors(contract).length && contract.reattest && typeof contract.reattest === 'object' && String(contract.reattest.reason ?? '').trim()
  const mustDiff = new Set([manifest, ...(contract && !contractErrors(contract).length && !reattested ? witnessPaths(contract) : [])])
  for (const p of mustDiff) if (!tree.includes(p)) breach('snapshot-lacks-listed-file', { path: p })
  for (const p of listed) if (!mustDiff.has(p) && git(['rev-parse', '--verify', '-q', `${snapshot}:${p}`], cwd, { allowFail: true }) === null) breach('snapshot-lacks-listed-file', { path: p })

  for (const f of listed) {
    const atSnap = git(['rev-parse', '--verify', '-q', `${snapshot}:${f}`], cwd, { allowFail: true })
    const atHead = git(['rev-parse', '--verify', '-q', `HEAD:${f}`], cwd, { allowFail: true })
    if (!atHead) breach('test-artifact-removed', { path: f })
    else if (atSnap !== atHead) breach('test-blob-changed', { path: f })
  }

  const after = (git(['-c', 'core.quotePath=false', 'diff', '--name-status', `${snapshot}..HEAD`], cwd) ?? '')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [status, ...rest] = l.split('\t')
      return { status: status[0], path: rest[rest.length - 1] }
    })
    .filter(({ path }) => path !== manifest && !listed.includes(path))
  for (const { path } of after) if (isTestPath(path)) breach('unlisted-test-changed', { path })
  if (contract?.fixScope) {
    const { allowedPaths, mode } = contract.fixScope
    for (const { status, path } of after) {
      if (isTestPath(path)) continue
      if (mode === 'test') breach('test-mode-production-change', { path, status })
      else if (!inScope(path, allowedPaths)) breach('out-of-scope', { path })
      else if (mode === 'behavioral' && status !== 'M' && isModulePath(path)) breach('behavioral-adds-or-moves-module', { path, status })
    }
  }
  const contractBreach = breaches.length > 0
  return { verified: !contractBreach, contractBreach, snapshot, manifest, breaches }
}

// ── verify-chain ───────────────────────────────────────────────────────────────────────────
// Every snapshot of the CYCLE between <base> and HEAD, oldest first, as {sha, pr, phase, base,
// manifest} — under EVERY seal identity: the initial chain seals as pr=0 (it predates the PR) and a
// remediation group seals as pr=<n>, and the segment of one seal ends where the next seal begins
// whichever identity it carries. Filtering by one identity made the a0 segment swallow every
// commit of the first remediation round and report a fabricated breach (T-9 review, t9-1). `pr`
// is kept in the signature for the callers and reported per snapshot; it no longer filters.
export function listSnapshots({ pr, base, cwd }) {
  void pr
  const head = git(['rev-parse', 'HEAD'], cwd)
  const range = head === base ? [] : [`${base}..HEAD`]
  // First-parent history only: a foreign branch merged into the story branch (its seals included)
  // never contributes a segment boundary of THIS cycle (T-9 re-review, t9b-3).
  const out = git(['log', '--reverse', '--first-parent', '--format=%H%x00%B%x1e', ...range], cwd) ?? ''
  const re = new RegExp(`^${TRAILER_KEY}: pr=(\\d+); phase=([^;]+); base=([0-9a-f]{40}); manifest=(\\S+)$`)
  const snaps = []
  for (const rec of out.split('\x1e').map(r => r.replace(/^\n/, '')).filter(Boolean)) {
    const [sha, body] = rec.split('\x00')
    for (const line of trailerBlockOf(body ?? '', cwd).split('\n')) {
      const m = re.exec(line.trim())
      if (m) snaps.push({ sha, pr: m[1], phase: m[2], base: m[3], manifest: m[4] })
    }
  }
  return snaps
}

// US-479 (canary 481-v2): `expectContract` says whether the CALLER knows a contract was sealed.
// Zero snapshots means two different things and the chain cannot tell them apart on its own: a
// contract that was sealed and has since been rewritten away (the rebase case this breach exists
// for), or a branch that never sealed anything — the first review of a PR with no remediation
// round. Reported as a breach, the second killed a cycle at r0 with nothing wrong, which is the
// failure the 2026-09-12 custody ADL names: never infer a breach from what is not there.
// The default stays STRICT, so no existing caller is silently weakened; a caller that knows there
// is no contract says so and gets `contract: 'none'` instead of an accusation.
// t9d-9: the assertion "this cycle has sealed nothing" is answerable from the run directory — a
// sealed `red-verify` handoff there means a contract exists. With `--run-dir` the expectation is
// DERIVED from that evidence; a caller's `--contract-expected false` beside a sealed handoff is a
// typed breach (`contract-expected-refused`) and the strict walk runs anyway. Without `--run-dir`
// the previous behaviour is unchanged.
export function sealedHandoffsIn(runDir) {
  if (!runDir || !existsSync(runDir)) return []
  const out = []
  for (const f of readdirSync(runDir)) {
    if (!f.endsWith('.json') || f.startsWith('.')) continue
    try {
      const d = JSON.parse(readFileSync(join(runDir, f), 'utf8'))
      if (d && d.skill === 'red-verify' && d.sealed === true) out.push(f)
    } catch {}
  }
  return out.sort()
}
// The breach codes a human override may cover — an EXPLICIT allow-list, never inferred from the
// shape of a breach's fields (r0-4). `test-blob-changed` is listed for its SEGMENT-scoped form only:
// the global blob-identity breach of the same name carries no `segment` and so never matches an
// override. A future breach code that happens to carry `path` + `segment` for an unrelated reason
// does NOT become overridable by growing those fields; it becomes overridable by being added here,
// deliberately, with the decision that says why.
export const OVERRIDABLE_BREACH_CODES = Object.freeze(['out-of-scope', 'unlisted-test-changed', 'test-mode-production-change', 'behavioral-adds-or-moves-module', 'test-blob-changed'])
// A human-authorized custody exception for a SEGMENT breach (`out-of-scope`, `unlisted-test-changed`,
// `test-mode-production-change`, `behavioral-adds-or-moves-module`, a segment-scoped `test-blob-changed`)
// on an ALREADY-SEALED segment — never inferred, never self-granted by an agent, and never a field on
// the sealed contract itself (that would mutate a sigillo already committed). Lives beside the story's
// own working files as `<runDir>/custody-overrides.json`: `{ overrides: [{ code, path, segment, reason,
// authorizedBy, at, verifyAgainst? }] }`. A malformed entry (missing any required field, an
// unparseable `at`, a `code` outside OVERRIDABLE_BREACH_CODES) is DROPPED, never partially trusted —
// the breach it would have covered stays blocking, fail-safe. `verifyAgainst`, when present, is not
// taken on faith: `verifyChainCore` proves the path's blob at HEAD is byte-identical to that ref
// before honoring the override — an override whose claimed source has since diverged is refused, not
// silently accepted. ABSENT is the only way to claim nothing; DECLARED means it must prove something,
// so an empty, blank or non-string `verifyAgainst` refuses the override instead of skipping the check
// (r0-3a), and a ref resolving to HEAD's own commit is self-attestation, not proof (r0-3b). An honored override never
// vanishes a breach: it moves from `breaches` to `overriddenBreaches`, still visible, still attributed.
function readCustodyOverrides(runDir) {
  const p = join(runDir, 'custody-overrides.json')
  if (!existsSync(p)) return []
  let data
  try {
    data = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return []
  }
  if (!data || !Array.isArray(data.overrides)) return []
  return data.overrides.filter(
    o =>
      o &&
      typeof o === 'object' &&
      OVERRIDABLE_BREACH_CODES.includes(o.code) &&
      String(o.code ?? '').trim() &&
      String(o.path ?? '').trim() &&
      String(o.segment ?? '').trim() &&
      String(o.authorizedBy ?? '').trim() &&
      String(o.reason ?? '').trim() &&
      String(o.at ?? '').trim() &&
      !Number.isNaN(Date.parse(o.at)),
  )
}
// ── merges from the base (US-506 T-7, AC-11) ──────────────────────────────────────────────────
// A story branch that merged its base (`origin/main`) carries, in every later segment's diff, the
// files that merge brought in — byte-identical to the base, not written by the PR. US-487's r0 walk
// counted 7 such files as `out-of-scope` / `unlisted-test-changed` and needed 7 custody overrides.
// With the declared base ref, a path whose blob at the segment end equals its blob at a merged
// parent that IS the base (an ancestor of the ref) is not a PR change. A file edited after the merge
// differs from the base and stays a breach; a merged branch that is not the base earns nothing.
// Each qualifying merge in the segment, with the paths the merge ITSELF changed (its diff against its
// first parent) and the merge-base it was taken from. Only those paths are candidates (US-506 F-3):
// a fixer's own later edit that happens to restore base content is not something the merge brought.
export function mergedBaseParents({ from, to, baseRef, cwd }) {
  if (!baseRef) return []
  const baseCommit = git(['rev-parse', '--verify', '-q', `${baseRef}^{commit}`], cwd, { allowFail: true })
  if (!baseCommit) return []
  const merges = (git(['rev-list', '--first-parent', '--merges', `${from}..${to}`], cwd, { allowFail: true }) ?? '').split('\n').filter(Boolean)
  const out = []
  for (const m of merges) {
    const [, first, ...others] = (git(['rev-list', '--parents', '-n', '1', m], cwd) ?? '').split(' ')
    for (const p of others) {
      if (git(['merge-base', '--is-ancestor', p, baseCommit], cwd, { allowFail: true }) === null) continue
      const changed = new Set((git(['-c', 'core.quotePath=false', 'diff', '--name-only', first, m], cwd) ?? '').split('\n').filter(Boolean))
      out.push({ merge: m, parent: p, changed, mergeBase: git(['merge-base', first, p], cwd, { allowFail: true }) })
    }
  }
  return out
}
const blobAt = (rev, path, cwd) => git(['rev-parse', '--verify', '-q', `${rev}:${path}`], cwd, { allowFail: true })
// Exempt ONLY a path the merge changed, whose content at the segment end is what the base carries:
// byte-identical to a non-null base blob, or — for a deletion — a path the BASE removed that existed
// before the branches split. A path the PR created (absent from the merge-base) deleted anywhere is
// never exempt: a deletion of a PR-owned file is the PR's change.
const identicalToMergedBase = (path, end, merged, cwd) =>
  merged.some(({ parent, changed, mergeBase }) => {
    if (!changed.has(path)) return false
    const atEnd = blobAt(end, path, cwd)
    const atBase = blobAt(parent, path, cwd)
    if (atBase !== null) return atEnd === atBase
    return atEnd === null && !!mergeBase && blobAt(mergeBase, path, cwd) !== null
  })

export function verifyChain({ pr, base, cwd, expectContract, runDir, baseRef }) {
  const overrides = runDir !== undefined ? readCustodyOverrides(runDir) : []
  if (runDir === undefined) return verifyChainCore({ pr, base, cwd, expectContract: expectContract ?? true, overrides, baseRef })
  const sealed = sealedHandoffsIn(runDir)
  const derived = sealed.length > 0
  const out = verifyChainCore({ pr, base, cwd, expectContract: derived, overrides, baseRef })
  out.contractExpectation = { source: 'run-dir', runDir, sealedHandoffs: sealed, expectContract: derived }
  if (expectContract === false && derived) {
    out.breaches = [{ code: 'contract-expected-refused', sealedHandoffs: sealed }, ...(out.breaches ?? [])]
    out.verified = false
    out.contractBreach = true
  }
  return out
}
function verifyChainCore({ pr, base, cwd, expectContract = true, overrides = [], baseRef }) {
  if (!SHA_RE.test(String(base))) return { verified: false, contractBreach: true, breaches: [{ code: 'base-not-a-sha' }], snapshots: [] }
  const snaps = listSnapshots({ pr, base, cwd })
  // US-479 (canary 481-v5): `expectContract: false` is a statement about THIS cycle — it has sealed
  // nothing. Any snapshot in range therefore belongs to another, concluded cycle, and a concluded
  // cycle's seals are history: they must not fail the one starting now. Without this, a finished
  // cycle left every file it sealed untouchable outside the workflow forever — a hand fix, a hotfix
  // or a merge from main touching one of them failed the NEXT cycle at its first review, and the
  // escape the design intends (a successor seal ends the previous segment) was unreachable, because
  // sealing needs `validate` and custody blocks at `r0`. Reported as history, never dropped in
  // silence. The strict default is untouched: inside a cycle every guarantee holds exactly as before.
  if (!expectContract)
    return { verified: true, contractBreach: false, breaches: [], snapshots: [], contract: 'none', historicalSnapshots: snaps.map(s => ({ phase: s.phase, sha: s.sha, manifest: s.manifest })) }
  if (!snaps.length) return { verified: false, contractBreach: true, breaches: [{ code: 'snapshot-missing' }], snapshots: [] }
  const breaches = []
  const overriddenBreaches = []
  const findOverride = (code, path, segment) => overrides.find(o => o.code === code && o.path === path && o.segment === segment)
  const overrideHolds = o => {
    // ABSENT vs DECLARED: no `verifyAgainst` claims nothing, so nothing is checked. A field that IS
    // there must prove something — empty, blank or not a string is an unverifiable claim, and an
    // unverifiable claim refuses the override rather than skipping the proof (r0-3a).
    if (!('verifyAgainst' in o) || o.verifyAgainst === undefined) return true
    const ref = o.verifyAgainst
    if (typeof ref !== 'string' || !ref.trim()) return false
    // The ref must PEEL TO a commit other than HEAD's: `HEAD` (or any ref resolving to it) compares
    // the path with itself, which is true by construction and proves nothing (r0-3b). `^{commit}`
    // is required, not optional — `rev-parse --verify` alone returns the object the ref NAMES, not
    // what it peels to, so an annotated tag AT HEAD (a tag object, not a commit) or `HEAD^{tree}` (a
    // tree, not a commit) both differ from HEAD's raw commit sha while resolving `${ref}:${path}`
    // through HEAD's own tree regardless — the blob comparison below becomes HEAD:path === HEAD:path
    // again, silently. Peeling both sides to `^{commit}` closes that: a tag or tree that names HEAD
    // collapses onto the same commit id as HEAD itself and is refused, exactly like the bare `HEAD` case.
    const refCommit = git(['rev-parse', '--verify', '-q', `${ref}^{commit}`], cwd, { allowFail: true })
    const headCommit = git(['rev-parse', '--verify', '-q', 'HEAD^{commit}'], cwd, { allowFail: true })
    if (refCommit === null || headCommit === null || refCommit === headCommit) return false
    const atRef = git(['rev-parse', '--verify', '-q', `${ref}:${o.path}`], cwd, { allowFail: true })
    const atHead = git(['rev-parse', '--verify', '-q', `HEAD:${o.path}`], cwd, { allowFail: true })
    return atRef !== null && atRef === atHead
  }
  const breach = (code, extra = {}) => {
    // Overridable by NAME (OVERRIDABLE_BREACH_CODES), and then only in the segment-scoped form that
    // an override can address: the `path` + `segment` pair is the coordinate, never the credential.
    if (OVERRIDABLE_BREACH_CODES.includes(code) && extra.path && extra.segment) {
      const o = findOverride(code, extra.path, extra.segment)
      if (o && overrideHolds(o)) {
        overriddenBreaches.push({ code, ...extra, override: { authorizedBy: o.authorizedBy, reason: o.reason, at: o.at, ...(o.verifyAgainst ? { verifyAgainst: o.verifyAgainst } : {}) } })
        return
      }
    }
    breaches.push({ code, ...extra })
  }
  const head = git(['rev-parse', 'HEAD'], cwd)
  // Each snapshot: parent == its declared base, and that base descends from the previous snapshot.
  const contracts = []
  for (const [i, s] of snaps.entries()) {
    const parent = git(['rev-parse', `${s.sha}^`], cwd)
    if (parent !== s.base) breach('parent-not-base', { phase: s.phase, parent })
    if (i > 0 && git(['merge-base', '--is-ancestor', snaps[i - 1].sha, s.base], cwd, { allowFail: true }) === null) breach('successor-not-above-predecessor', { phase: s.phase })
    const raw = git(['show', `${s.sha}:${s.manifest}`], cwd, { allowFail: true })
    let contract = null
    if (raw === null) breach('manifest-missing-in-snapshot', { phase: s.phase, manifest: s.manifest })
    else {
      try {
        contract = JSON.parse(raw)
      } catch {
        breach('manifest-not-json', { phase: s.phase, manifest: s.manifest })
      }
    }
    if (contract) {
      const errs = contractErrors(contract)
      if (errs.length) {
        breach('manifest-invalid', { phase: s.phase, errors: errs })
        contract = null
      }
    }
    if (contract && i > 0 && predecessorPhase(s.phase) === snaps[i - 1].phase && contracts[i - 1]?.contract) {
      const narrowed = scopeNarrowing(contracts[i - 1].contract, contract)
      if (narrowed.length) breach('successor-narrows-scope', { phase: s.phase, errors: narrowed })
    }
    const listed = contract ? artifactPaths(contract) : []
    const tree = (git(['diff-tree', '--no-commit-id', '--name-only', '-r', s.sha], cwd) ?? '').split('\n').filter(Boolean)
    for (const p of tree) if (p !== s.manifest && !listed.includes(p)) breach('snapshot-carries-unlisted-file', { phase: s.phase, path: p })
    for (const p of listed) if (git(['rev-parse', '--verify', '-q', `${s.sha}:${p}`], cwd, { allowFail: true }) === null) breach('snapshot-lacks-listed-file', { phase: s.phase, path: p })
    contracts.push({ ...s, contract, listed })
  }
  // Blob identity: at HEAD every sealed artifact equals the LATEST snapshot that lists it.
  const latestBy = new Map()
  for (const c of contracts) for (const f of c.listed) latestBy.set(f, c)
  for (const [f, c] of latestBy) {
    const atSnap = git(['rev-parse', '--verify', '-q', `${c.sha}:${f}`], cwd, { allowFail: true })
    const atHead = git(['rev-parse', '--verify', '-q', `HEAD:${f}`], cwd, { allowFail: true })
    if (!atHead) breach('test-artifact-removed', { path: f })
    else if (atSnap !== atHead) breach('test-blob-changed', { path: f, sealedBy: c.phase })
  }
  // Segments: the commits between one snapshot and the next (or HEAD) live under that snapshot's scope.
  const fromBase = new Set()
  for (const [i, c] of contracts.entries()) {
    const end = i + 1 < contracts.length ? `${contracts[i + 1].sha}^` : head
    const manifests = new Set(contracts.map(x => x.manifest))
    const mergedParents = mergedBaseParents({ from: c.sha, to: end, baseRef, cwd })
    const changes = (git(['-c', 'core.quotePath=false', 'diff', '--name-status', `${c.sha}..${end}`], cwd) ?? '')
      .split('\n')
      .filter(Boolean)
      .map(l => {
        const [status, ...rest] = l.split('\t')
        return { status: status[0], path: rest[rest.length - 1] }
      })
      .filter(({ path }) => !manifests.has(path))
    for (const { status, path } of changes) {
      // US-506 AC-11: byte-identical to the base this segment merged ⇒ the base's change, not the PR's.
      // A sealed blob is never exempted this way: its identity is checked below regardless.
      if (mergedParents.length && !contracts.slice(0, i + 1).some(x => x.listed.includes(path)) && identicalToMergedBase(path, end, mergedParents, cwd)) {
        fromBase.add(path)
        continue
      }
      // A blob sealed by THIS or an EARLIER snapshot stays sealed through every later segment: its
      // change here is a sealed-blob change (reported once, by blob identity, unless a successor
      // re-seals it), never an "unlisted test" of the segment's own contract.
      if (contracts.slice(0, i + 1).some(x => x.listed.includes(path))) {
        // a sealed blob edited inside a segment (not by a successor snapshot) — even if a later
        // snapshot re-seals the file, THIS change was unauthorized
        if (!contracts.slice(i + 1).some(x => x.listed.includes(path))) continue // already reported by blob identity
        breach('test-blob-changed', { path, sealedBy: c.phase, segment: c.phase })
        continue
      }
      if (isTestPath(path)) {
        if (!contracts.slice(i + 1).some(x => x.listed.includes(path))) breach('unlisted-test-changed', { path, segment: c.phase })
        continue
      }
      if (!c.contract?.fixScope) continue
      const { allowedPaths, mode } = c.contract.fixScope
      if (mode === 'test') breach('test-mode-production-change', { path, status, segment: c.phase })
      else if (!inScope(path, allowedPaths)) breach('out-of-scope', { path, segment: c.phase })
      else if (mode === 'behavioral' && status !== 'M' && isModulePath(path)) breach('behavioral-adds-or-moves-module', { path, status, segment: c.phase })
    }
  }
  // dedupe identical breaches
  const seen = new Set()
  const unique = breaches.filter(b => {
    const k = JSON.stringify([b.code, b.path ?? '', b.phase ?? ''])
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return {
    verified: unique.length === 0,
    contractBreach: unique.length > 0,
    head,
    snapshots: snaps.map(s => ({ pr: s.pr, phase: s.phase, snapshot: s.sha, base: s.base, manifest: s.manifest })),
    breaches: unique,
    ...(overriddenBreaches.length ? { overriddenBreaches } : {}),
    ...(fromBase.size ? { mergedBase: { baseRef, paths: [...fromBase].sort() } } : {}),
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
function parseCli(argv) {
  const [cmd, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i]
    if (!k?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${k}`)
    opts[k.slice(2)] = rest[i + 1]
  }
  return { cmd, opts }
}

// Entry-point guard by REAL path: an install directory reached through a symlink (macOS's /var → /private/var,
// a linked skills dir) makes `import.meta.url` and `process.argv[1]` spell the same file two ways, and a
// string comparison silently turns the CLI into a no-op that exits 0. Compare realpaths, never strings.
const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  try {
    const { cmd, opts } = parseCli(process.argv.slice(2))
    // t9d-19 (DT-32): the flag set is closed per command — an unknown flag is refused, never ignored.
    const FLAGS = { 'verify-chain': ['pr', 'base', 'cwd', 'contract-expected', 'run-dir', 'base-ref'], seal: ['pr', 'phase', 'base', 'cwd', 'contract', 'root', 'static-gates'], verify: ['pr', 'phase', 'base', 'cwd'] }
    if (FLAGS[cmd]) {
      const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
      if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
    }
    const cwd = opts.cwd ?? process.cwd()
    const common = { pr: opts.pr, phase: opts.phase, base: opts.base, cwd }
    for (const k of cmd === 'verify-chain' ? ['pr', 'base'] : ['pr', 'phase', 'base']) if (!opts[k]) throw new Error(`--${k} is required`)
    if (!/^\d+$/.test(String(opts.pr))) throw new Error(`--pr must be a number, got ${JSON.stringify(opts.pr)}`)
    let out
    if (cmd === 'verify-chain') {
      // US-479 (canary 481-v2): `--contract-expected false` states that this cycle has sealed nothing.
      // Only that exact spelling relaxes the check; anything else keeps the strict default.
      // t9d-9: `--run-dir <run/story dir>` derives the expectation from the sealed handoffs there; the flag
      // is then a claim the script checks, never a bypass.
      // US-506 AC-11: `--base-ref <ref>` (the story's base, e.g. origin/main) lets a merge of that base
      // bring in files byte-identical to it without counting them as PR changes.
      out = verifyChain({ pr: opts.pr, base: opts.base, cwd, expectContract: String(opts['contract-expected'] ?? 'true') !== 'false', runDir: opts['run-dir'], baseRef: opts['base-ref'] })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.verified ? 0 : 1)
    } else if (cmd === 'seal') {
      if (!opts.contract) throw new Error('--contract <draft.json> is required')
      // US-506 AC-9: the repo's static gates are a REQUIRED input — the sealer never seals blind. `[]`
      // is an explicit, recorded "this repository has none"; the hermetic probe always runs.
      if (opts['static-gates'] === undefined) throw new Error("--static-gates '<json array of { name, command: [argv] }>' is required ('[]' when the repository has none)")
      let staticGates
      try {
        staticGates = JSON.parse(opts['static-gates'])
      } catch {
        throw new Error('--static-gates must be a JSON array')
      }
      out = seal({ ...common, contractPath: opts.contract, root: opts.root, staticGates, hermetic: true })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.sealed ? 0 : 1)
    } else if (cmd === 'verify') {
      out = verify(common)
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.verified ? 0 : 1)
    } else throw new Error(`unknown command: ${cmd} (expected seal | verify | verify-chain)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
