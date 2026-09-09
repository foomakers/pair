#!/usr/bin/env node
// Deterministic Git custody for a RED contract. Ships inside the `red-seal` skill (seal) and,
// byte-identical, inside the `p3-verify` skill (verify) — a test keeps the two copies equal. Both
// commands run INSIDE the story worktree by the phase skill that owns them, never by the workflow sandbox (which has no
// filesystem) and never re-implemented by an LLM agent:
//
//   node <skill dir>/scripts/red-snapshot.mjs seal   --pr <n> --phase <p> --base <sha> --contract <draft.json>
//     Verifies HEAD is exactly <base>, every listed artifact hashes to its stated sha256, and the
//     working tree is dirty ONLY at those artifacts; writes the manifest, creates ONE local
//     `--no-verify` commit carrying the `Pair-RED-Snapshot` trailer, prints {sealed, snapshot}.
//     Idempotent: an existing snapshot with the same trailer, parent and blobs is returned as-is.
//
//   node <skill dir>/scripts/red-snapshot.mjs verify --pr <n> --phase <p> --base <sha>
//     Finds the ONE snapshot in <base>..HEAD by trailer, proves parent == base, tree == manifest +
//     listed artifacts, every listed blob byte-identical at HEAD, no unlisted test artifact changed
//     after the seal, and every production change inside the manifest's fixScope.allowedPaths
//     (a `behavioral` scope adds/moves no production module). Prints {verified, contractBreach,
//     breaches[]}. Any breach is terminal for the attempt; the script repairs nothing.
//
// A rebase is never repaired (US-479 c1): a snapshot that is no longer an ancestor is simply
// `snapshot-missing`, and the attempt fails closed.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

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
export const isTestPath = p =>
  /(^|\/)(test|tests|__tests__|spec|fixtures?)\//.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)

export const manifestPathFor = (pr, phase) =>
  `.pair/red-snapshots/pr-${pr}-${String(phase).replace(/[^a-zA-Z0-9._-]/g, '-')}.json`
export const trailerFor = ({ pr, phase, base, manifest }) =>
  `${TRAILER_KEY}: pr=${pr}; phase=${phase}; base=${base}; manifest=${manifest}`

export function hashFile(path, cwd) {
  return `sha256:${createHash('sha256').update(readFileSync(join(cwd, path))).digest('hex')}`
}

