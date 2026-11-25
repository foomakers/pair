// adapter-kit.mjs — what every PM/code-host adapter shares (US-492). An adapter is ONE file next to
// this one, `scripts/host/<id>.mjs`, whose default export is `defineAdapter({ … })`. The cycle
// scripts (`cycle-state.mjs`, `pr-comment.mjs`, `pr-state.mjs`) never spawn a host CLI themselves:
// they call the adapter bound by `index.mjs`, and every host-specific spelling — binary, argv, URL
// shape, label and check vocabulary — lives in the adapter file alone.
//
// Shared here, never re-implemented per adapter:
//   - the interface itself (INTERFACE_METHODS, and which side of ADR-018's split owns each one);
//   - the card-hash canonicalization: `cardHash` is DERIVED from the adapter's `readCard`,
//     so two hosts can differ only in how they fetch the card, never in how it is hashed;
//   - the marker-keyed upsert algorithm (read back, edit in place, refuse ambiguity);
//   - the CLI spawn (CLI-first) and the typed failure every caller maps to its own reason.
// Credentials: nothing in this kit or in an adapter reads, writes, stores or prints a token —
// the host CLI authenticates itself from its own configuration; the child inherits the environment
// untouched except for the GIT_* repository-pinning variables a git hook exports.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The eight methods of the interface, named from the call sites the cycle scripts had (US-492).
export const INTERFACE_METHODS = ['readCard', 'cardHash', 'prHead', 'upsertComment', 'concludeCheck', 'setPrState', 'merge', 'closeAndCascade']
// `cardHash` is supplied by defineAdapter over `readCard`; an adapter writes the other seven.
export const REQUIRED_METHODS = INTERFACE_METHODS.filter(m => m !== 'cardHash')
// Primitives the cycle's scope-decision and pr-state paths already used through `gh` beyond the
// eight (card create/search/edit, one comment read, the check/label read-backs, ref parsing). An
// adapter MAY omit them: the feature that needs one then fails typed, naming the method.
export const SUPPORT_METHODS = ['createCard', 'findCards', 'listCards', 'childCards', 'blockedBy', 'linkedPr', 'workflowPr', 'workflowActor', 'workflowPrDetails', 'workflowReviews', 'workflowReviewIdentity', 'workflowApprovalToken', 'syncEpic', 'updateCard', 'assignCard', 'parseCardRef', 'listCardComments', 'listComments', 'readComment', 'parseCommentRef', 'commentRef', 'readCheck', 'readCheckRun', 'readCiChecks', 'workflowCi', 'readLabels', 'setClassification', 'commentOnCard', 'setBoardState', 'ensureBoardMembership', 'closeCard', 'resolveUser', 'readPermission']
// ADR-018's split: card operations resolve `pm-tool`, pull-request operations resolve `code-host`.
export const PM_METHODS = ['readCard', 'cardHash', 'cardState', 'closeAndCascade', 'closeCard', 'ensureBoardMembership', 'syncEpic', 'createCard', 'findCards', 'listCards', 'childCards', 'blockedBy', 'updateCard', 'assignCard', 'parseCardRef', 'listCardComments', 'commentOnCard', 'setBoardState', 'labelCard', 'unlabelCard', 'resolveUser']
export const CODE_METHODS = ['prHead', 'linkedPr', 'workflowPr', 'workflowActor', 'workflowPrDetails', 'workflowReviews', 'workflowReviewIdentity', 'workflowApprovalToken', 'upsertComment', 'concludeCheck', 'setPrState', 'merge', 'listComments', 'readComment', 'parseCommentRef', 'commentRef', 'readCheck', 'readCheckRun', 'readCiChecks', 'workflowCi', 'readLabels', 'setClassification', 'deleteBranch', 'readPermission']
// setClassification's family/value vocabulary (the review's classification tags, pr-states.md /
// quality-model.md §5): each family carries its own chromatic enum — never shared across families.
export const CLASSIFICATION_FAMILIES = { risk: ['green', 'yellow', 'red'], cost: ['green', 'yellow', 'orange', 'red'] }
// The ONE check context and the ONE label set the review publishes (pr-states.md). Each adapter
// declares its own spelling of them; these are the vocabulary pr-state.mjs maps a verdict onto.
export const MERGE_STRATEGIES = ['squash', 'merge', 'rebase']
export const CHECK_STATES = ['success', 'failure', 'pending']

