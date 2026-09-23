// adapter-kit.mjs — what every PM/code-host adapter shares (US-492). An adapter is ONE file next to
// this one, `scripts/host/<id>.mjs`, whose default export is `defineAdapter({ … })`. The cycle
// scripts (`cycle-state.mjs`, `pr-comment.mjs`, `pr-state.mjs`) never spawn a host CLI themselves:
// they call the adapter bound by `index.mjs`, and every host-specific spelling — binary, argv, URL
// shape, label and check vocabulary — lives in the adapter file alone.
//
// Shared here, never re-implemented per adapter:
//   - the interface itself (INTERFACE_METHODS, and which side of ADR-018's split owns each one);
//   - the card-hash canonicalization (AC5): `cardHash` is DERIVED from the adapter's `readCard`,
//     so two hosts can differ only in how they fetch the card, never in how it is hashed;
//   - the marker-keyed upsert algorithm (read back, edit in place, refuse ambiguity);
//   - the CLI spawn (CLI-first, AC6) and the typed failure every caller maps to its own reason.
// Credentials (AC7): nothing in this kit or in an adapter reads, writes, stores or prints a token —
// the host CLI authenticates itself from its own configuration; the child inherits the environment
// untouched except for the GIT_* repository-pinning variables a git hook exports.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

// The eight methods of the interface, named from the call sites the cycle scripts had (US-492 AC1).
export const INTERFACE_METHODS = ['readCard', 'cardHash', 'prHead', 'upsertComment', 'concludeCheck', 'setPrState', 'merge', 'closeAndCascade']
// `cardHash` is supplied by defineAdapter over `readCard`; an adapter writes the other seven.
export const REQUIRED_METHODS = INTERFACE_METHODS.filter(m => m !== 'cardHash')
// Primitives the cycle's scope-decision and pr-state paths already used through `gh` beyond the
// eight (card create/search/edit, one comment read, the check/label read-backs, ref parsing). An
// adapter MAY omit them: the feature that needs one then fails typed, naming the method.
export const SUPPORT_METHODS = ['createCard', 'findCards', 'updateCard', 'parseCardRef', 'listComments', 'readComment', 'parseCommentRef', 'commentRef', 'readCheck', 'readLabels']
// ADR-018's split: card operations resolve `pm-tool`, pull-request operations resolve `code-host`.
export const PM_METHODS = ['readCard', 'cardHash', 'closeAndCascade', 'createCard', 'findCards', 'updateCard', 'parseCardRef']
export const CODE_METHODS = ['prHead', 'upsertComment', 'concludeCheck', 'setPrState', 'merge', 'listComments', 'readComment', 'parseCommentRef', 'commentRef', 'readCheck', 'readLabels']
// The ONE check context and the ONE label set the review publishes (pr-states.md). Each adapter
// declares its own spelling of them; these are the vocabulary pr-state.mjs maps a verdict onto.
export const MERGE_STRATEGIES = ['squash', 'merge', 'rebase']
export const CHECK_STATES = ['success', 'failure', 'pending']

export class HostError extends Error {
  // kind: failed (the CLI exited non-zero) | invalid-json | invalid-output | not-implemented |
  //       unsupported | code-host-undeclared | adapter-error
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

// AC5 — the canonical hash of a card body: sha256 over the body exactly as the adapter's
// `readCard` returned it (for GitHub, `gh issue view --json body -q .body`'s stdout, as the
// pre-extraction `cycle-state.mjs cardHash` hashed it — so a handoff stamped before US-492 still
// compares equal).
export const canonicalCardHash = body => `sha256:${createHash('sha256').update(String(body ?? '')).digest('hex')}`

const GIT_ENV_RE = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|PREFIX|NAMESPACE|CEILING_DIRECTORIES|IMPLICIT_WORK_TREE|DISCOVERY_ACROSS_FILESYSTEM)$/
export const cleanGitEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_ENV_RE.test(k)))

// The ONE spawn every adapter uses. `label` names the command in a failure (never the resolved
// binary path — a stubbed binary in a test must not change a reason string).
export function runCli({ bin, args, input, label }) {
  const r = spawnSync(bin, args, { encoding: 'utf8', input, env: cleanGitEnv(process.env) })
  if (r.error || r.status !== 0) {
    throw new HostError('failed', {
      message: `${label ?? bin} ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`,
      command: `${label ?? bin} ${args.join(' ')}`,
      detail: (r.stderr || r.error?.message || '').trim(),
    })
  }
  return r.stdout
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
  const { hits } = findByMarker(list(), marker)
  if (hits.length > 1) return { error: 'marker-ambiguous', ids: hits.map(h => h.id), marker }
  if (hits.length === 1) {
    if (hits[0].body === full) return { action: 'unchanged', id: hits[0].id, url: hits[0].url, marker }
    const res = update(hits[0], full)
    return { action: 'updated', id: res.id, url: res.url, marker }
  }
  const res = create(full)
  return { action: 'created', id: res.id, url: res.url, marker }
}

// ── defineAdapter ─────────────────────────────────────────────────────────────────────────────
// `spec`:
//   id          the canonical tool id this file implements (the file name without `.mjs`)
//   aliases     every way-of-working spelling that names this product (pm-resolution alias row)
//   hostsCode   whether the tool hosts repositories/PRs (ADR-018: omitted `code-host` ⇒ the PM tool)
//   binaries    the CLI(s) the adapter spawns — CLI-first (AC6), nothing else is ever spawned
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
      if ('cardHash' in methods) throw new HostError('adapter-error', { message: `adapter ${spec.id} must not define cardHash — it is derived from readCard (AC5)`, adapter: spec.id, method: 'cardHash' })
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