export function git(args, cwd, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`)
  return r.status === 0 ? r.stdout.replace(/\n$/, '') : null
}

// ── Contract shape (the RED author's return value, persisted as the manifest) ──────────────
export function contractErrors(c) {
  const errs = []
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['contract must be an object']
  const scope = c.fixScope
  if (!scope || typeof scope !== 'object') errs.push('fixScope missing')
  else {
    if (!String(scope.owner ?? '').trim()) errs.push('fixScope.owner missing')
    if (!['behavioral', 'structural'].includes(scope.mode)) errs.push('fixScope.mode must be behavioral | structural')
    if (!Array.isArray(scope.allowedPaths) || scope.allowedPaths.length === 0) errs.push('fixScope.allowedPaths must be a non-empty array')
    else for (const p of scope.allowedPaths) if (!isRelPath(p)) errs.push(`fixScope.allowedPaths has an invalid path: ${JSON.stringify(p)}`)
  }
  if (c.testExempt === true) {
    if (!String(c.exemptionRationale ?? '').trim()) errs.push('testExempt requires exemptionRationale')
    return errs
  }
  if (!Array.isArray(c.redTests) || c.redTests.length === 0) errs.push('redTests must be a non-empty array')
  else {
    const seen = new Set()
    for (const [i, a] of c.redTests.entries()) {
      const kind = a?.kind ?? 'test'
      if (!isRelPath(a?.file)) errs.push(`redTests[${i}].file must be a repository-relative path`)
      else if (seen.has(a.file)) errs.push(`redTests[${i}].file is listed twice: ${a.file}`)
      else seen.add(a.file)
      if (!SHA256_RE.test(String(a?.sha256 ?? ''))) errs.push(`redTests[${i}].sha256 must be sha256:<64 hex>`)
      if (kind === 'test') {
        if (!String(a?.command ?? '').trim()) errs.push(`redTests[${i}] (test) needs its failing command`)
        if (!/fail/i.test(String(a?.observed ?? ''))) errs.push(`redTests[${i}] (test) needs an observed RED failure`)
      } else if (kind === 'fixture') {
        if (!String(a?.consumedBy ?? '').trim()) errs.push(`redTests[${i}] (fixture) needs consumedBy`)
      } else errs.push(`redTests[${i}].kind must be test | fixture`)
    }
    for (const [i, a] of c.redTests.entries())
      if ((a?.kind ?? 'test') === 'fixture' && a.consumedBy) {
        const consumer = c.redTests.find(t => t.file === a.consumedBy && (t.kind ?? 'test') === 'test')
        if (!consumer) errs.push(`redTests[${i}] (fixture) consumedBy does not name a listed RED test: ${a.consumedBy}`)
      }
  }
  return errs
}

export const artifactPaths = c => (c.testExempt === true ? [] : c.redTests.map(a => a.file))

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
    .filter(({ body }) => body.split('\n').some(line => line.trim() === trailer))
    .map(({ sha }) => sha)
  return { manifest, trailer, matches }
}

export function seal({ pr, phase, base, contractPath, cwd }) {
  if (!SHA_RE.test(String(base))) return { sealed: false, reason: 'base-not-a-sha' }
  const raw = readFileSync(join(cwd, contractPath), 'utf8')
  let contract
  try {
    contract = JSON.parse(raw)
  } catch {
    return { sealed: false, reason: 'contract-not-json' }
  }
  const errs = contractErrors(contract)
  if (errs.length) return { sealed: false, reason: 'contract-invalid', errors: errs }
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
    .filter(p => p !== contractPath && p !== manifest)
  const outside = dirty.filter(p => !files.includes(p))
  if (outside.length) return { sealed: false, reason: 'dirty-outside-contract', paths: outside }
  const notDirty = files.filter(f => !dirty.includes(f))
  if (notDirty.length && contract.testExempt !== true)
    return { sealed: false, reason: 'artifact-not-changed', paths: notDirty }

  const manifestAbs = join(cwd, manifest)
  mkdirSync(dirname(manifestAbs), { recursive: true })
  writeFileSync(
    manifestAbs,
    JSON.stringify({ $meta: { pr, phase, base, trailer, artifacts: files }, ...contract }, null, 2) + '\n',
  )
  git(['add', '--', manifest, ...files], cwd)
  git(['commit', '--no-verify', '-q', '-m', `RED snapshot pr=${pr} phase=${phase}\n\n${trailer}`], cwd)
  const snapshot = git(['rev-parse', 'HEAD'], cwd)
  return { sealed: true, snapshot, manifest }
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
  for (const p of expected) if (!tree.includes(p)) breach('snapshot-lacks-listed-file', { path: p })

  for (const f of listed) {
    const atSnap = git(['rev-parse', '--verify', '-q', `${snapshot}:${f}`], cwd, { allowFail: true })
    const atHead = git(['rev-parse', '--verify', '-q', `HEAD:${f}`], cwd, { allowFail: true })
    if (!atHead) breach('test-artifact-removed', { path: f })
    else if (atSnap !== atHead) breach('test-blob-changed', { path: f })
  }

  const after = (git(['diff', '--name-status', `${snapshot}..HEAD`], cwd) ?? '')
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
      if (!inScope(path, allowedPaths)) breach('out-of-scope', { path })
      else if (mode === 'behavioral' && status !== 'M') breach('behavioral-adds-or-moves-module', { path, status })
    }
  }
  const contractBreach = breaches.length > 0
  return { verified: !contractBreach, contractBreach, snapshot, manifest, breaches }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { cmd, opts } = parseCli(process.argv.slice(2))
    const cwd = opts.cwd ?? process.cwd()
    const common = { pr: opts.pr, phase: opts.phase, base: opts.base, cwd }
    for (const k of ['pr', 'phase', 'base']) if (!opts[k]) throw new Error(`--${k} is required`)
    let out
    if (cmd === 'seal') {
      if (!opts.contract) throw new Error('--contract <draft.json> is required')
      out = seal({ ...common, contractPath: opts.contract })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.sealed ? 0 : 1)
    } else if (cmd === 'verify') {
      out = verify(common)
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.verified ? 0 : 1)
    } else throw new Error(`unknown command: ${cmd} (expected seal | verify)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
