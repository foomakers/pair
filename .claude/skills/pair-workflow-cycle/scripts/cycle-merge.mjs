#!/usr/bin/env node
// cycle-merge.mjs — the `merge` stage of the delivery cycle (US-490). A SCRIPT, never an agent: the
// rule that lets an unattended cycle merge lives here, once, and every coordinator (the in-session
// cycle skill, `pair-cli run --card`, `pair-loop.js`'s Advance phase) reaches it through the same two
// commands. It is a behavior-preserving extraction of the block `pair-loop.js` used to hold — no
// condition added, none relaxed:
//
//   1. the card's `risk:*` tier, re-read NOW, is the tier the cycle was driven under (a mid-run raise
//      parks the card even with an approved PR) …
//   2. … and it is still named in `## Auto-Advance` (US-521: or, with `--mergeGate`, the merge gate of
//      `## Autonomy` allows it — `autonomy-policy.mjs decide` — and the legacy tier list is that gate
//      `merge: when; lacks: <tier>` read in its compatible form, so `pair-loop`'s call is unchanged);
//   3. the PR's remote head, `pair-review` and `pair-explicit-approval` conclusions are re-read NOW,
//      and any of them unreadable parks the card;
//   4. the remote head is the head the verifier reviewed (`reviewedHead`);
//   5. both conclusions are `success` — except that below 🔴 an ABSENT `pair-explicit-approval` is satisfied (D4: the tier does
//      not require it, so a repo with no job publishing it is not parked), and the tier that decides this and the merge gate
//      is the PR's CURRENT `risk:*` (D5: the review writes it; an untagged PR is `risk:red`), never the card's stale one;
//   5b. the PR's CI checks on that head (AL) — any check but pair's own that is not `success` refuses with `ci-not-green`
//       (failed ⇒ halted, only pending ⇒ awaiting-human);
//   6. the tier's gate set is green — `--gate green`, produced by the caller running
//      `/pair-capability-verify-quality` (a skill, so an agent's job; the script only refuses to
//      merge on any other value, an absent one included).
//
// CLI (both print one JSON object and exit 0 when a decision was produced, 2 on a usage error):
//   check --dir <run dir> --story <n> --pr <n> --reviewedHead <sha> --cardTier <risk:*>
//         (--autoAdvance '<JSON array of tiers>' | --mergeGate '<JSON {mode,has,lacks}>') [--repo <owner/name>]
//       Conditions 1-5 only (no gate yet). A failure PARKS: one marker-keyed comment on the card.
//   run   <the same flags> --gate <green|red> --message <squash commit message>
//         [--branch <b>] [--root <main checkout>]
//       Conditions 1-6, then merge + Story Closure (DoD boxes, close, board `Done`, parent cascade,
//       branch remote+local with its worktree first, story checkpoint) — or park + comment.
//   escalate --dir <run dir> --story <n> --stage <step> --conditions '<JSON array>' [--repo <owner/name>]
//       US-521: the ONE idempotent escalation comment on the card (marker-keyed), for any stage boundary.
//
// `merged` and `cascaded` are separate signals: a merge that landed with any closure step unfinished
// is `{ merged: true, cascaded: false }` with every step's outcome in `cascade`, never a plain success.
import { existsSync, rmSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { decide as decideAutonomy, effectiveLabels, gateFromLegacyTiers, escalationComment, ESCALATION_MARKER, parseGate, conditionError } from './autonomy-policy.mjs'
import { assertBranchName } from './host/adapter-kit.mjs'
import { assertRunOwnsStory } from './run-guard.mjs'

const SHA_RE = /^[0-9a-f]{40}$/
const TIER_RE = /^[A-Za-z0-9][A-Za-z0-9:_./-]*$/
const LABEL_SHAPE_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i
const SAFE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
export const PR_CHECK = 'pair-review'
export const APPROVAL_CHECK = 'pair-explicit-approval'
const BELOW_RED = ['risk:green', 'risk:yellow']
export const PARK_MARKER = pr => `<!-- pair-merge-park:PR#${pr} -->`

// ── the decision — pure ────────────────────────────────────────────────────────────────────
// Order = the precedence `pair-loop.js` applied (first failure is the `reason`); every failing
// condition is listed, because each is independent evidence a human will want.
// US-521: `mergeGate` (`{ mode, has, lacks }`) replaces ONLY the tier-membership check; every signal below stays mandatory.
export function decideMerge({ cardTier, currentTier, effectiveTier = currentTier, autoAdvanceTiers, mergeGate, labels, reviewedHead, signals, gate, requireGate }) {
  const failed = []
  const add = (code, detail) => failed.push({ code, detail })
  if (currentTier !== cardTier) add('tier-changed', `tier changed ${cardTier} -> ${currentTier} mid-run, never auto-advanced on a stale read`)
  let conditions = null
  if (mergeGate) {
    const d = decideAutonomy({ boundary: { kind: 'merge' }, labels, policy: { until: 'merged', merge: mergeGate } })
    if (d.decision === 'escalate') {
      conditions = d.conditions
      add('escalated', `merge gate escalates: ${d.conditions.join(', ')} — a human decides`)
    } else if (d.decision === 'await-human') add('tier-not-auto-advance', 'merge: always — the merge gate parks the card for a human')
  } else if (!Array.isArray(autoAdvanceTiers) || !autoAdvanceTiers.includes(effectiveTier)) add('tier-not-auto-advance', `tier ${effectiveTier} not in Auto-Advance`)
  const readable = signals && SHA_RE.test(String(signals.headSha ?? '')) && typeof signals.pairReview === 'string' && typeof signals.explicitApproval === 'string'
  if (!readable) add('signals-unreadable', 'PR SIGNALS unreadable at merge time, never merged on unread evidence')
  else {
    if (signals.headSha !== reviewedHead) add('head-moved', `PR head moved since the review (reviewed ${reviewedHead}, remote ${signals.headSha}), never merged unreviewed code`)
    if (signals.pairReview !== 'success') add('pair-review', `pair-review conclusion on head ${signals.headSha} is ${signals.pairReview}, never merged without a published approval`)
    // D4: below 🔴 the check auto-passes (the tier does not require explicit approval), so a repo that publishes no such job
    // reads `missing` and that is satisfied; at 🔴 (or any tier not named below it) missing/pending awaits a human, failure halts.
    const approvalRequired = !BELOW_RED.includes(effectiveTier)
    if (signals.explicitApproval !== 'success' && (approvalRequired || signals.explicitApproval !== 'missing')) add('explicit-approval', `pair-explicit-approval conclusion on head ${signals.headSha} is ${signals.explicitApproval} (D10: no recorded human approval), never merged`)
  }
  // AL: the PR's own CI checks on the pinned head — pair's two contexts are judged above, everything else must be green.
  if (readable && Array.isArray(signals.ci)) {
    const own = new Set([PR_CHECK, APPROVAL_CHECK])
    const notGreen = signals.ci.filter(c => !own.has(c?.name) && c?.conclusion !== 'success')
    if (notGreen.length) add('ci-not-green', `CI checks not green on head ${signals.headSha}: ${notGreen.map(c => `${c.name}=${c.conclusion}`).join(', ')} — never merged over a failing or pending build`)
  }
  if (requireGate) {
    if (gate === 'red') add('gate-red', "the tier's gate set came back red at merge time")
    else if (gate !== 'green') add('gate-unverified', `no green gate evidence (got ${JSON.stringify(gate ?? null)}) — /pair-capability-verify-quality must run first`)
  }
  const first = failed[0]?.code
  // A human approval not yet recorded (missing / pending) as the ONLY failure is a park that awaits a person, not a problem; a rejected one (`failure`) or any other failing condition beside it stays `halted`.
  // A wait is not a problem: an approval not yet recorded (missing / pending) and CI checks still running (pending only) are
  // things a person or a build will supply. A park awaits a human when EVERY failed condition is such a wait; any real failure
  // beside them (a failed check, a rejected approval, a moved head…) keeps it `halted`.
  const ciPendingOnly = (signals?.ci ?? []).filter(c => c?.name !== PR_CHECK && c?.name !== APPROVAL_CHECK && c?.conclusion !== 'success').every(c => c.conclusion === 'pending')
  const isWait = f => (f.code === 'explicit-approval' && ['missing', 'pending'].includes(signals?.explicitApproval)) || (f.code === 'ci-not-green' && ciPendingOnly)
  const awaitsOnly = failed.length > 0 && failed.every(isWait)
  return { mergeAllowed: failed.length === 0, failed, reason: failed[0]?.detail ?? null, parkKind: failed.length === 0 ? null : first === 'tier-not-auto-advance' ? 'awaiting-human' : awaitsOnly ? 'awaiting-human' : first === 'escalated' ? 'escalated' : 'halted', ...(conditions ? { conditions } : {}) }
}

// ── live reads — through the bound adapters, never a host CLI of our own ─────────────────────
export function readCurrentTier({ pm, story, repo }) {
  try {
    const labels = (pm.readCard(story, { repo, fields: ['labels'] })?.labels ?? []).map(l => String(l?.name ?? l))
    const risk = [...new Set(labels.filter(l => l.startsWith('risk:')))]
    // Untagged, or ambiguously tagged, is red: the fail-safe every tier read in this cycle uses.
    return risk.length === 1 && LABEL_SHAPE_RE.test(risk[0]) ? risk[0] : 'risk:red'
  } catch {
    return 'risk:red'
  }
}

// Every label on the card, read NOW — `null` when unreadable (a `when` gate then escalates, fail-safe).
export function readCurrentLabels({ pm, story, repo }) {
  try {
    return (pm.readCard(story, { repo, fields: ['labels'] })?.labels ?? []).map(l => String(l?.name ?? l))
  } catch {
    return null
  }
}

// D5: the labels the merge gate is decided on — the card's, with its `risk:*` replaced by the PR's CURRENT tier (an untagged
// PR is `risk:red` at merge). `null` when either side is unreadable (a `when` gate then escalates, fail-safe).
export function readEffectiveLabels({ pm, code, story, pr, repo }) {
  const card = readCurrentLabels({ pm, story, repo })
  if (card === null) return null
  try {
    return effectiveLabels({ labels: card, prLabels: code.readLabels({ pr, repo }), atMerge: true }) ?? null
  } catch {
    return null
  }
}

// The PR's current tier out of the effective labels: exactly one `risk:*` or red.
export const tierOfLabels = labels => {
  const risk = (labels ?? []).filter(l => l.startsWith('risk:'))
  return risk.length === 1 ? risk[0] : 'risk:red'
}

export function readSignals({ code, pr, repo }) {
  try {
    const headSha = code.prHead({ pr, repo })
    const conclusion = context => {
      const status = code.readCheck({ sha: headSha, repo, context })
      if (status) return status
      let run = null
      try {
        run = code.readCheckRun({ sha: headSha, repo, context })
      } catch (e) {
        if (e?.kind !== 'not-implemented') throw e
      }
      return run ?? 'missing'
    }
    // AL: the CI checks on the SAME pinned head, through the adapter; an adapter without the method leaves `ci` absent (no
    // evidence either way) — a read that fails makes the whole signal set unreadable (never merged on unread evidence).
    const ci = typeof code.readCiChecks === 'function' ? code.readCiChecks({ sha: headSha, pr, repo }) : undefined
    return { headSha, pairReview: conclusion(PR_CHECK), explicitApproval: conclusion(APPROVAL_CHECK), ...(Array.isArray(ci) ? { ci } : {}) }
  } catch {
    return null
  }
}

function evaluate({ hosts, story, pr, repo, reviewedHead, cardTier, autoAdvanceTiers, mergeGate, gate, requireGate }) {
  const currentTier = readCurrentTier({ pm: hosts.pm, story, repo })
  // D4/D5: the tier the approval rule and the gate read is the PR's CURRENT one (the review's classification), live.
  const effective = readEffectiveLabels({ pm: hosts.pm, code: hosts.code, story, pr, repo })
  const effectiveTier = effective === null ? 'risk:red' : tierOfLabels(effective)
  const labels = mergeGate ? effective : undefined
  const signals = readSignals({ code: hosts.code, pr, repo })
  return { currentTier, effectiveTier, signals, ...decideMerge({ cardTier, currentTier, effectiveTier, autoAdvanceTiers, mergeGate, ...(mergeGate ? { labels: labels ?? undefined } : {}), reviewedHead, signals, gate, requireGate }) }
}

// ── park ───────────────────────────────────────────────────────────────────────────────────
// Never a HALT and never audit-only: the awaited action is recorded ON THE CARD, once per PR
// (marker-keyed, edited in place on a re-run).
export function park({ hosts, story, pr, repo, decision, merged = false }) {
  const lines = decision.failed.map(f => `- \`${f.code}\` — ${f.detail}`)
  const body = [
    merged ? `PR #${pr} MERGED, but the story is not fully closed — a human finishes it:` : `PR #${pr} is review-approved but was **not** merged automatically — it awaits human action:`,
    '',
    ...lines,
  ].join('\n')
  try {
    const r = hosts.pm.commentOnCard({ id: story, marker: PARK_MARKER(pr), body, repo })
    return { posted: !r?.error, ...(r?.error ? { error: r.error } : {}) }
  } catch (e) {
    return { posted: false, error: e.message }
  }
}

// ── escalation ─────────────────────────────────────────────────────────────────────────────
// US-521: one marker-keyed comment per card (edited in place on a re-run — no duplicate) naming the
// condition(s) and the stage. A failed post never changes the escalation: the caller still exits 1.
export function escalate({ hosts, story, repo, stage, conditions }) {
  try {
    const r = hosts.pm.commentOnCard({ id: story, marker: ESCALATION_MARKER(story), body: escalationComment({ story, stage, conditions }), repo })
    return { posted: !r?.error, ...(r?.error ? { error: r.error } : {}) }
  } catch (e) {
    return { posted: false, error: e.message }
  }
}

// ── Story Closure ──────────────────────────────────────────────────────────────────────────
// Check every unchecked box under the card's `## Definition of Done…` heading. Anything else in the
// body is returned byte-identical.
export function checkDodBoxes(body) {
  let inDod = false
  return String(body ?? '')
    .split('\n')
    .map(line => {
      if (/^##\s+/.test(line)) inDod = /^##\s+Definition of Done/i.test(line)
      return inDod ? line.replace(/^(\s*[-*]\s+)\[ \]/, '$1[x]') : line
    })
    .join('\n')
}

const defaultGit = (args, cwd) => {
  const r = spawnSync('git', args, { encoding: 'utf8', cwd })
  return { status: r.status, stdout: r.stdout ?? '', stderr: (r.stderr ?? '').trim() }
}

function worktreeHolding({ git, branch, root }) {
  const out = git(['worktree', 'list', '--porcelain'], root)
  if (out.status !== 0) return { error: out.stderr }
  let path
  for (const line of out.stdout.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9)
    if (line === `branch refs/heads/${branch}`) return { path }
  }
  return { path: null }
}

export function closeStory({ hosts, story, repo, branch, root = process.cwd(), git = defaultGit, fs = { exists: existsSync, rm: rmSync } }) {
  const steps = {}
  const run = (name, fn) => {
    try {
      steps[name] = fn()
    } catch (e) {
      steps[name] = { ok: false, error: e?.message ?? String(e) }
    }
  }
  run('dod', () => {
    const { body } = hosts.pm.readCard(story, { repo })
    const next = checkDodBoxes(body)
    if (next === body) return { ok: true, changed: false }
    hosts.pm.updateCard({ repo, id: story, body: next })
    return { ok: true, changed: true }
  })
  let closed = [Number(story)]
  run('close', () => {
    const r = hosts.pm.closeAndCascade({ id: story, repo })
    closed = r.closed ?? closed
    return { ok: true, closed, stoppedAt: r.stoppedAt ?? null }
  })
  run('board', () => {
    const per = closed.map(id => ({ id, ...hosts.pm.setBoardState({ id, state: 'Done', repo }) }))
    const bad = per.filter(p => !p.confirmed)
    return { ok: bad.length === 0, per, ...(bad.length ? { error: bad.map(b => `#${b.id}: ${b.error}`).join('; ') } : {}) }
  })
  run('branch', () => {
    if (!branch) return { ok: false, error: 'no --branch given: branch and worktree left in place' }
    if (!SAFE_REF_RE.test(branch)) return { ok: false, error: `unsafe branch name ${JSON.stringify(branch)}` }
    const notes = []
    const held = worktreeHolding({ git, branch, root })
    if (held.error) return { ok: false, error: `git worktree list failed: ${held.error}` }
    if (held.path && held.path !== root) {
      const rm = git(['worktree', 'remove', held.path], root)
      if (rm.status !== 0) return { ok: false, error: `worktree ${held.path} not removed: ${rm.stderr}`, notes }
      notes.push(`worktree ${held.path} removed`)
    }
    if (typeof hosts.code?.deleteBranch === 'function') {
      // The host API, never `git push --delete`: that runs the local pre-push quality gate.
      try {
        const r = hosts.code.deleteBranch({ branch, repo })
        notes.push(r?.deleted ? 'remote branch deleted' : 'remote branch already gone')
      } catch (e) {
        return { ok: false, error: `remote branch not deleted: ${e?.message ?? e}`, notes }
      }
    } else {
      // No host route: a pure ref deletion pushes no commit, so the commit-quality gate has nothing to judge.
      const remote = git(['push', '--no-verify', 'origin', '--delete', branch], root)
      if (remote.status !== 0 && !/remote ref does not exist|unable to delete .*: remote ref/i.test(remote.stderr)) return { ok: false, error: `remote branch not deleted: ${remote.stderr}`, notes }
      notes.push(remote.status === 0 ? 'remote branch deleted' : 'remote branch already gone')
    }
    const exists = git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root).status === 0
    if (exists) {
      // The PR is verified merged: a squash merge leaves the branch "unmerged" to git, hence -D.
      const local = git(['branch', '-D', branch], root)
      if (local.status !== 0) return { ok: false, error: `local branch not deleted: ${local.stderr}`, notes }
      notes.push('local branch deleted')
    } else notes.push('local branch already gone')
    return { ok: true, notes }
  })
  run('checkpoint', () => {
    const p = join(root, '.pair', 'working', 'checkpoints', `${story}.md`)
    if (!fs.exists(p)) return { ok: true, removed: false }
    fs.rm(p)
    return { ok: true, removed: true }
  })
  const failedSteps = Object.entries(steps).filter(([, v]) => v.ok === false)
  return { cascaded: failedSteps.length === 0, steps, ...(failedSteps.length ? { reason: `post-merge closure unfinished: ${failedSteps.map(([k, v]) => `${k} (${v.error})`).join('; ')}` } : {}) }
}

