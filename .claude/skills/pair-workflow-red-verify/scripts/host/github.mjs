// github.mjs — the GitHub adapter (US-492 T-2): an EXTRACTION, not a rewrite. Every `gh` call the
// cycle scripts made before US-492 lives here with its argv unchanged — `pr-comment.mjs`'s comment
// list/post/edit, `pr-state.mjs`'s commit status + label swap, `cycle-state.mjs`'s card read,
// search, create, edit and single-comment read — plus the three interface methods the scripts had
// no call site for yet (`prHead`, `merge`, `closeAndCascade`), spelled per github-implementation.md
// and merge-and-cascade.md. CHECK_CONTEXT and STATE_LABELS stay GitHub constants, here.
//
// Transport: `gh` from PATH, or `transport.ghBin` / PAIR_GH_BIN (a test's recorder). `gh`
// authenticates itself; this file never reads a token.
import { defineAdapter, runCli, parseJson, HostError, upsertByMarker, splitPages } from './adapter-kit.mjs'

export const CHECK_CONTEXT = 'pair-review'
export const STATE_LABELS = ['pr-state:to-be-reviewed', 'pr-state:ready-to-merge', 'pr-state:not-approved']
// GitHub caps an issue comment at 65536 characters; a longer body is refused before any write, and
// the body travels on stdin (`--input -`), never as one argv (E2BIG above 128 KiB; t9d-22).
export const MAX_COMMENT_CHARS = 65536

const ISSUE_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/
const COMMENT_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:pull|issues)\/(\d+)#issuecomment-(\d+)$/
const SHA_RE = /^[0-9a-f]{40}$/
const apiRepo = repo => (repo ? `repos/${repo}` : 'repos/{owner}/{repo}')

