#!/usr/bin/env node
// Deterministic Git custody for a RED contract. Ships inside the `red-verify` skill (seal, after
// the independent validation) and, byte-identical, inside the `review-phase` skill (verify /
// verify-chain, the final verifier's first step) — a test keeps the copies equal. Every command runs
// INSIDE the story or review worktree by the phase skill that owns it, never by the workflow sandbox
// (which has no filesystem) and never re-implemented by an LLM agent:
//
//   node <skill dir>/scripts/red-snapshot.mjs seal   --pr <n> --phase <p> --base <sha> --contract <contract.json> [--root <main checkout>]
//     Verifies HEAD is exactly <base>, every listed artifact hashes to its stated sha256, and the
//     working tree is dirty ONLY at those artifacts; writes the manifest, creates ONE local
//     `--no-verify` commit carrying the `Pair-RED-Snapshot` trailer, prints {sealed, snapshot}.
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
//   node <skill dir>/scripts/red-snapshot.mjs verify-chain --pr <n> --base <sha>
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
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
  return errs
}

export const artifactBaseline = a => String(a?.baseline ?? 'red')
export const artifactPaths = c => (c.testExempt === true ? [] : c.redTests.map(a => a.file))
// Artifacts the seal requires to have CHANGED at the base: red witnesses. A `pass` control is an
// already-correct test and may be sealed unchanged.
export const witnessPaths = c => (c.testExempt === true ? [] : c.redTests.filter(a => artifactBaseline(a) === 'red').map(a => a.file))

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

export function seal({ pr, phase, base, contractPath, cwd, root }) {
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
  // Witnesses changed at the base, so they appear in the snapshot's diff; a `pass` control may be
  // an unchanged file — it must exist in the snapshot's TREE, not in its diff.
  const mustDiff = new Set([manifest, ...(contract && !contractErrors(contract).length ? witnessPaths(contract) : [])])
  for (const p of mustDiff) if (!tree.includes(p)) breach('snapshot-lacks-listed-file', { path: p })
  for (const p of listed) if (!mustDiff.has(p) && git(['rev-parse', '--verify', '-q', `${snapshot}:${p}`], cwd, { allowFail: true }) === null) breach('snapshot-lacks-listed-file', { path: p })

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
      if (mode === 'test') breach('test-mode-production-change', { path, status })
      else if (!inScope(path, allowedPaths)) breach('out-of-scope', { path })
      else if (mode === 'behavioral' && status !== 'M') breach('behavioral-adds-or-moves-module', { path, status })
    }
  }
  const contractBreach = breaches.length > 0
  return { verified: !contractBreach, contractBreach, snapshot, manifest, breaches }
}

// ── verify-chain ───────────────────────────────────────────────────────────────────────────
// Every snapshot of this PR between <base> and HEAD, oldest first, as {sha, phase, base, manifest}.
export function listSnapshots({ pr, base, cwd }) {
  const head = git(['rev-parse', 'HEAD'], cwd)
  const range = head === base ? [] : [`${base}..HEAD`]
  const out = git(['log', '--reverse', '--format=%H%x00%B%x1e', ...range], cwd) ?? ''
  const re = new RegExp(`^${TRAILER_KEY}: pr=${String(pr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}; phase=([^;]+); base=([0-9a-f]{40}); manifest=(\\S+)$`)
  const snaps = []
  for (const rec of out.split('\x1e').map(r => r.replace(/^\n/, '')).filter(Boolean)) {
    const [sha, body] = rec.split('\x00')
    for (const line of (body ?? '').split('\n')) {
      const m = re.exec(line.trim())
      if (m) snaps.push({ sha, phase: m[1], base: m[2], manifest: m[3] })
    }
  }
  return snaps
}

export function verifyChain({ pr, base, cwd }) {
  if (!SHA_RE.test(String(base))) return { verified: false, contractBreach: true, breaches: [{ code: 'base-not-a-sha' }], snapshots: [] }
  const snaps = listSnapshots({ pr, base, cwd })
  if (!snaps.length) return { verified: false, contractBreach: true, breaches: [{ code: 'snapshot-missing' }], snapshots: [] }
  const breaches = []
  const breach = (code, extra = {}) => breaches.push({ code, ...extra })
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
  for (const [i, c] of contracts.entries()) {
    const end = i + 1 < contracts.length ? `${contracts[i + 1].sha}^` : head
    const manifests = new Set(contracts.map(x => x.manifest))
    const changes = (git(['diff', '--name-status', `${c.sha}..${end}`], cwd) ?? '')
      .split('\n')
      .filter(Boolean)
      .map(l => {
        const [status, ...rest] = l.split('\t')
        return { status: status[0], path: rest[rest.length - 1] }
      })
      .filter(({ path }) => !manifests.has(path))
    for (const { status, path } of changes) {
      if (c.listed.includes(path)) {
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
      else if (mode === 'behavioral' && status !== 'M') breach('behavioral-adds-or-moves-module', { path, status, segment: c.phase })
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
  return { verified: unique.length === 0, contractBreach: unique.length > 0, head, snapshots: snaps.map(s => ({ phase: s.phase, snapshot: s.sha, base: s.base, manifest: s.manifest })), breaches: unique }
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
    const cwd = opts.cwd ?? process.cwd()
    const common = { pr: opts.pr, phase: opts.phase, base: opts.base, cwd }
    for (const k of cmd === 'verify-chain' ? ['pr', 'base'] : ['pr', 'phase', 'base']) if (!opts[k]) throw new Error(`--${k} is required`)
    let out
    if (cmd === 'verify-chain') {
      out = verifyChain({ pr: opts.pr, base: opts.base, cwd })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.verified ? 0 : 1)
    } else if (cmd === 'seal') {
      if (!opts.contract) throw new Error('--contract <draft.json> is required')
      out = seal({ ...common, contractPath: opts.contract, root: opts.root })
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
