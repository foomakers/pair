// filesystem.mjs — the Filesystem PM adapter (US-572): cards are the markdown files of the adopted
// backlog (`.pair/adoption/product/backlog/`, filesystem-implementation.md). PM side only
// (`hostsCode: false`): pull requests, checks and merge go to the declared `code-host`.
//
//   id          the file name's leading id — `<id>.md` or `<id>-<slug>.md` (`01-01-001`, `IN-01`)
//   state       the status folder (`not-started | in-progress | under-review | completed`) AND the
//               first `**Status**:` line
//   labels      the first `**Labels**:` line, comma-separated
//   comments    marker-keyed blocks after `<!-- pair-comments -->` at the end of the file
//   body        the file minus those three — what `cardHash` hashes, so a state, label or comment
//               write never changes the card's acHash
//
// Root: `transport.root`, else PAIR_PM_ROOT, else the git top level of the cwd. Inside a linked git
// worktree (a card's story tree) every write is committed on that tree's branch; anywhere else the
// write stays in the working tree and one warning line goes to stderr. The only CLI is `git`, through
// the kit's runCli (ADR-026 amendment 2026-10-24); no credential exists.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { defineAdapter, assertCardId, runCli, upsertByMarker, HostError } from './adapter-kit.mjs'

export const BACKLOG_REL = join('.pair', 'adoption', 'product', 'backlog')
export const STATE_FOLDERS = ['not-started', 'in-progress', 'under-review', 'completed']
const FOLDER_OF = { todo: 'not-started', backlog: 'not-started', refined: 'not-started', ready: 'not-started', 'not-started': 'not-started', 'in-progress': 'in-progress', 'in-review': 'under-review', 'under-review': 'under-review', review: 'under-review', done: 'completed', completed: 'completed' }
const COMMENTS = '<!-- pair-comments -->'
const STATUS_RE = /^\*\*Status\*\*:[^\n]*$/m
const LABELS_RE = /^\*\*Labels\*\*:([^\n]*)$/m
const fail = (kind, message, method) => new HostError(kind, { message: `fs: ${message}`, ...(method ? { method } : {}) })

// The id guard, before any fs access (adapter-kit's assertCardId), under this adapter's errorPrefix.
const cardId = ref => {
  try {
    return assertCardId(ref)
  } catch (e) {
    throw fail('invalid-input', `card id ${e.message}`, 'parseCardRef')
  }
}

const split = text => {
  const at = text.indexOf(COMMENTS)
  return at < 0 ? { head: text, tail: '' } : { head: text.slice(0, at), tail: text.slice(at + COMMENTS.length) }
}
const parseComments = tail =>
  [...tail.matchAll(/<!-- comment:(\d+) -->\n([\s\S]*?)\n<!-- \/comment:\1 -->/g)].map(m => ({ id: Number(m[1]), body: m[2] }))