// ── the two commands ───────────────────────────────────────────────────────────────────────
// A park whose kind is `escalated` is recorded with the escalation comment, never the merge-park one.
const record = (input, decision, merged = false) =>
  decision.parkKind === 'escalated'
    ? escalate({ hosts: input.hosts, story: input.story, repo: input.repo, stage: 'merge', conditions: decision.conditions ?? [] })
    : park({ hosts: input.hosts, story: input.story, pr: input.pr, repo: input.repo, decision, merged })

export function checkMerge(input) {
  const decision = evaluate({ ...input, requireGate: false })
  const out = { stage: 'merge', mode: 'check', ...decision }
  if (!decision.mergeAllowed) out.comment = record(input, decision)
  return out
}

export function runMerge({ message, branch, root, git, fs, ...input }) {
  const decision = evaluate({ ...input, requireGate: true })
  const out = { stage: 'merge', mode: 'run', ...decision, merged: false, cascaded: false }
  const parkWith = (d, merged) => ({ ...out, ...d, merged, comment: record(input, d, merged) })
  if (!decision.mergeAllowed) return parkWith(decision, false)
  try {
    input.hosts.code.merge({ pr: input.pr, repo: input.repo, strategy: 'squash', message, headSha: input.reviewedHead })
  } catch (e) {
    const failed = [{ code: 'merge-failed', detail: `the code host refused the merge: ${e.message}` }]
    return parkWith({ mergeAllowed: false, failed, reason: failed[0].detail, parkKind: 'halted' }, false)
  }
  const closure = closeStory({ hosts: input.hosts, story: input.story, repo: input.repo, branch, root, git, fs })
  const merged = { ...out, merged: true, cascaded: closure.cascaded, cascade: closure.steps, ...(closure.reason ? { reason: closure.reason } : {}) }
  if (closure.cascaded) return merged
  const failed = [{ code: 'cascade-incomplete', detail: closure.reason }]
  return { ...merged, parkKind: 'halted', comment: park({ hosts: input.hosts, story: input.story, pr: input.pr, repo: input.repo, decision: { failed }, merged: true }) }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────
const FLAGS = {
  check: ['dir', 'story', 'pr', 'reviewedHead', 'cardTier', 'autoAdvance', 'mergeGate', 'repo'],
  run: ['dir', 'story', 'pr', 'reviewedHead', 'cardTier', 'autoAdvance', 'mergeGate', 'repo', 'gate', 'message', 'branch', 'root'],
  escalate: ['dir', 'story', 'stage', 'conditions', 'repo'],
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv
  const opts = {}
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--') || rest[i + 1] === undefined) throw new Error(`bad argument: ${rest[i]}`)
    opts[rest[i].slice(2)] = rest[i + 1]
  }
  if (!FLAGS[cmd]) throw new Error(`unknown command: ${cmd} (expected check | run)`)
  const unknown = Object.keys(opts).filter(k => !FLAGS[cmd].includes(k))
  if (unknown.length) throw new Error(`unknown flag(s) for ${cmd}: ${unknown.map(k => `--${k}`).join(', ')}`)
  const need = (...ks) => {
    for (const k of ks) if (opts[k] === undefined) throw new Error(`--${k} is required`)
  }
  if (cmd === 'escalate') {
    need('dir', 'story', 'stage', 'conditions')
    if (!/^\d+$/.test(opts.story)) throw new Error(`--story must be a number, got ${JSON.stringify(opts.story)}`)
    if (!/^[a-z-]+$/.test(opts.stage)) throw new Error('--stage must be a step name')
    let conditions
    try {
      conditions = JSON.parse(opts.conditions)
    } catch {
      throw new Error('--conditions must be a JSON array of conditions')
    }
    if (!Array.isArray(conditions) || !conditions.length || conditions.some(c => conditionError(c) !== null)) throw new Error('--conditions must be a non-empty JSON array of label-shaped conditions')
    if (opts.repo !== undefined && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(opts.repo)) throw new Error('--repo must be owner/name')
    return { cmd, opts: { ...opts, story: Number(opts.story), conditions } }
  }
  need('dir', 'story', 'pr', 'reviewedHead', 'cardTier')
  if ((opts.autoAdvance === undefined) === (opts.mergeGate === undefined)) throw new Error('exactly one of --autoAdvance or --mergeGate is required')
  if (!/^\d+$/.test(opts.story)) throw new Error(`--story must be a number, got ${JSON.stringify(opts.story)}`)
  if (!/^\d+$/.test(opts.pr)) throw new Error(`--pr must be a number, got ${JSON.stringify(opts.pr)}`)
  if (!SHA_RE.test(opts.reviewedHead)) throw new Error('--reviewedHead must be a 40-hex sha')
  if (!TIER_RE.test(opts.cardTier)) throw new Error('--cardTier must be a label-shaped tier')
  let tiers
  let mergeGate
  if (opts.autoAdvance !== undefined) {
    try {
      tiers = JSON.parse(opts.autoAdvance)
    } catch {
      throw new Error('--autoAdvance must be a JSON array of tiers')
    }
    if (!Array.isArray(tiers) || tiers.some(t => typeof t !== 'string' || !TIER_RE.test(t))) throw new Error('--autoAdvance must be a JSON array of label-shaped tiers')
  } else {
    let raw
    try {
      raw = JSON.parse(opts.mergeGate)
    } catch {
      throw new Error('--mergeGate must be a JSON gate object {mode, has, lacks}')
    }
    const text = raw && typeof raw === 'object' ? `${raw.mode}${raw.has?.length ? `; has: ${raw.has.join(',')}` : ''}${raw.lacks?.length ? `; lacks: ${raw.lacks.join(',')}` : ''}` : ''
    const g = parseGate('merge', text)
    if (g.errors) throw new Error(`--mergeGate is invalid: ${g.errors.map(e => `${e.key} ${e.reason}`).join('; ')}`)
    mergeGate = g.value
  }
  if (opts.repo !== undefined && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(opts.repo)) throw new Error('--repo must be owner/name')
  if (opts.branch !== undefined) {
    try {
      assertBranchName(opts.branch)
    } catch {
      throw new Error(`--branch is not a safe branch name: ${JSON.stringify(opts.branch)}`)
    }
  }
  if (cmd === 'run') need('gate', 'message')
  if (cmd === 'run' && !['green', 'red'].includes(opts.gate)) throw new Error('--gate must be green | red')
  return { cmd, opts: { ...opts, story: Number(opts.story), pr: Number(opts.pr), ...(tiers ? { autoAdvanceTiers: tiers } : {}), ...(mergeGate ? { mergeGate } : {}) } }
}