// Keep an epic's visible child checklist in sync with its PM-tool relations.
export function updateEpicBody(body, children) {
  let source = String(body ?? '')
  if (!children.length) return source
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const missing = []
  for (const child of children) {
    const id = String(child.id)
    const ref = /^\d+$/.test(id) ? `#${id}` : id
    const token = escape(ref)
    const leading = new RegExp(`^(?:\\[${token}\\]\\([^\\n)]*\\)|${/^\d+$/.test(id) ? `\\*\\*US-${escape(id)}:\\*\\*|` : ''}${token}(?=$|[\\s—:,]))`)
    let found = false
    source = source.replace(/^(\s*[-*]\s+)\[([ xX])\](\s+)([^\n]*)/gm, (line, bullet, mark, space, content) => {
      if (found || !leading.test(content)) return line
      found = true
      return `${bullet}[${child.closed ? 'x' : ' '}]${space}${content}`
    })
    if (!found) missing.push(`- [${child.closed ? 'x' : ' '}] ${ref}`)
  }
  if (!missing.length) return source
  const heading = /^## Sub-Issues[ \t]*$/m.exec(source)
  if (!heading) return `${source.trimEnd()}\n\n## Sub-Issues\n\n${missing.join('\n')}\n`
  const afterHeading = heading.index + heading[0].length
  const rest = source.slice(afterHeading)
  const next = /^## /m.exec(rest)
  const end = next ? afterHeading + next.index : source.length
  const section = source.slice(afterHeading, end)
  const before = source.slice(0, end).trimEnd()
  const after = source.slice(end)
  return `${before}${section.trim() ? '\n' : '\n\n'}${missing.join('\n')}${after ? `\n\n${after.trimStart()}` : '\n'}`
}

export class HostError extends Error {
  // kind: failed (the CLI exited non-zero) | invalid-json | invalid-output | not-implemented |
  //       unsupported | invalid-input | code-host-undeclared | adapter-error
  constructor(kind, { message, method, command, detail, adapter } = {}) {
    super(message ?? `${kind}${method ? ` (${method})` : ''}${detail ? `: ${detail}` : ''}`)
    this.name = 'HostError'
    this.kind = kind
    if (method !== undefined) this.method = method
    if (command !== undefined) this.command = command
    this.detail = detail ?? ''
    if (adapter !== undefined) this.adapter = adapter
  }
}

// The canonical hash of a card body: sha256 over the body exactly as the adapter's
// `readCard` returned it (for GitHub, `gh issue view --json body -q .body`'s stdout, as the
// pre-extraction `cycle-state.mjs cardHash` hashed it — so a handoff stamped before US-492 still
// compares equal).
export const canonicalCardHash = body => `sha256:${createHash('sha256').update(String(body ?? '')).digest('hex')}`

const GIT_ENV_RE = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/
export const cleanGitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_ENV_RE.test(k)))