export default defineAdapter({
  id: 'github',
  aliases: ['github-projects', 'github-enterprise'],
  hostsCode: true,
  binaries: ['gh'],
  create(transport = {}) {
    const bin = transport.ghBin || process.env.PAIR_GH_BIN || 'gh'
    const gh = (args, { input } = {}) => runCli({ bin, args, input, label: 'gh' })
    const withRepo = (args, repo) => (repo ? [...args, '--repo', repo] : args)

    const listComments = ({ pr, repo }) => {
      const out = gh(['api', '--paginate', `${apiRepo(repo)}/issues/${pr}/comments`])
      let pages
      try {
        pages = splitPages(out)
      } catch (e) {
        throw new HostError('invalid-json', { message: e.message, command: 'gh api --paginate' })
      }
      return pages.flat().map(c => ({ id: c.id, body: String(c.body ?? ''), url: c.html_url }))
    }
    const readCheck = ({ sha, repo, context = CHECK_CONTEXT }) => {
      const combined = JSON.parse(gh(['api', `${apiRepo(repo)}/commits/${sha}/status`]))
      const own = (combined.statuses ?? []).filter(s => s.context === context)
      return own.length ? String(own[own.length - 1].state) : null
    }
    const readLabels = ({ pr, repo }) => JSON.parse(gh(['api', `${apiRepo(repo)}/issues/${pr}/labels`])).map(l => String(l.name))
    const closeIssue = (id, repo) => gh(withRepo(['issue', 'close', String(id), '--reason', 'completed'], repo))
    const subIssues = (id, repo) => parseJson(gh(['api', `${apiRepo(repo)}/issues/${id}/sub_issues`]), { command: 'gh api sub_issues' })
    // The parent of an issue through the REST sub-issues API. A 404 means "no parent"; any other
    // failure stops the cascade and is reported (never guessed into "no parent").
    const parentOf = (id, repo) => {
      try {
        const p = parseJson(gh(['api', `${apiRepo(repo)}/issues/${id}/parent`]), { command: 'gh api parent' })
        return Number.isInteger(p?.number) ? p.number : null
      } catch (e) {
        if (e.kind === 'failed' && /\b404\b|Not Found/i.test(e.detail)) return null
        throw e
      }
    }

    return {
      checkContext: CHECK_CONTEXT,
      stateLabels: STATE_LABELS,
      errorPrefix: 'gh',

      // ── card side (pm-tool) ──
      // No `fields`: the raw body exactly as `gh … -q .body` prints it (the card-hash input).
      // `fields`: the parsed `--json <fields>` object.
      readCard(id, { repo, fields } = {}) {
        const base = withRepo(['issue', 'view', String(id)], repo)
        if (!fields) {
          try {
            return { body: gh([...base, '--json', 'body', '-q', '.body']) }
          } catch (e) {
            e.command = `gh issue view ${id}`
            throw e
          }
        }
        return parseJson(gh([...base, '--json', fields.join(',')]), { command: 'gh issue view' })
      },
      findCards({ repo, search }) {
        const rows = parseJson(gh(['issue', 'list', '--repo', repo, '--search', search, '--json', 'number,url,title,body']), { command: 'gh issue list' })
        return Array.isArray(rows) ? rows : []
      },
      createCard({ repo, title, body }) {
        const out = gh(['issue', 'create', '--repo', repo, '--title', title, '--body', body])
        return { url: out.trim().split('\n').pop() }
      },
      updateCard({ repo, id, body }) {
        gh(['issue', 'edit', String(id), '--repo', repo, '--body', body])
        return { id }
      },
      parseCardRef(ref, { repo } = {}) {
        const m = ISSUE_URL_RE.exec(String(ref ?? ''))
        return m ? { number: Number(m[3]), inScope: `${m[1]}/${m[2]}` === repo } : null
      },
      // Close the card (`completed`), then walk up: a parent whose sub-issues are ALL closed is
      // closed too, recursively (merge-and-cascade.md Steps 6.2–6.4). Board state is the caller's.
      closeAndCascade({ id, repo }) {
        closeIssue(id, repo)
        const closed = [Number(id)]
        let child = Number(id)
        for (;;) {
          const parent = parentOf(child, repo)
          if (parent === null) return { closed, stoppedAt: null }
          const siblings = subIssues(parent, repo)
          if (!Array.isArray(siblings) || siblings.some(s => s.state !== 'closed')) return { closed, stoppedAt: parent }
          closeIssue(parent, repo)
          closed.push(parent)
          child = parent
        }
      },

      // ── pull-request side (code-host) ──
      prHead({ pr, repo }) {
        const out = gh(withRepo(['pr', 'view', String(pr)], repo).concat(['--json', 'headRefOid', '-q', '.headRefOid'])).trim()
        if (!SHA_RE.test(out)) throw new HostError('invalid-output', { message: `gh pr view ${pr}: head is not a 40-hex sha: ${JSON.stringify(out)}` })
        return out
      },
      listComments,
      upsertComment({ pr, marker, body, repo }) {
        return upsertByMarker({
          marker,
          body,
          max: MAX_COMMENT_CHARS,
          list: () => listComments({ pr, repo }),
          update: (hit, full) => {
            const res = JSON.parse(gh(['api', '-X', 'PATCH', `${apiRepo(repo)}/issues/comments/${hit.id}`, '--input', '-'], { input: JSON.stringify({ body: full }) }))
            return { id: res.id, url: res.html_url }
          },
          create: full => {
            const res = JSON.parse(gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${pr}/comments`, '--input', '-'], { input: JSON.stringify({ body: full }) }))
            return { id: res.id, url: res.html_url }
          },
        })
      },
      readComment({ id, repo }) {
        const c = parseJson(gh(['api', `repos/${repo}/issues/comments/${id}`]), { command: 'gh api comment' })
        const pr = /\/issues\/(\d+)$/.exec(String(c?.issue_url ?? ''))?.[1]
        return { body: c?.body, authorLogin: c?.user?.login, authorIsUser: c?.user?.type === 'User', pr: pr === undefined ? null : Number(pr) }
      },
      parseCommentRef(ref, { repo } = {}) {
        const m = COMMENT_URL_RE.exec(String(ref ?? ''))
        return m ? { pr: Number(m[3]), id: m[4], inScope: `${m[1]}/${m[2]}` === repo } : null
      },
      commentRef({ repo, pr, id }) {
        return `https://github.com/${repo}/pull/${Number(pr)}#issuecomment-${id}`
      },
      readCheck,
      readLabels,
      // The required check on the EXACT head sha (a commit status). A refused write is reported, not
      // thrown: a token without `repo:status` degrades to advisory (github-implementation.md).
      concludeCheck({ sha, repo, state, description, targetUrl, context = CHECK_CONTEXT }) {
        const args = ['api', '-X', 'POST', `${apiRepo(repo)}/statuses/${sha}`, '-f', `state=${state}`, '-f', `context=${context}`]
        if (description) args.push('-f', `description=${String(description).slice(0, 140)}`)
        if (targetUrl) args.push('-f', `target_url=${targetUrl}`)
        try {
          gh(args)
          return { context, sha, state, published: true, error: null }
        } catch (e) {
          return { context, sha, state, published: false, error: e.message }
        }
      },
      // Exactly one state label: the others removed, this one added, then READ BACK — a label API
      // that silently no-ops must not render a state the PR does not carry.
      setPrState({ pr, repo, label }) {
        try {
          const before = readLabels({ pr, repo })
          const removed = before.filter(l => STATE_LABELS.includes(l) && l !== label)
          for (const l of removed) gh(['api', '-X', 'DELETE', `${apiRepo(repo)}/issues/${pr}/labels/${encodeURIComponent(l)}`])
          if (!before.includes(label)) gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${pr}/labels`, '--input', '-'], { input: JSON.stringify({ labels: [label] }) })
          const after = readLabels({ pr, repo })
          const confirmed = after.includes(label) && !after.some(l => STATE_LABELS.includes(l) && l !== label)
          return { applied: label, removed, confirmed, error: confirmed ? null : `read-back: labels are ${JSON.stringify(after)}` }
        } catch (e) {
          return { applied: label, removed: [], confirmed: false, error: e.message }
        }
      },
      // merge-and-cascade.md CLI fallback: `gh pr merge <n> --squash --subject <title> --body <body>`.
      merge({ pr, repo, strategy = 'squash', message = '' }) {
        if (!['squash', 'merge', 'rebase'].includes(strategy)) throw new HostError('unsupported', { message: `merge strategy ${JSON.stringify(strategy)} (expected squash | merge | rebase)`, method: 'merge' })
        const [subject, ...rest] = String(message).split('\n')
        const args = withRepo(['pr', 'merge', String(pr), `--${strategy}`], repo)
        if (subject) args.push('--subject', subject)
        if (rest.join('\n').trim()) args.push('--body', rest.join('\n').replace(/^\n+/, ''))
        gh(args)
        return { merged: true, pr: Number(pr), strategy }
      },
    }
  },
})