const isMain = () => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (isMain()) {
  try {
    const { cmd, opts } = parseArgs(process.argv.slice(2))
    if (cmd === 'escalate') assertRunOwnsStory({ dir: opts.dir, story: opts.story, repo: opts.repo })
    const HOSTS = await import('./host/index.mjs')
    const hosts = HOSTS.bindHosts({ dir: opts.dir })
    if (cmd === 'escalate') {
      process.stdout.write(JSON.stringify({ stage: opts.stage, conditions: opts.conditions, comment: escalate({ hosts, story: opts.story, repo: opts.repo, stage: opts.stage, conditions: opts.conditions }) }) + '\n')
      process.exit(0)
    }
    const base = { hosts, story: opts.story, pr: opts.pr, repo: opts.repo, reviewedHead: opts.reviewedHead, cardTier: opts.cardTier, ...(opts.autoAdvanceTiers ? { autoAdvanceTiers: opts.autoAdvanceTiers } : {}), ...(opts.mergeGate ? { mergeGate: opts.mergeGate } : {}) }
    const out = cmd === 'check' ? checkMerge(base) : runMerge({ ...base, gate: opts.gate, message: opts.message, branch: opts.branch, root: opts.root ?? process.cwd() })
    process.stdout.write(JSON.stringify(out) + '\n')
    process.exit(0)
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n')
    process.exit(2)
  }
}
