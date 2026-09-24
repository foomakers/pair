#!/usr/bin/env node
// Idempotent PR comment publication, keyed by a hidden HTML marker (US-479 T-15). Ships inside the
// skills that publish: `review-phase` (first review, synthesis, escalation) and `green-fix`
// (escalation). Never run by the Workflow sandbox (no filesystem, no gh) and never re-derived by an
// agent: the read-back BEFORE the write is what makes a lost response safe to retry.
//
//   node <skill dir>/scripts/pr-comment.mjs upsert --pr <n> --marker '<!-- pair:… -->' --body-file <md> [--repo owner/name] [--dir <run/story dir>]
//     A marker is `<!-- pair:<kind> #<story> PR#<n> -->` or, run-scoped, `<!-- pair:<kind> #<story> PR#<n> run:<runId> -->`
//     (canary v9: the first review, the synthesis and an escalation belong to ONE cycle — a later cycle
//     on the same PR posts its own, never edits the previous cycle's in place; the scope-decision
//     packet stays PR-scoped because its `sc-` ids and the maintainer's answer outlive cycles).
//     Reads the PR's comments back through the bound code host (paginated), finds the ONE whose body contains the
//     marker verbatim, and EDITS it in place; posts a new comment only when no comment carries the
//     marker. The marker is forced to be line 1 of the body. Prints
//     { action: created | updated | unchanged, id, url, marker }. Two comments carrying the same
//     marker are an ambiguity, never a third comment: { error: 'marker-ambiguous', ids }.
//
//   node <skill dir>/scripts/pr-comment.mjs find --pr <n> --marker '<!-- pair:… -->' [--repo owner/name] [--dir <run/story dir>]
//     Read-only: { found, id?, url?, count }.
//
// Matching is AUTHOR-BLIND (q-7): any commenter can put the marker in a body, so a foreign carrier
// is edited in place and two carriers refuse (`marker-ambiguous`). Accepted, with the identity
// evidence and the exit path, in ADL 2026-09-13-pr-comment-marker-matching-stays-author-blind.md;
// pinned by the `q-7 (ADL 2026-09-13)` test — do not "fix" it here without taking that exit path.
// The host is the bound code-host adapter (US-492, scripts/host/): `--dir <run/story dir>` reuses the
// coordinator's binding there; without it, way-of-working is resolved once for this process. The
// adapter owns the transport (GitHub: `gh` from PATH, a test's recorder in its place).
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bindHosts } from './host/index.mjs'
import { findByMarker, withMarker, splitPages } from './host/adapter-kit.mjs'

export { findByMarker, withMarker, splitPages }

const codeHost = dir => bindHosts({ dir }).code

export function listComments({ pr, repo, dir }) {
  return codeHost(dir).listComments({ pr, repo })
}

export function upsert({ pr, marker, body, repo, dir }) {
  return codeHost(dir).upsertComment({ pr, marker, body, repo })
}

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
    const FLAGS = { upsert: ['pr', 'marker', 'body-file', 'repo', 'dir'], find: ['pr', 'marker', 'repo', 'dir'] }
    if (FLAGS[cmd]) {
      const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
      if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
    }
    for (const k of ['pr', 'marker']) if (!opts[k]) throw new Error(`--${k} is required`)
    if (!/^<!--\s*pair:[a-z-]+ #\S+ PR#\d+(?: run:[A-Za-z0-9][A-Za-z0-9._-]*)?\s*-->$/.test(opts.marker)) throw new Error(`marker must look like <!-- pair:<kind> #<story> PR#<n> [run:<runId>] -->, got ${JSON.stringify(opts.marker)}`)
    let out
    if (cmd === 'upsert') {
      if (!opts['body-file']) throw new Error('--body-file <md> is required')
      out = upsert({ pr: opts.pr, marker: opts.marker, body: readFileSync(opts['body-file'], 'utf8'), repo: opts.repo, dir: opts.dir })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.error ? 1 : 0)
    } else if (cmd === 'find') {
      const { found, count, hits } = findByMarker(listComments({ pr: opts.pr, repo: opts.repo, dir: opts.dir }), opts.marker)
      out = { found, count, ...(hits[0] ? { id: hits[0].id, url: hits[0].url } : {}) }
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected upsert | find)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