// The ONE spawn every adapter uses. `label` names the command in a failure (never the resolved
// binary path — a stubbed binary in a test must not change a reason string).
// A branch name that is safe as a ref path: `git check-ref-format refs/heads/<b>` (never `--branch`: it expands `@{-N}` from the cwd reflog) AND no `@{`, `#`, `%`, `?`,
// whitespace or control character (they change meaning in a URL path). Throws a typed refusal.
export function assertBranchName(branch) {
  const b = typeof branch === 'string' ? branch : ''
  const bad = !b || /[#%?\s\x00-\x1f\x7f\\]/.test(b) || b.startsWith('-') || b.includes('@{') || b === 'HEAD' || spawnSync('git', ['check-ref-format', `refs/heads/${b}`], { encoding: 'utf8', env: cleanGitEnv(process.env) }).status !== 0
  if (bad) throw new HostError('invalid-input', { message: `invalid branch name ${JSON.stringify(branch)}` })
  return b
}

// US-572: the card-id shape guard, as a typed refusal — the same rule as autonomy-policy.mjs checkCardId (the
// pure parsers' copy; this directory stays self-contained, opaque-card-ids.test.mjs pins the two equal).
export const CARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export function assertCardId(ref, method = 'parseCardRef') {
  const id = String(ref ?? '').replace(/^#/, '')
  if (!CARD_ID_RE.test(id) || id.includes('..') || id.length > 120) throw new HostError('invalid-input', { message: `${JSON.stringify(String(ref ?? ''))} is not a card id (no "/", "..", whitespace or absolute path)`, method })
  return id
}

// One call's output is bounded (callers page large listings); a failure names the command and its
// stderr only — never stdout, a content flag's value, or any argv token that is not a short plain
// identifier (no-card-text-in-logs).
const MAX_OUTPUT = 64 * 1024 * 1024
const MAX_ERROR = 2000
const CONTENT_FLAGS = new Set(['--body', '-b', '--description', '--title', '-t', '--comment', '--message', '-m', '--fields', '--wiql'])
const FIELD_FLAGS = new Set(['-f', '-F', '--raw-field', '--field'])
const SAFE_ARG = /^[A-Za-z0-9._:/@#?&+%-]{1,80}$/
export function redactArgs(args) {
  return args.map((a, i) => {
    const s = String(a)
    if (CONTENT_FLAGS.has(String(args[i - 1]))) return '<redacted>'
    const kv = /^([A-Za-z_]+)=([\s\S]*)$/.exec(s)
    if (kv && FIELD_FLAGS.has(String(args[i - 1]))) return `${kv[1]}=${kv[1] !== 'query' && SAFE_ARG.test(kv[2]) ? kv[2] : '<redacted>'}`
    return SAFE_ARG.test(s) ? s : '<redacted>'
  })
}
const TRANSIENT_HOST_ERROR =
  /\b(?:ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|ENETUNREACH|EHOSTUNREACH|HTTP\s*(?:429|5\d\d)|(?:status|error)\s*(?:429|5\d\d)|rate limit|timed? out|temporary failure in name resolution|connection reset by peer|i\/o timeout)\b/i
const waitMs = ms => {
  const flag = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(flag, 0, 0, ms)
}

export function runCli({ bin, args, input, label, operation = label ?? bin, replaySafe = false, sleep = waitMs, now = Date.now, responseError, sanitizeStderr }) {
  const command = `${label ?? bin} ${redactArgs(args).join(' ')}`
  const report = (attempt, outcome) => process.stderr.write(`HOST-RETRY: operation=${operation} attempt=${attempt} outcome=${outcome}\n`)
  const deadline = now() + 30_000
  for (let attempt = 1; attempt <= (replaySafe ? 4 : 1); attempt++) {
    const remaining = Math.max(1, deadline - now())
    const detached = process.platform !== 'win32' && process.env.PAIR_HOST_GROUP_MANAGED !== '1'
    const r = spawnSync(bin, args, {
      encoding: 'utf8',
      input,
      env: cleanGitEnv(process.env),
      maxBuffer: MAX_OUTPUT,
      timeout: remaining,
      detached,
      killSignal: 'SIGKILL',
    })
    if (r.error?.code === 'ETIMEDOUT' && r.pid && detached) {
      try { process.kill(-r.pid, 'SIGKILL') } catch { /* process group already exited */ }
    }
    const stderr = sanitizeStderr ? sanitizeStderr(r.stderr ?? '') : r.stderr
    const responseFailure = !r.error && r.status === 0 && responseError ? responseError(r.stdout, stderr) : undefined
    if (!r.error && r.status === 0 && !responseFailure) {
      if (attempt > 1) report(attempt, 'recovered')
      return r.stdout
    }
    const detail = (responseFailure || stderr || r.error?.message || '').trim().slice(0, MAX_ERROR)
    const diagnostic = responseFailure || r.stderr || r.error?.message || ''
    const transient = TRANSIENT_HOST_ERROR.test(diagnostic) || r.error?.code === 'ETIMEDOUT'
    if (!transient) {
      if (attempt > 1) report(attempt, 'permanent')
      throw new HostError('failed', { message: `${command} failed: ${detail}`, command, detail })
    }
    const retryAfter = /\bRetry-After:\s*([^\r\n]+)/i.exec(detail)?.[1].trim() ?? /\bHTTP\s*(?:429|5\d\d)\s+Retry-After:\s*(\d+)\b/i.exec(diagnostic)?.[1]
    const retryAt = retryAfter && !/^\d+$/.test(retryAfter) ? Date.parse(retryAfter) : NaN
    const delay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Number.isFinite(retryAt) ? Math.max(0, retryAt - now()) : 1000 * 2 ** (attempt - 1)
    const cause = r.error?.code === 'ETIMEDOUT' ? 'ETIMEDOUT' : (TRANSIENT_HOST_ERROR.exec(diagnostic)?.[0] ?? 'transient')
    const exhausted = () => new HostError('transient-exhausted', {
      message: `host-transient: ${command} transient host failure after ${attempt} attempts: ${cause}`,
      command,
      detail: cause,
    })
    if (!replaySafe || attempt === 4 || delay > deadline - now()) {
      report(attempt, 'exhausted')
      throw exhausted()
    }
    sleep(delay)
    if (now() >= deadline) {
      report(attempt, 'exhausted')
      throw exhausted()
    }
    report(attempt, 'retry')
  }
}

// The ONE PR→card link grammar (#642): the board workflow's selector (board-event.mjs) and every code
// host's linkedPr read it through selectLink (resolveLinked), so what selects a card is exactly what later counts as its PR. Native links
// (#642 Maintainer Decision): `Closes|Fixes|Resolves #N` and a branch carrying `#N` not followed by an
// identifier character. Any other id — `AB#N` included — links only through one `Refs: <ID>` line, which
// must resolve to exactly one card (the 2026-11-14 amendment); an invalid token is null.
const LINK_ID = /^(?:AB#|#)?([A-Za-z0-9][A-Za-z0-9._-]{0,119})$/
export function prLinks({ body, branch } = {}) {
  const text = String(body ?? '')
  return {
    closes: [...text.matchAll(/^(?:Closes|Fixes|Resolves)[ \t]+#(\d+)[ \t]*$/gim)].map(m => m[1]),
    refs: [...text.matchAll(/^Refs:[ \t]*(.*?)[ \t]*$/gim)].map(m => LINK_ID.exec(m[1])?.[1] ?? null),
    branch: [...String(branch ?? '').matchAll(/#(\d+)(?![A-Za-z0-9_])/g)].map(m => m[1]),
  }
}
// Exactly one card per PR: every link must name the same card (a native link wins the source), else none —
// several distinct ids, or an invalid `Refs:` token, is ambiguous. The workflow selector and linkedPr both use it.
export function selectLink(links) {
  if (links.refs.includes(null)) return null
  const natives = new Set([...links.closes, ...links.branch])
  const ids = new Set([...natives, ...links.refs])
  if (ids.size !== 1) return null
  const [id] = ids
  return { source: natives.has(id) ? 'native' : 'ref', id }
}
// linkedPr's one resolution over a host's PR rows ({ number, links, state }, same-repository only). A row whose
// links mention the card but select no single card is a typed gap (PR numbers and candidate ids, no PR text),
// never a silent `none`; otherwise several PRs linking the card resolve merged > open > closed-unmerged.
export function resolveLinked(rows, id) {
  const card = String(id).replace(/^#/, '')
  const mentioned = links => [...links.closes, ...links.refs.filter(Boolean), ...links.branch]
  const ambiguous = rows.filter(row => !selectLink(row.links) && mentioned(row.links).includes(card))
  if (ambiguous.length) return { gap: 'pr-link-ambiguous', prs: ambiguous.map(row => row.number), candidates: [...new Set(ambiguous.flatMap(row => mentioned(row.links)))].sort() }
  const hits = rows.filter(row => selectLink(row.links)?.id === card)
  if (!hits.length) return 'none'
  if (hits.some(row => row.state === 'merged')) return 'merged'
  if (hits.some(row => row.state === 'open')) return 'open'
  return hits.every(row => row.state === 'closed-unmerged') ? 'closed-unmerged' : 'unknown'
}

// way-of-working.md text, found upward from `from`; '' when none.
export function adoptionText(from) {
  for (let cur = from; ; cur = dirname(cur)) {
    const f = join(cur, '.pair', 'adoption', 'tech', 'way-of-working.md')
    if (existsSync(f)) return readFileSync(f, 'utf8')
    if (dirname(cur) === cur) return ''
  }
}

// `## State Mapping` rows → { macrostate (lower-case) → board state }, first row wins.
export function stateMapOf(text) {
  const section = /^##\s+State Mapping\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
  const map = {}
  for (const c of section.split('\n').map(l => l.split('|').map(x => x.trim()))) if (c.length > 3 && c[1] && !/^-+$/.test(c[1]) && !(c[2].toLowerCase() in map)) map[c[2].toLowerCase()] = c[1]
  return map
}

export function parseJson(text, { command } = {}) {
  try {
    return JSON.parse(text)
  } catch {
    throw new HostError('invalid-json', { message: `invalid JSON from ${command ?? 'host CLI'}`, command })
  }
}

// `--paginate` concatenates pages as consecutive top-level JSON arrays. Split them STRING-AWARE: a `[`
// or `]` inside a JSON string (any commenter can write `arr[0` in a body) is text, not structure
// (t9d-4th round, t9d-3 — the naive counter hid pages and made `upsert` post duplicates).
export function splitPages(out) {
  const pages = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '[') {
      if (depth === 0) start = i
      depth++
    } else if (c === ']') {
      depth--
      if (depth === 0 && start >= 0) {
        pages.push(JSON.parse(out.slice(start, i + 1)))
        start = -1
      }
    }
  }
  if (inString || depth !== 0 || start >= 0) throw new Error('unterminated JSON page in gh --paginate output')
  return pages
}

// `--paginate` on an endpoint that answers an OBJECT per page (`{ check_runs: [...] }`, `{ statuses: [...] }`) concatenates
// consecutive top-level objects: same string-aware split, over `{ }`.
export function splitObjectPages(out) {
  const pages = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') {
      if (depth === 0) start = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        pages.push(JSON.parse(out.slice(start, i + 1)))
        start = -1
      }
    }
  }
  if (inString || depth !== 0 || start >= 0) throw new Error('unterminated JSON page in gh --paginate output')
  return pages
}

// ── marker-keyed comments (US-479 T-15; moved here verbatim from pr-comment.mjs) ─────────────
export function findByMarker(comments, marker) {
  const hits = comments.filter(c => c.body.includes(marker))
  return { found: hits.length > 0, count: hits.length, hits }
}

export function withMarker(body, marker) {
  const lines = String(body ?? '').replace(/^﻿/, '').split('\n')
  if (lines[0].trim() === marker) return lines.join('\n')
  return `${marker}\n${lines.join('\n')}`
}

// The upsert algorithm, host-agnostic: read back BEFORE the write, edit the ONE carrier in place,
// post only when none carries the marker, refuse two carriers. `list/create/update` are the
// adapter's transport; `max` its host's comment-size cap.
export function upsertByMarker({ marker, body, max, list, create, update }) {
  const full = withMarker(body, marker)
  if (full.length > max) return { error: 'body-too-long', length: full.length, max, marker }
  const write = (action, fn) => {
    try {
      const res = fn()
      return { action, id: res.id, url: res.url, marker }
    } catch (error) {
      if (!String(error?.message ?? error).includes('host-transient:')) throw error
      // A lost reply says nothing about whether the write landed. Read by the stable marker;
      // an absent or ambiguous result remains a refusal, never a second mutation.
      const after = findByMarker(list(), marker).hits
      if (after.length !== 1 || after[0].body !== full) throw error
      return { action, id: after[0].id, url: after[0].url, marker }
    }
  }
  const { hits } = findByMarker(list(), marker)
  if (hits.length > 1) return { error: 'marker-ambiguous', ids: hits.map(h => h.id), marker }
  if (hits.length === 1) {
    if (hits[0].body === full) return { action: 'unchanged', id: hits[0].id, url: hits[0].url, marker }
    return write('updated', () => update(hits[0], full))
  }
  return write('created', () => create(full))
}

// ── defineAdapter ─────────────────────────────────────────────────────────────────────────────
// `spec`:
//   id          the canonical tool id this file implements (the file name without `.mjs`)
//   aliases     every way-of-working spelling that names this product (pm-resolution alias row)
//   hostsCode   whether the tool hosts repositories/PRs (ADR-018: omitted `code-host` ⇒ the PM tool)
//   binaries    the CLI(s) the adapter spawns — CLI-first, nothing else is ever spawned
//               (`[]` only for a local, CLI-less tracker)
//   create(transport) → the methods. `transport` is opaque to every caller: a test's stub binary
//               path travels through it, the cycle scripts never name it.
export function defineAdapter(spec) {
  const problems = []
  if (!spec || typeof spec !== 'object') throw new HostError('adapter-error', { message: 'defineAdapter expects an object' })
  if (typeof spec.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(spec.id)) problems.push('id must be a lower-case kebab id')
  // Empty only for a tracker that is local files and has no CLI at all (the `filesystem` worked example).
  if (!Array.isArray(spec.binaries) || spec.binaries.some(x => typeof x !== 'string' || !x)) problems.push('binaries must list the CLI(s) the adapter spawns')
  if (typeof spec.create !== 'function') problems.push('create(transport) must return the methods')
  if (problems.length) throw new HostError('adapter-error', { message: `invalid adapter ${spec.id ?? '?'}: ${problems.join('; ')}`, adapter: spec.id })
  return Object.freeze({
    id: spec.id,
    aliases: Object.freeze([spec.id, ...(spec.aliases ?? [])]),
    hostsCode: spec.hostsCode !== false,
    binaries: Object.freeze([...spec.binaries]),
    instantiate(transport = {}) {
      const methods = spec.create(transport) ?? {}
      if ('cardHash' in methods) throw new HostError('adapter-error', { message: `adapter ${spec.id} must not define cardHash — it is derived from readCard`, adapter: spec.id, method: 'cardHash' })
      const missing = REQUIRED_METHODS.filter(m => typeof methods[m] !== 'function')
      if (missing.length) throw new HostError('adapter-error', { message: `adapter ${spec.id} is incomplete: missing ${missing.join(', ')}`, adapter: spec.id, method: missing[0] })
      const readCard = methods.readCard
      return guard(spec.id, {
        ...methods,
        id: spec.id,
        cardHash(id, opts = {}) {
          const { body } = readCard(id, { ...opts, fields: undefined })
          return canonicalCardHash(body)
        },
        cardState({ id, repo, card = readCard(id, { repo, fields: ['state', 'stateReason', 'projectItems'] }) }) {
          // An adapter whose card can sit on several boards scopes membership to the adopted one.
          const scoped = typeof methods.boardItems === 'function' ? methods.boardItems({ id, repo }) : card.projectItems ?? []
          // An unresolved board is a reported gap, never "not a member" (that would reset the Status).
          if (!Array.isArray(scoped)) return { issueState: card.state ?? null, issueReason: card.stateReason ?? null, boardState: null, member: false, gap: scoped.gap }
          const items = scoped
          return {
            issueState: card.state ?? null,
            issueReason: card.stateReason ?? null,
            // gh prints an empty Status as {"optionId":"","name":""}: uninitialized, not a state.
            boardState: items.length === 1 ? items[0]?.status?.name || null : null,
            member: items.length > 0,
          }
        },
      })
    },
  })
}

// Every call is attributed: a method the adapter does not implement fails typed, naming it; a
// non-HostError thrown by an adapter is an adapter bug, reported with the method name — never
// silently skipped (US-492 edge case "a method partially implemented").
function guard(adapterId, impl) {
  return new Proxy(impl, {
    get(target, prop) {
      if (typeof prop !== 'string') return target[prop]
      const known = INTERFACE_METHODS.includes(prop) || SUPPORT_METHODS.includes(prop)
      const value = target[prop]
      if (known && typeof value !== 'function') {
        return () => {
          throw new HostError('not-implemented', { message: `host adapter ${adapterId} does not implement ${prop}`, method: prop, adapter: adapterId })
        }
      }
      if (typeof value !== 'function') return value
      return (...args) => {
        try {
          return value.apply(target, args)
        } catch (e) {
          if (e instanceof HostError) throw e
          throw new HostError('adapter-error', { message: `host adapter ${adapterId} ${prop} failed: ${e?.message ?? String(e)}`, method: prop, adapter: adapterId, detail: e?.message ?? String(e) })
        }
      }
    },
  })
}
