import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

/**
 * /publish-pr Phase 1 as a shipped KB asset (#419).
 *
 * The skill no longer asks the agent to re-derive the snapshot/stage/commit
 * recipe from prose — it runs this file (built to
 * `.pair/knowledge/assets/mirror-realign.cjs`, the file `pair install` puts in
 * every adopter's tree):
 *
 *   node mirror-realign.cjs --command <adoption's mirror-realign-command>
 *     --message <regeneration commit message> [--unsafe <glob> ...]
 *
 * Semantics (exit codes are load-bearing):
 *   0 — the command ran (or there was nothing to do: `no-op`); stdout carries
 *       the `Mirrors:` row the skill reports.
 *   2 — HALT before running the command: an untracked file sits under one of
 *       the `--unsafe` trees, or the invocation itself is malformed. Nothing
 *       was written; stderr names each path and the stash remedy.
 *   1 — the command ran and failed, or a git step the recipe needs failed.
 *       Stderr carries the reason verbatim.
 *
 * Node builtins only, so the single-file transpile is a complete program —
 * the same constraint `build-ratchet-asset.ts` documents.
 */

interface PorcelainEntry {
  xy: string
  path: string
}

function fail(message: string, code: number): never {
  process.stderr.write(`mirror-realign: ${message}\n`)
  process.exit(code)
}

function sh(dir: string, args: string[]): { ok: boolean; out: string; err: string } {
  const child = spawnSync('git', args, { cwd: dir, encoding: 'utf-8' })
  if (child.error) return { ok: false, out: '', err: String(child.error) }
  return { ok: child.status === 0, out: child.stdout ?? '', err: child.stderr ?? '' }
}

/**
 * `git status --porcelain -z` is NUL-separated and never quotes or
 * octal-escapes a path — which is the whole reason the recipe uses it. It
 * costs one parsing rule: a rename/copy entry spends a SECOND field on its
 * OLD path, so that field is consumed, never read as an entry of its own.
 */
function parsePorcelainZ(out: string): PorcelainEntry[] {
  const entries: PorcelainEntry[] = []
  const fields = out.split('\0')
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] as string
    if (field === '') continue
    const xy = field.slice(0, 2)
    entries.push({ xy, path: field.slice(3) })
    if (xy.includes('R') || xy.includes('C')) i += 1
  }
  return entries
}

function snapshotEntries(dir: string): PorcelainEntry[] {
  const res = sh(dir, ['status', '--porcelain', '-z', '--untracked-files=all'])
  if (!res.ok) fail(`could not snapshot the working tree: ${res.err.trim()}`, 1)
  return parsePorcelainZ(res.out)
}

/** Digest only entries whose worktree file still exists — a deletion has none to read. */
function digestPaths(dir: string, paths: string[], write: boolean): Map<string, string> {
  const digests = new Map<string, string>()
  for (const path of paths) {
    if (!existsSync(`${dir}/${path}`)) continue
    const args = write ? ['hash-object', '-w', '--', path] : ['hash-object', '--', path]
    const res = sh(dir, args)
    if (res.ok) digests.set(path, res.out.trim())
  }
  return digests
}

/** Minimal glob for `--unsafe` trees: `**` spans segments, `*`/`?` stay inside one. */
function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i] as string
    if (c !== '*' && c !== '?') {
      re += c.replace(/[.+^${}()|[\]\\]/, '\\$&')
      continue
    }
    if (c === '?') {
      re += '[^/]'
      continue
    }
    if (glob[i + 1] === '*') {
      re += glob[i + 2] === '/' ? '(.*/)?' : '.*'
      i += glob[i + 2] === '/' ? 2 : 1
    } else {
      re += '[^/]*'
    }
  }
  return new RegExp(`^${re}$`)
}

/** A before entry HEAD does not know: untracked (`??`) or staged-new (`A?`). */
function isHeadUnknown(xy: string): boolean {
  return xy === '??' || xy[0] === 'A'
}

function quotePath(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

interface ParsedArgs {
  command: string
  message: string
  unsafe: string[]
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: '', message: '', unsafe: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string
    if (arg === '--command') parsed.command = argv[(i += 1)] ?? ''
    else if (arg === '--message') parsed.message = argv[(i += 1)] ?? ''
    else if (arg === '--unsafe') parsed.unsafe.push(argv[(i += 1)] ?? '')
    else fail(`unknown argument ${JSON.stringify(arg)}`, 2)
  }
  if (!parsed.command) fail('missing --command — the adoption command to run', 2)
  if (!parsed.message) fail('missing --message — the regeneration commit message', 2)
  return parsed
}

/** The unsafe check runs BEFORE the command — the one point where a HALT costs nothing. */
function haltIfUnsafe(before: PorcelainEntry[], unsafe: string[]): void {
  const matchers = unsafe.map(globToRegExp)
  const atRisk = before.filter(
    entry => isHeadUnknown(entry.xy) && matchers.some(match => match.test(entry.path)),
  )
  if (atRisk.length === 0) return
  const lines = ['refusing to run: untracked file(s) under unsafe tree(s):']
  for (const entry of atRisk) {
    lines.push(`  ${entry.path}`)
    lines.push(`  remedy: git stash push -u -- ${quotePath(entry.path)}`)
  }
  fail(lines.join('\n'), 2)
}

