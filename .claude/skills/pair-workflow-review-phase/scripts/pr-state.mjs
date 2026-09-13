#!/usr/bin/env node
// The deterministic half of the review's Phase 5, run by the FINAL reviewer of the delivery workflow
// (US-479, T-9 fourth round t9d-24): conclude the required `pair-review` check on the exact head it
// verified and synthesize the ONE `pr-state:*` label. Nothing here is judgment — the verdict is the
// reviewer's; this maps it onto the code host exactly as the KB's `pr-state.sh` does
// (`review_check_conclusion`: approved ⇒ success, changes-requested ⇒ failure, anything else ⇒ pending
// and NOTHING is published, so the merge stays blocked) and swaps the label view
// (pr-states.md: exactly one of to-be-reviewed | ready-to-merge | not-approved). Merge stays outside.
//
//   node <skill dir>/scripts/pr-state.mjs conclude --pr <n> --sha <40hex> --verdict approved|changes-requested [--repo owner/name] [--description <text>] [--target-url <url>]
//     → { action: concluded | unchanged, check: { context, sha, state, published, error }, label: { applied, removed, confirmed, error }, advisory }
//     exit 0 when the check landed or the label is confirmed (a refused half is REPORTED, never faked:
//     a token without `repo:status` degrades to advisory, exactly as github-implementation.md says);
//     exit 1 when neither landed; exit 2 on a usage error (a verdict that is not a decision publishes nothing).
//
//   node <skill dir>/scripts/pr-state.mjs find --pr <n> --sha <40hex> [--repo owner/name]
//     Read-only: { check: <pair-review state on that sha or null>, label: <pr-state:* label or null> }.
//
// `gh` is the only transport; it is resolved from PATH so a test can stand a recorder in its place.
import { realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const CHECK_CONTEXT = 'pair-review'
export const STATE_LABELS = ['pr-state:to-be-reviewed', 'pr-state:ready-to-merge', 'pr-state:not-approved']
const SHA_RE = /^[0-9a-f]{40}$/

// pr-state.sh `review_check_conclusion`, verbatim in semantics.
export const conclusionOf = verdict => (verdict === 'approved' ? 'success' : verdict === 'changes-requested' ? 'failure' : 'pending')
// pr-states.md: the label is a VIEW of the state the verdict yields; the gate and the explicit approval
// are the code host's required checks, not this script's to judge.
export const stateLabelOf = verdict => (verdict === 'approved' ? 'pr-state:ready-to-merge' : verdict === 'changes-requested' ? 'pr-state:not-approved' : null)

export function gh(args, { input } = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input })
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`)
  return r.stdout
}
const apiRepo = repo => (repo ? `repos/${repo}` : 'repos/{owner}/{repo}')

export function readCheck({ sha, repo }) {
  const combined = JSON.parse(gh(['api', `${apiRepo(repo)}/commits/${sha}/status`]))
  const own = (combined.statuses ?? []).filter(s => s.context === CHECK_CONTEXT)
  return own.length ? String(own[own.length - 1].state) : null
}
export function readLabels({ pr, repo }) {
  return JSON.parse(gh(['api', `${apiRepo(repo)}/issues/${pr}/labels`])).map(l => String(l.name))
}

export function publishCheck({ sha, repo, state, description, targetUrl }) {
  const args = ['api', '-X', 'POST', `${apiRepo(repo)}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${CHECK_CONTEXT}`]
  if (description) args.push('-f', `description=${String(description).slice(0, 140)}`)
  if (targetUrl) args.push('-f', `target_url=${targetUrl}`)
  try {
    gh(args)
    return { context: CHECK_CONTEXT, sha, state, published: true, error: null }
  } catch (e) {
    return { context: CHECK_CONTEXT, sha, state, published: false, error: e.message }
  }
}

export function applyStateLabel({ pr, repo, label }) {
  try {
    const before = readLabels({ pr, repo })
    const removed = before.filter(l => STATE_LABELS.includes(l) && l !== label)
    for (const l of removed) gh(['api', '-X', 'DELETE', `${apiRepo(repo)}/issues/${pr}/labels/${encodeURIComponent(l)}`])
    if (!before.includes(label)) gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${pr}/labels`, '--input', '-'], { input: JSON.stringify({ labels: [label] }) })
    // read back: a label API that silently no-ops must not render a state the PR does not carry
    const after = readLabels({ pr, repo })
    const confirmed = after.includes(label) && !after.some(l => STATE_LABELS.includes(l) && l !== label)
    return { applied: label, removed, confirmed, error: confirmed ? null : `read-back: labels are ${JSON.stringify(after)}` }
  } catch (e) {
    return { applied: label, removed: [], confirmed: false, error: e.message }
  }
}

export function conclude({ pr, sha, verdict, repo, description, targetUrl }) {
  const state = conclusionOf(verdict)
  const label = stateLabelOf(verdict)
  if (state === 'pending' || !label) throw new Error(`verdict ${JSON.stringify(verdict)} is not a decision — nothing is published, the pending check keeps the merge blocked`)
  // idempotent: the head already carries this conclusion and the PR this exact label
  let already = false
  try {
    already = readCheck({ sha, repo }) === state && (() => { const ls = readLabels({ pr, repo }); return ls.includes(label) && !ls.some(l => STATE_LABELS.includes(l) && l !== label) })()
  } catch {}
  if (already) return { action: 'unchanged', check: { context: CHECK_CONTEXT, sha, state, published: true, error: null }, label: { applied: label, removed: [], confirmed: true, error: null }, advisory: false }
  const check = publishCheck({ sha, repo, state, description, targetUrl })
  const labelOut = applyStateLabel({ pr, repo, label })
  return { action: 'concluded', check, label: labelOut, advisory: !check.published }
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
// Entry-point guard by REAL path (see pr-comment.mjs): compare realpaths, never strings.
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
    const FLAGS = { conclude: ['pr', 'sha', 'verdict', 'repo', 'description', 'target-url'], find: ['pr', 'sha', 'repo'] }
    if (FLAGS[cmd]) {
      const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
      if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
    }
    for (const k of ['pr', 'sha']) if (!opts[k]) throw new Error(`--${k} is required`)
    if (!/^\d+$/.test(String(opts.pr))) throw new Error(`--pr must be a number, got ${JSON.stringify(opts.pr)}`)
    if (!SHA_RE.test(String(opts.sha))) throw new Error(`--sha must be a lower-case 40-hex commit, got ${JSON.stringify(opts.sha)}`)
    if (opts.repo !== undefined && !/^[^/\s]+\/[^/\s]+$/.test(opts.repo)) throw new Error(`--repo must be owner/name, got ${JSON.stringify(opts.repo)}`)
    if (cmd === 'conclude') {
      if (!opts.verdict) throw new Error('--verdict approved|changes-requested is required')
      const out = conclude({ pr: opts.pr, sha: opts.sha, verdict: opts.verdict, repo: opts.repo, description: opts.description, targetUrl: opts['target-url'] })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.check.published || out.label.confirmed ? 0 : 1)
    } else if (cmd === 'find') {
      let check = null
      let label = null
      try {
        check = readCheck({ sha: opts.sha, repo: opts.repo })
      } catch {}
      try {
        label = readLabels({ pr: opts.pr, repo: opts.repo }).find(l => STATE_LABELS.includes(l)) ?? null
      } catch {}
      process.stdout.write(JSON.stringify({ check, label }) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected conclude | find)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
