#!/usr/bin/env node
// The deterministic half of the review's Phase 5, run by the FINAL reviewer of the delivery workflow
// (US-479, T-9 fourth round t9d-24): conclude the required `pair-review` check on the exact head it
// verified and synthesize the ONE `pr-state:*` label. Nothing here is judgment — the verdict is the
// reviewer's; this maps it onto the code host exactly as the KB's `pr-state.sh` does
// (`review_check_conclusion`: approved ⇒ success, changes-requested ⇒ failure, anything else ⇒ pending
// and NOTHING is published, so the merge stays blocked) and swaps the label view
// (pr-states.md: exactly one of to-be-reviewed | ready-to-merge | not-approved). Merge stays outside.
//
//   node <skill dir>/scripts/pr-state.mjs conclude --pr <n> --sha <40hex> --verdict approved|changes-requested [--repo owner/name] [--description <text>] [--target-url <url>] [--dir <run/story dir>]
//     → { action: concluded | unchanged, check: { context, sha, state, published, error }, label: { applied, removed, confirmed, error }, advisory }
//     exit 0 when the check landed or the label is confirmed (a refused half is REPORTED, never faked:
//     a token without `repo:status` degrades to advisory, exactly as github-implementation.md says);
//     exit 1 when neither landed; exit 2 on a usage error (a verdict that is not a decision publishes nothing).
//
//   node <skill dir>/scripts/pr-state.mjs find --pr <n> --sha <40hex> [--repo owner/name] [--dir <run/story dir>]
//     Read-only: { check: <pair-review state on that sha or null>, label: <pr-state:* label or null> }.
//
// The host is the bound code-host adapter (US-492, scripts/host/): `--dir <run/story dir>` reuses the
// coordinator's binding there; without it, way-of-working is resolved once for this process. The
// check context and the state-label set are the ADAPTER's (GitHub: `pair-review`, `pr-state:*`).
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bindHosts } from './host/index.mjs'

const SHA_RE = /^[0-9a-f]{40}$/

// pr-state.sh `review_check_conclusion`, verbatim in semantics.
export const conclusionOf = verdict => (verdict === 'approved' ? 'success' : verdict === 'changes-requested' ? 'failure' : 'pending')
// pr-states.md: the label is a VIEW of the state the verdict yields; the gate and the explicit approval
// are the code host's required checks, not this script's to judge.
export const stateLabelOf = verdict => (verdict === 'approved' ? 'pr-state:ready-to-merge' : verdict === 'changes-requested' ? 'pr-state:not-approved' : null)

const codeHost = dir => bindHosts({ dir }).code

export function readCheck({ pr, sha, repo, dir }) {
  return codeHost(dir).readCheck({ pr, sha, repo })
}
export function readLabels({ pr, repo, dir }) {
  return codeHost(dir).readLabels({ pr, repo })
}
export function publishCheck({ pr, sha, repo, state, description, targetUrl, dir }) {
  return codeHost(dir).concludeCheck({ pr, sha, repo, state, description, targetUrl })
}
export function applyStateLabel({ pr, repo, label, dir }) {
  return codeHost(dir).setPrState({ pr, repo, label })
}

export function conclude({ pr, sha, verdict, repo, description, targetUrl, dir }) {
  const state = conclusionOf(verdict)
  const label = stateLabelOf(verdict)
  if (state === 'pending' || !label) throw new Error(`verdict ${JSON.stringify(verdict)} is not a decision — nothing is published, the pending check keeps the merge blocked`)
  const host = codeHost(dir)
  const STATE_LABELS = host.stateLabels
  // idempotent: the head already carries this conclusion and the PR this exact label
  let already = false
  try {
    already = host.readCheck({ pr, sha, repo }) === state && (() => { const ls = host.readLabels({ pr, repo }); return ls.includes(label) && !ls.some(l => STATE_LABELS.includes(l) && l !== label) })()
  } catch {}
  if (already) return { action: 'unchanged', check: { context: host.checkContext, sha, state, published: true, error: null }, label: { applied: label, removed: [], confirmed: true, error: null }, advisory: false }
  const check = host.concludeCheck({ pr, sha, repo, state, description, targetUrl })
  const labelOut = host.setPrState({ pr, repo, label })
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
    const FLAGS = { conclude: ['pr', 'sha', 'verdict', 'repo', 'description', 'target-url', 'dir'], find: ['pr', 'sha', 'repo', 'dir'] }
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
      const out = conclude({ pr: opts.pr, sha: opts.sha, verdict: opts.verdict, repo: opts.repo, description: opts.description, targetUrl: opts['target-url'], dir: opts.dir })
      process.stdout.write(JSON.stringify(out) + '\n')
      process.exit(out.check.published || out.label.confirmed ? 0 : 1)
    } else if (cmd === 'find') {
      let check = null
      let label = null
      const host = codeHost(opts.dir)
      try {
        check = host.readCheck({ pr: opts.pr, sha: opts.sha, repo: opts.repo })
      } catch {}
      try {
        label = host.readLabels({ pr: opts.pr, repo: opts.repo }).find(l => host.stateLabels.includes(l)) ?? null
      } catch {}
      process.stdout.write(JSON.stringify({ check, label }) + '\n')
      process.exit(0)
    } else throw new Error(`unknown command: ${cmd} (expected conclude | find)`)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