function runWriterCommand(dir: string, command: string): void {
  const ran = spawnSync(command, { cwd: dir, shell: true, encoding: 'utf-8' })
  if (ran.error) fail(`could not run the command: ${String(ran.error)}`, 1)
  if (ran.status !== 0) {
    const detail = (ran.stderr || ran.stdout || '').trim()
    fail(
      `the command exited ${ran.status} — nothing was committed${detail ? `: ${detail}` : ''}`,
      1,
    )
  }
}

/** The staged set is what this run actually wrote — never a path glob. */
function computeStagedSet(
  before: PorcelainEntry[],
  after: PorcelainEntry[],
  beforeDigests: Map<string, string>,
  afterDigests: Map<string, string>,
): Set<string> {
  const staged = new Set<string>()
  const beforeByPath = new Map(before.map(entry => [entry.path, entry.xy]))
  const afterByPath = new Map(after.map(entry => [entry.path, entry.xy]))
  for (const entry of after) {
    if (beforeByPath.get(entry.path) !== entry.xy) staged.add(entry.path)
  }
  for (const entry of before) {
    if (!afterByPath.has(entry.path)) staged.add(entry.path)
  }
  for (const [path, sha] of beforeDigests) {
    const now = afterDigests.get(path)
    if (now !== undefined && now !== sha) staged.add(path)
  }
  return staged
}

/** Recover rows are driven by the digest comparison alone, whether or not a commit follows. */
function buildRecoverRows(
  before: PorcelainEntry[],
  beforeDigests: Map<string, string>,
  afterDigests: Map<string, string>,
  removed: string[],
): string[] {
  const rows: string[] = []
  for (const path of [...beforeDigests.keys()].sort()) {
    const sha = beforeDigests.get(path) as string
    if (afterDigests.get(path) !== undefined) {
      if (afterDigests.get(path) !== sha) {
        rows.push(
          `overwrote uncommitted changes in: ${path} (recover: git cat-file -p ${sha} > ${path})`,
        )
      }
      continue
    }
    const entry = before.find(e => e.path === path)
    if (entry && isHeadUnknown(entry.xy)) {
      removed.push(path)
      rows.push(`removed untracked: ${path} (recover: git cat-file -p ${sha} > ${path})`)
    }
  }
  return rows
}

function commitStagedSet(dir: string, message: string, stageable: string[], rows: string[]): void {
  const added = sh(dir, ['add', '--', ...stageable])
  if (!added.ok) fail(`could not stage the regenerated paths: ${added.err.trim()}`, 1)
  const cached = sh(dir, ['diff', '--cached', '--quiet', '--', ...stageable])
  if (cached.ok) {
    const suffix = rows.length > 0 ? `; ${rows.join('; ')}` : ''
    process.stdout.write(`no commit — every regenerated path already equals HEAD${suffix}\n`)
    return
  }
  // By pathspec, not from the index: content the contributor had already staged
  // before the run is never part of this commit.
  const committed = sh(dir, ['commit', '-m', message, '--', ...stageable])
  if (!committed.ok) fail(`could not commit the regenerated paths: ${committed.err.trim()}`, 1)
  const short = sh(dir, ['rev-parse', '--short', 'HEAD'])
  const listed = sh(dir, ['show', '--name-only', '--format=', '-z', 'HEAD'])
  const files = listed.out.split('\0').filter(Boolean)
  const suffix = rows.length > 0 ? `; ${rows.join('; ')}` : ''
  process.stdout.write(
    `regenerated — commit ${short.out.trim()}, ${files.length} file(s)${suffix}\n`,
  )
}

export function main(): void {
  const { command, message, unsafe } = parseArgs(process.argv.slice(2))
  const dir = process.cwd()
  const before = snapshotEntries(dir)
  const beforeDigests = digestPaths(
    dir,
    before.map(entry => entry.path),
    true,
  )
  haltIfUnsafe(before, unsafe)
  runWriterCommand(dir, command)
  const after = snapshotEntries(dir)
  const afterDigests = digestPaths(
    dir,
    [...beforeDigests.keys()].filter(path => existsSync(`${dir}/${path}`)),
    false,
  )
  const staged = computeStagedSet(before, after, beforeDigests, afterDigests)
  const removed: string[] = []
  const rows = buildRecoverRows(before, beforeDigests, afterDigests, removed)
  // What the run removed is not stageable — neither `git add` nor the pathspec may
  // name it. An empty stageable set stays silent: an empty pathspec would commit the
  // whole index, sweeping in content staged before the run.
  const stageable = [...staged].filter(path => !removed.includes(path)).sort()
  if (stageable.length === 0) {
    process.stdout.write('no-op\n')
    return
  }
  commitStagedSet(dir, message, stageable, rows)
}

if (require.main === module) main()