const renderComments = list => (list.length ? `\n${COMMENTS}\n${list.map(c => `<!-- comment:${c.id} -->\n${c.body}\n<!-- /comment:${c.id} -->`).join('\n')}\n` : '')
const labelsOf = head => (LABELS_RE.exec(head)?.[1] ?? '').split(',').map(l => l.trim().replace(/^`|`$/g, '')).filter(Boolean)
const statusOf = head => (STATUS_RE.exec(head)?.[0] ?? '').replace(/^\*\*Status\*\*:/, '').trim()
const setLine = (head, re, line) => (re.test(head) ? head.replace(re, line) : head.replace(/^(# [^\n]*\n)?/, m => `${m}\n${line}\n`))
const norm = s => String(s ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')

export default defineAdapter({
  id: 'filesystem',
  aliases: ['file-system', 'local-filesystem'],
  hostsCode: false,
  binaries: ['git'],
  create(transport = {}) {
    const gitBin = transport.gitBin || 'git'
    const git = (cwd, args) => {
      try {
        return { status: 0, stdout: runCli({ bin: gitBin, args: ['-C', cwd, ...args], label: 'git' }) }
      } catch (e) {
        return { status: 1, stdout: '', stderr: e.detail ?? e.message }
      }
    }
    const top = () => {
      const r = git(process.cwd(), ['rev-parse', '--show-toplevel'])
      return r.status === 0 ? r.stdout.trim() : process.cwd()
    }
    const root = transport.root ?? process.env.PAIR_PM_ROOT ?? top()
    const backlog = join(root, BACKLOG_REL)
    // A linked worktree has its own git dir, distinct from the common one.
    const inWorktree = () => {
      const r = git(root, ['rev-parse', '--git-dir', '--git-common-dir'])
      if (r.status !== 0) return false
      const [d, c] = r.stdout.trim().split('\n')
      return d !== c
    }
    const persist = (id, paths, what) => {
      if (!inWorktree()) {
        process.stderr.write(`fs: warning — card ${id} written in ${root} (no story worktree): commit it yourself\n`)
        return
      }
      const rel = paths.map(p => relative(root, p))
      if (git(root, ['add', '-A', '--', ...rel]).status !== 0) throw fail('failed', `git add ${rel.join(' ')} failed in ${root}`)
      if (git(root, ['diff', '--cached', '--quiet', '--', ...rel]).status === 0) return
      const c = git(root, ['commit', '-m', `[#${id}] chore: card ${what}`, '--', ...rel])
      if (c.status !== 0) throw fail('failed', `git commit failed in ${root}: ${String(c.stderr).trim()}`)
    }

    const files = (dir = backlog) => {
      if (!existsSync(dir)) return []
      return readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []))
    }
    const idOf = file => basename(file, '.md')
    // `<id>-<rest>` where `<rest>` opens on a numeric segment is a CHILD card's file, never this card's.
    const isChild = (file, id) => idOf(file).startsWith(`${id}-`) && /^\d+(-|$)/.test(idOf(file).slice(id.length + 1))
    const matches = (file, id) => idOf(file) === id || (idOf(file).startsWith(`${id}-`) && !isChild(file, id))
    // Exact `<id>.md` wins; otherwise the ONE `<id>-…` file whose id is not a longer id (`01-01` never
    // resolves to `01-01-001-…`: a story under that epic). Two candidates ⇒ refused, never guessed.
    const locate = (ref, { optional = false } = {}) => {
      const id = cardId(ref)
      const all = files().filter(f => matches(f, id))
      const exact = all.filter(f => idOf(f) === id)
      const hits = exact.length ? exact : all
      if (hits.length === 1) return { id, file: hits[0] }
      if (optional && hits.length === 0) return null
      throw fail('failed', hits.length ? `card ${id} is ambiguous: ${hits.map(f => relative(root, f)).join(', ')}` : `card ${id} not found under ${relative(root, backlog) || backlog}`, 'readCard')
    }
    const load = ref => {
      const at = locate(ref)
      const text = readFileSync(at.file, 'utf8')
      const { head, tail } = split(text)
      return { ...at, head, comments: parseComments(tail) }
    }
    const save = (c, { head = c.head, comments = c.comments, file = c.file } = {}) => {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, head.replace(/\n*$/, '\n') + renderComments(comments))
    }
    const bodyOf = head => `${head.replace(STATUS_RE, '').replace(LABELS_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
    const closed = c => basename(dirname(c.file)) === 'completed' || norm(statusOf(c.head)) === 'done'
    const view = c => ({
      id: c.id,
      number: c.id,
      url: relative(root, c.file),
      title: (/^# (.*)$/m.exec(c.head)?.[1] ?? c.id).trim(),
      body: bodyOf(c.head),
      labels: labelsOf(c.head).map(name => ({ name })),
      state: closed(c) ? 'CLOSED' : 'OPEN',
      stateReason: closed(c) ? 'COMPLETED' : null,
      closedAt: null,
      status: statusOf(c.head),
    })
    // State = folder (when the file lives in a status folder) + the Status line.
    const writeState = (c, state) => {
      const folder = FOLDER_OF[norm(state)]
      if (!folder) return { applied: state, confirmed: false, error: `no status folder maps to ${JSON.stringify(state)} (known: ${Object.keys(FOLDER_OF).join(', ')})` }
      const head = setLine(c.head, STATUS_RE, `**Status**: ${state}`)
      const inFolder = STATE_FOLDERS.includes(basename(dirname(c.file)))
      const target = inFolder ? join(dirname(dirname(c.file)), folder, basename(c.file)) : c.file
      save(c, { head })
      if (target !== c.file) {
        mkdirSync(dirname(target), { recursive: true })
        renameSync(c.file, target)
      }
      persist(c.id, [...new Set([c.file, target])], `state → ${state}`)
      const now = load(c.id)
      const ok = statusOf(now.head) === state && now.file === target
      return { applied: state, confirmed: ok, error: ok ? null : `read-back: ${relative(root, now.file)} Status ${JSON.stringify(statusOf(now.head))}` }
    }
    const writeLabels = (ref, edit) => {
      const c = load(ref)
      const next = edit(labelsOf(c.head))
      save(c, { head: setLine(c.head, LABELS_RE, `**Labels**: ${next.join(', ')}`) })
      persist(c.id, [c.file], 'labels')
      return labelsOf(load(ref).head)
    }
    const codeSide = method => () => {
      throw new HostError('unsupported', { message: `fs: ${method} is a code-host operation — declare \`code-host\` in way-of-working.md → ## Git Workflow`, method })
    }

    return {
      errorPrefix: 'fs',
      root,
      parseCardRef(ref) {
        const id = cardId(ref)
        return { id, number: id, inScope: true }
      },
      readCard(ref, { fields } = {}) {
        const v = view(load(ref))
        return fields ? Object.fromEntries(fields.map(f => [f, v[f]])) : { body: v.body }
      },
      findCards({ search } = {}) {
        return files()
          .filter(f => readFileSync(f, 'utf8').includes(String(search ?? '')))
          .map(f => view(load(idOf(f))))
          .map(({ number, url, title, body }) => ({ number, url, title, body }))
      },
      updateCard({ id, body }) {
        const c = load(id)
        let head = String(body ?? '')
        const status = STATUS_RE.exec(c.head)?.[0]
        const labels = LABELS_RE.exec(c.head)?.[0]
        if (status) head = setLine(head, STATUS_RE, status)
        if (labels) head = setLine(head, LABELS_RE, labels)
        save(c, { head })
        persist(c.id, [c.file], 'body')
        return { id: c.id }
      },
      readLabels({ id, pr } = {}) {
        return labelsOf(load(id ?? pr).head)
      },
      labelCard({ id, label }) {
        try {
          const now = writeLabels(id, l => (l.includes(label) ? l : [...l, label]))
          return { applied: label, confirmed: now.includes(label), error: now.includes(label) ? null : `read-back: label ${JSON.stringify(label)} is not on card ${id}` }
        } catch (e) {
          return { applied: label, confirmed: false, error: e.message }
        }
      },
      unlabelCard({ id, label }) {
        try {
          const now = writeLabels(id, l => l.filter(x => x !== label))
          return { removed: label, confirmed: !now.includes(label), error: now.includes(label) ? `read-back: label ${JSON.stringify(label)} is still on card ${id}` : null }
        } catch (e) {
          return { removed: label, confirmed: false, error: e.message }
        }
      },
      setBoardState({ id, state }) {
        try {
          return writeState(load(id), state)
        } catch (e) {
          return { applied: state, confirmed: false, error: e.message }
        }
      },
      commentOnCard({ id, marker, body }) {
        const c = load(id)
        return upsertByMarker({
          marker,
          body,
          max: 65536,
          list: () => c.comments.map(x => ({ ...x, url: `${relative(root, c.file)}#comment-${x.id}` })),
          update: (hit, full) => {
            save(c, { comments: c.comments.map(x => (x.id === hit.id ? { ...x, body: full } : x)) })
            persist(c.id, [c.file], 'comment')
            return { id: hit.id, url: hit.url }
          },
          create: full => {
            const nid = Math.max(0, ...c.comments.map(x => x.id)) + 1
            save(c, { comments: [...c.comments, { id: nid, body: full }] })
            persist(c.id, [c.file], 'comment')
            return { id: nid, url: `${relative(root, c.file)}#comment-${nid}` }
          },
        })
      },
      // Done, then up the id hierarchy (`01-01-001` → `01-01` → `01`): a parent whose child cards are
      // ALL closed is closed too. Inside a story worktree only the card closes — the cascade runs at
      // merge, on the default branch, where every sibling's state is visible (parallel cards).
      closeAndCascade({ id }) {
        const first = load(id)
        const r = writeState(first, 'Done')
        if (!r.confirmed) throw fail('failed', r.error, 'closeAndCascade')
        const done = [first.id]
        if (inWorktree()) return { closed: done, stoppedAt: null, cascade: 'deferred-to-merge' }
        let child = first.id
        for (;;) {
          const pid = child.includes('-') ? child.slice(0, child.lastIndexOf('-')) : null
          const parent = pid && locate(pid, { optional: true })
          if (!parent) return { closed: done, stoppedAt: null }
          const kids = files().filter(f => isChild(f, pid))
          if (kids.some(f => !closed({ file: f, head: split(readFileSync(f, 'utf8')).head }))) return { closed: done, stoppedAt: pid }
          const pr = writeState(load(pid), 'Done')
          if (!pr.confirmed) throw fail('failed', pr.error, 'closeAndCascade')
          done.push(pid)
          child = pid
        }
      },

      // ── code side: never this adapter's (hostsCode: false) ──
      prHead: codeSide('prHead'),
      upsertComment: codeSide('upsertComment'),
      concludeCheck: codeSide('concludeCheck'),
      setPrState: codeSide('setPrState'),
      merge: codeSide('merge'),
    }
  },
})
