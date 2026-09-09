#!/usr/bin/env node
// Idempotent PR comment publication, keyed by a hidden HTML marker (US-479 T-15). Ships inside the
// skills that publish: `review-phase` (first review, synthesis, escalation) and `green-fix`
// (escalation). Never run by the Workflow sandbox (no filesystem, no gh) and never re-derived by an
// agent: the read-back BEFORE the write is what makes a lost response safe to retry.
//
//   node <skill dir>/scripts/pr-comment.mjs upsert --pr <n> --marker '<!-- pair:… -->' --body-file <md> [--repo owner/name]
//     Reads the PR's issue comments back (gh api, paginated), finds the ONE whose body contains the
//     marker verbatim, and EDITS it in place; posts a new comment only when no comment carries the
//     marker. The marker is forced to be line 1 of the body. Prints
//     { action: created | updated | unchanged, id, url, marker }. Two comments carrying the same
//     marker are an ambiguity, never a third comment: { error: 'marker-ambiguous', ids }.
//
//   node <skill dir>/scripts/pr-comment.mjs find --pr <n> --marker '<!-- pair:… -->' [--repo owner/name]
//     Read-only: { found, id?, url?, count }.
//
// `gh` is the only transport; it is resolved from PATH so a test can stand a recorder in its place.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function gh(args, { input } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input })
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`)
  return r.stdout
}

const apiRepo = repo => (repo ? `repos/${repo}` : 'repos/{owner}/{repo}')

export function listComments({ pr, repo }) {
  const out = gh(['api', '--paginate', `${apiRepo(repo)}/issues/${pr}/comments`])
  // --paginate concatenates pages as consecutive JSON arrays; split them safely.
  const pages = []
  let depth = 0
  let start = -1
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (c === '[' && depth === 0) start = i
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0 && start >= 0) {
        pages.push(JSON.parse(out.slice(start, i + 1)))
        start = -1
      }
    }
  }
  return pages.flat().map(c => ({ id: c.id, body: String(c.body ?? ''), url: c.html_url }))
}

export function findByMarker(comments, marker) {
  const hits = comments.filter(c => c.body.includes(marker))
  return { found: hits.length > 0, count: hits.length, hits }
}

export function withMarker(body, marker) {
  const lines = String(body ?? '').replace(/^﻿/, '').split('\n')
  if (lines[0].trim() === marker) return lines.join('\n')
  return `${marker}\n${lines.join('\n')}`
}

export function upsert({ pr, marker, body, repo }) {
  const comments = listComments({ pr, repo })
  const { hits } = findByMarker(comments, marker)
  if (hits.length > 1) return { error: 'marker-ambiguous', ids: hits.map(h => h.id), marker }
  const full = withMarker(body, marker)
  if (hits.length === 1) {
    if (hits[0].body === full) return { action: 'unchanged', id: hits[0].id, url: hits[0].url, marker }
    const res = JSON.parse(gh(['api', '-X', 'PATCH', `${apiRepo(repo)}/issues/comments/${hits[0].id}`, '-f', `body=${full}`]))
    return { action: 'updated', id: res.id, url: res.html_url, marker }
  }
  const res = JSON.parse(gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${pr}/comments`, '-f', `body=${full}`]))
  return { action: 'created', id: res.id, url: res.html_url, marker }
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
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { cmd, opts } = parseCli(process.argv.slice(2))
    for (const k of ['pr', 'marker']) if (!opts[k]) throw new Error(`--${k} is required`)
    if (!/^<!--\s*pair:[a-z-]+ #\S+ PR#\d+\s*-->$/.test(opts.marker)) throw new Error(`marker must look like <!-- pair:<kind> #<story> PR#<n> -->, got ${JSON.stringify(opts.marker)}`)
    let out
    if (cmd === 'upsert') {
      if (!opts['body-file']) throw new Error('--body-file <md> is required')
      out = upsert({ pr: opts.pr, marker: opts.marker, body: readFileSync(opts['body-file'], 'utf8'), repo: opts.repo })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.error ? 1 : 0)
    } else if (cmd === 'find') {
      const { found, count, hits } = findByMarker(listComments({ pr: opts.pr, repo: opts.repo }), opts.marker)
      out = { found, count, ...(hits[0] ? { id: hits[0].id, url: hits[0].url } : {}) }
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected upsert | find)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
