// github.mjs — the GitHub adapter (US-492 T-2): an EXTRACTION, not a rewrite. Every `gh` call the
// cycle scripts made before US-492 lives here with its argv unchanged — `pr-comment.mjs`'s comment
// list/post/edit, `pr-state.mjs`'s commit status + label swap, `cycle-state.mjs`'s card read,
// search, create, edit and single-comment read — plus the three interface methods the scripts had
// no call site for yet (`prHead`, `merge`, `closeAndCascade`), spelled per github-implementation.md
// and merge-and-cascade.md. CHECK_CONTEXT and STATE_LABELS stay GitHub constants, here.
//
// Transport: `gh` from PATH, or `transport.ghBin` / PAIR_GH_BIN (a test's recorder). `gh`
// authenticates itself; this file never reads a token.
import { defineAdapter, assertBranchName, runCli, parseJson, HostError, upsertByMarker, splitPages, splitObjectPages, CLASSIFICATION_FAMILIES, updateEpicBody, adoptionText, prLinks, resolveLinked } from './adapter-kit.mjs'

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
    // A write that needs an explicit `--repo` never sends an empty one: the given slug, else the
    // current checkout's (`gh repo view`), else a typed refusal BEFORE the write.
    const SLUG_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
    const resolveRepo = repo => {
      if (repo !== undefined && repo !== null && repo !== '') {
        if (!SLUG_RE.test(String(repo))) throw new HostError('invalid-input', { message: `github: --repo must be owner/name, got ${JSON.stringify(repo)}` })
        return String(repo)
      }
      let out = ''
      try {
        out = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim()
      } catch {
        out = ''
      }
      if (!SLUG_RE.test(out)) throw new HostError('invalid-input', { message: 'github: repo unresolved — no --repo given and `gh repo view` could not resolve one; nothing was written (pass --repo owner/name)' })
      return out
    }
    const adoption = () => transport.wayOfWorking ?? adoptionText(process.cwd())
    const storyLabel = () => transport.storyLabel ?? /`story-label`\s*:\s*`([^`]+)`/.exec(adoption())?.[1] ?? null
    // The adopted board, never guessed from prose: `pm-project` (full title or number) among the owner's
    // projects; absent, the one open project linked to the repository; otherwise a typed gap.
    const LINKED_QUERY = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){projectsV2(first:20){nodes{id title number closed}}}}'
    const findBoard = slug => {
      const [owner, name] = slug.split('/')
      const declared = /`pm-project`\s*:\s*`([^`]+)`/.exec(adoption())?.[1]?.trim()
      if (declared) {
        const projects = parseJson(gh(['project', 'list', '--owner', owner, '--limit', '1000', '--format', 'json']), { command: 'gh project list' })?.projects ?? []
        const hits = projects.filter(p => p?.title === declared || [String(p?.number), `#${p?.number}`].includes(declared))
        return hits.length === 1 && hits[0].id ? { id: hits[0].id, title: hits[0].title } : { gap: 'board-unresolved', error: `pm-project ${JSON.stringify(declared)} matched ${hits.length} projects of ${owner}` }
      }
      const q = parseJson(gh(['api', 'graphql', '-f', `query=${LINKED_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`]), { command: 'gh api graphql projects' })
      const linked = (q?.data?.repository?.projectsV2?.nodes ?? []).filter(p => p?.id && !p.closed)
      return linked.length === 1 ? { id: linked[0].id, title: linked[0].title } : { gap: 'board-unconfigured', error: `no \`pm-project\` in way-of-working.md and ${slug} links ${linked.length} open projects` }
    }
    const boards = new Map()
    const resolveBoard = repo => {
      const slug = resolveRepo(repo)
      if (!boards.has(slug)) boards.set(slug, findBoard(slug))
      return boards.get(slug)
    }
    const pulls = new Map()

    const listComments = ({ pr, repo }) => {
      const out = gh(['api', '--paginate', `${apiRepo(repo)}/issues/${pr}/comments`])
      let pages
      try {
        pages = splitPages(out)
      } catch (e) {
        throw new HostError('invalid-json', { message: e.message, command: 'gh api --paginate' })
      }
      // The author as the host reports it (US-647) — the CREATOR — and the timestamps that prove the body was never edited since.
      return pages.flat().map(c => ({ id: c.id, body: String(c.body ?? ''), url: c.html_url, authorLogin: c.user?.login, authorIsUser: c.user?.type === 'User', createdAt: c.created_at, updatedAt: c.updated_at }))
    }
    const readCheck = ({ sha, repo, context = CHECK_CONTEXT }) => {
      const combined = JSON.parse(gh(['api', `${apiRepo(repo)}/commits/${sha}/status`]))
      const own = (combined.statuses ?? []).filter(s => s.context === context)
      if (own.length) return String(own[own.length - 1].state)
      return null
    }
    // A required check may be published as a CHECK RUN (a workflow job) rather than a commit status:
    // `conclusion` is its verdict (`success`, `failure`, …); a run still in flight has none and reads
    // `pending`. The most recent run of that name wins. No run either ⇒ null.
    const readCheckRun = ({ sha, repo, context }) => {
      const out = JSON.parse(gh(['api', `${apiRepo(repo)}/commits/${sha}/check-runs?check_name=${encodeURIComponent(context)}`]))
      const runs = (out.check_runs ?? []).filter(r => r.name === context).sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')))
      if (!runs.length) return null
      const last = runs[runs.length - 1]
      return last.status === 'completed' ? String(last.conclusion ?? 'pending') : 'pending'
    }
    // AL: EVERY CI check on the head (check runs AND commit statuses), as `{ name, conclusion }` with the conclusion folded to
    // success | failure | pending. The most recent run of a name wins; neutral/skipped count as success; a run still in flight,
    // or any status/conclusion this map does not know, is NOT green (cancelled, timed_out, action_required… ⇒ failure).
    const readCiChecks = ({ sha, repo }) => {
      const byName = new Map()
      // `--paginate`: more than one page of runs/statuses must not hide a failing check on a later page.
      const pagesOf = path => {
        try {
          return splitObjectPages(gh(['api', '--paginate', path]))
        } catch (e) {
          throw new HostError('invalid-json', { message: e.message, command: 'gh api --paginate' })
        }
      }
      const runs = pagesOf(`${apiRepo(repo)}/commits/${sha}/check-runs?per_page=100`).flatMap(page => page.check_runs ?? [])
      for (const r of [...runs].sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')))) {
        const conclusion = r.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(r.conclusion) ? 'success' : 'failure'
        byName.set(String(r.name), { conclusion, url: r.html_url ?? r.details_url ?? null })
      }
      const statuses = pagesOf(`${apiRepo(repo)}/commits/${sha}/status?per_page=100`).flatMap(page => page.statuses ?? [])
      for (const st of statuses) {
        const name = String(st.context)
        if (!byName.has(name)) byName.set(name, { conclusion: st.state === 'success' ? 'success' : st.state === 'pending' ? 'pending' : 'failure', url: st.target_url ?? null })
      }
      // #691 AC4: the url travels with the conclusion, so a remote failure can be reported where it can be read.
      return [...byName].map(([name, c]) => ({ name, ...c }))
    }
    const readLabels = ({ pr, repo }) => JSON.parse(gh(['api', `${apiRepo(repo)}/issues/${pr}/labels`])).map(l => String(l.name))
    // True only on a host-confirmed merge (`mergedAt` set): closed-unmerged and unreadable are false / thrown.
    const isMerged = ({ pr, repo }) => {
      return Boolean(parseJson(gh(withRepo(['pr', 'view', String(pr)], repo).concat(['--json', 'mergedAt'])), { command: 'gh pr view' })?.mergedAt)
    }
    const mergedSafe = a => {
      try {
        return isMerged(a)
      } catch {
        return false // unreadable PR: the open-PR write path decides, as before
      }
    }
    // Post-merge cleanup: every premerge state label removed, foreign labels untouched, then READ BACK absence.
    const clearPrState = ({ pr, repo }) => {
      try {
        const removed = readLabels({ pr, repo }).filter(l => STATE_LABELS.includes(l))
        for (const l of removed) gh(['api', '-X', 'DELETE', `${apiRepo(repo)}/issues/${pr}/labels/${encodeURIComponent(l)}`])
        const after = readLabels({ pr, repo })
        const confirmed = !after.some(l => STATE_LABELS.includes(l))
        return { applied: null, removed, confirmed, error: confirmed ? null : `read-back: labels are ${JSON.stringify(after)}` }
      } catch (e) {
        return { applied: null, removed: [], confirmed: false, error: e.message }
      }
    }
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

    // Marker-keyed upsert on ONE issue-or-PR thread (GitHub serves both from `issues/<n>/comments`).
    const upsertOnIssue = ({ number, marker, body, repo }) =>
      upsertByMarker({
        marker,
        body,
        max: MAX_COMMENT_CHARS,
        list: () => listComments({ pr: number, repo }),
        update: (hit, full) => {
          const res = JSON.parse(gh(['api', '-X', 'PATCH', `${apiRepo(repo)}/issues/comments/${hit.id}`, '--input', '-'], { input: JSON.stringify({ body: full }) }))
          return { id: res.id, url: res.html_url }
        },
        create: full => {
          const res = JSON.parse(gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${number}/comments`, '--input', '-'], { input: JSON.stringify({ body: full }) }))
          return { id: res.id, url: res.html_url }
        },
      })
    // A listing is read one bounded page at a time (never `--paginate` into one buffer).
    const listPages = path => {
      const rows = []
      for (let page = 1; ; page++) {
        const batch = parseJson(gh(['api', `${path}&per_page=100&page=${page}`]), { command: 'gh api' })
        if (!Array.isArray(batch)) throw new HostError('invalid-output', { message: 'gh api: listing page is not an array', command: 'gh api' })
        rows.push(...batch)
        if (batch.length < 100) return rows
      }
    }
    const BOARD_QUERY = 'query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){id projectItems(first:20){nodes{id project{id title fields(first:30){nodes{... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}}}'
    const BOARD_MUTATION = 'mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}'

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
      // Board facts (cardState) come from the adopted project only; an unresolved board holds no item.
      // The user's repository role (`admin`, `maintain`, `write`, …) as the server reports it now; null when
      // unreadable — the board workflow's authorization (#642 Maintainer Decision) treats null as deny.
      readPermission({ repo, user }) {
        try {
          const p = parseJson(gh(['api', `repos/${resolveRepo(repo)}/collaborators/${user}/permission`, '--method', 'GET']), { command: 'gh api permission' })
          return p?.role_name ?? p?.permission ?? null
        } catch {
          return null
        }
      },
      // A resolution error propagates (a transient failure is never "not a member").
      boardItems({ items, repo }) {
        const board = resolveBoard(repo)
        return board.gap ? { gap: board.gap, error: board.error } : items.filter(item => item?.title === board.title)
      },
      findCards({ repo, search }) {
        const rows = parseJson(gh(['issue', 'list', '--repo', resolveRepo(repo), '--search', search, '--json', 'number,url,title,body']), { command: 'gh issue list' })
        return Array.isArray(rows) ? rows : []
      },
      listCards({ repo }) {
        const label = storyLabel()
        return listPages(`${apiRepo(repo)}/issues?state=all`).filter(issue => !issue.pull_request && (/^## Story Statement\s*$/m.test(String(issue.body ?? '')) || (label && issue.labels?.some(item => item.name === label)))).map(issue => ({ id: String(issue.number) }))
      },
      linkedPr({ id, repo }) {
        // One listing per repository per adapter instance: an audit asks for every card.
        const key = apiRepo(repo)
        if (!pulls.has(key)) pulls.set(key, listPages(`${key}/pulls?state=all`))
        // Same-repository PRs only (Maintainer Decision): a fork's PR never moves or closes a card.
        const sameRepo = pr => Boolean(pr.head?.repo?.full_name) && pr.head.repo.full_name === pr.base?.repo?.full_name
        const state = pr => (pr.merged_at ? 'merged' : pr.state === 'open' ? 'open' : pr.state === 'closed' ? 'closed-unmerged' : 'unknown')
        return resolveLinked(pulls.get(key).filter(sameRepo).map(pr => ({ number: pr.number, links: prLinks({ body: pr.body, branch: pr.head?.ref }), state: state(pr) })), id)
      },
      createCard({ repo, title, body }) {
        const out = gh(['issue', 'create', '--repo', resolveRepo(repo), '--title', title, '--body', body])
        return { url: out.trim().split('\n').pop() }
      },
      updateCard({ repo, id, body }) {
        gh(['issue', 'edit', String(id), '--repo', resolveRepo(repo), '--body', body])
        return { id }
      },
      // A bare `#?<n>` is a card of the bound repo (US-572: `--root`/`--story` are validated here).
      parseCardRef(ref, { repo } = {}) {
        const bare = /^#?(\d+)$/.exec(String(ref ?? ''))
        if (bare) return { id: bare[1], number: Number(bare[1]), inScope: true }
        const m = ISSUE_URL_RE.exec(String(ref ?? ''))
        if (!m) return null
        let bound = repo
        if (bound === undefined) try { bound = resolveRepo() } catch { /* unresolved: foreign, fail closed */ }
        return { id: m[3], number: Number(m[3]), inScope: `${m[1]}/${m[2]}` === bound }
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
      closeCard({ id, repo, reason }) {
        try {
          const wanted = reason === 'merged' ? 'completed' : reason === 'unmerged' ? 'not planned' : null
          if (!wanted) return { confirmed: false, error: `unknown close reason ${JSON.stringify(reason)}` }
          const before = parseJson(gh(withRepo(['issue', 'view', String(id)], repo).concat(['--json', 'state,stateReason'])), { command: 'gh issue view' })
          if (before.state !== 'CLOSED' || String(before.stateReason).toLowerCase().replace('_', ' ') !== wanted) gh(withRepo(['issue', 'close', String(id), '--reason', wanted], repo))
          const after = parseJson(gh(withRepo(['issue', 'view', String(id)], repo).concat(['--json', 'state,stateReason'])), { command: 'gh issue view' })
          const confirmed = after.state === 'CLOSED' && String(after.stateReason).toLowerCase().replace('_', ' ') === wanted
          return { confirmed, error: confirmed ? null : `read-back: issue state is ${after.state}/${after.stateReason}` }
        } catch (e) {
          return { confirmed: false, error: e.message }
        }
      },
      syncEpic({ id, repo }) {
        try {
          const parent = parentOf(id, repo)
          if (parent === null) return { confirmed: false, gap: 'parent-absent', error: `issue #${id} has no parent` }
          const children = subIssues(parent, repo).map(issue => ({ id: String(issue.number), closed: issue.state === 'closed' }))
          const body = gh(withRepo(['issue', 'view', String(parent)], repo).concat(['--json', 'body', '-q', '.body']))
          const next = updateEpicBody(body, children)
          if (next.trimEnd() !== body.trimEnd()) gh(['issue', 'edit', String(parent), '--repo', resolveRepo(repo), '--body', next])
          const after = gh(withRepo(['issue', 'view', String(parent)], repo).concat(['--json', 'body', '-q', '.body']))
          const confirmed = updateEpicBody(after, children).trimEnd() === after.trimEnd()
          return { confirmed, parent, changed: next.trimEnd() !== body.trimEnd(), error: confirmed ? null : `read-back: epic #${parent} checklist differs` }
        } catch (e) {
          return { confirmed: false, gap: 'epic-sync-failed', error: e.message }
        }
      },
      ensureBoardMembership({ id, repo }) {
        try {
          const board = resolveBoard(repo)
          if (board.gap) return { confirmed: false, gap: board.gap, error: board.error }
          const [owner, name] = resolveRepo(repo).split('/')
          const query = () => parseJson(gh(['api', 'graphql', '-f', `query=${BOARD_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${Number(id)}`]), { command: 'gh api graphql board' })?.data?.repository?.issue
          const before = query()
          if (!before?.id) return { confirmed: false, gap: 'issue-unresolved', error: `issue #${id} has no node id` }
          if (!(before.projectItems?.nodes ?? []).some(item => item.project?.id === board.id)) {
            const mutation = 'mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}'
            gh(['api', 'graphql', '-f', `query=${mutation}`, '-F', `project=${board.id}`, '-F', `content=${before.id}`])
          }
          const confirmed = (query()?.projectItems?.nodes ?? []).some(item => item.project?.id === board.id)
          return { confirmed, error: confirmed ? null : `read-back: issue #${id} is absent from ${board.title}` }
        } catch (e) {
          return { confirmed: false, gap: 'membership-write-failed', error: e.message }
        }
      },

      // The card's board `Status` field, written through GraphQL variables (never interpolated) and
      // READ BACK from the mutation's own payload (github-implementation.md, Project Board Status
      // Transitions). Reported, never thrown and never a silent skip: a card that is not a project
      // item, sits on several boards, or whose board has no such option is `confirmed: false`.
      setBoardState({ id, state, repo }) {
        try {
          const board = resolveBoard(repo)
          if (board.gap) return { applied: state, confirmed: false, gap: board.gap, error: board.error }
          const [owner, name] = resolveRepo(repo).split('/')
          const q = parseJson(gh(['api', 'graphql', '-f', `query=${BOARD_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `n=${Number(id)}`]), { command: 'gh api graphql board' })
          const items = (q?.data?.repository?.issue?.projectItems?.nodes ?? []).filter(item => item?.project?.id === board.id)
          if (items.length === 0) return { applied: state, confirmed: false, error: `issue #${id} is not an item of ${board.title} — no board field to write` }
          if (items.length > 1) return { applied: state, confirmed: false, error: `issue #${id} sits on ${items.length} projects (${items.map(i => i.project?.title).join(', ')}) — the board is never guessed` }
          const [item] = items
          const field = (item.project?.fields?.nodes ?? []).find(f => f?.name === 'Status')
          const option = field?.options?.find(o => o.name === state)
          if (!field || !option) return { applied: state, confirmed: false, error: `board "${item.project?.title}" has no Status option "${state}"` }
          const out = parseJson(gh(['api', 'graphql', '-f', `query=${BOARD_MUTATION}`, '-F', `project=${item.project.id}`, '-F', `item=${item.id}`, '-F', `field=${field.id}`, '-f', `option=${option.id}`]), { command: 'gh api graphql mutation' })
          const now = out?.data?.updateProjectV2ItemFieldValue?.projectV2Item?.fieldValueByName?.name
          return { applied: state, confirmed: now === state, error: now === state ? null : `read-back: Status is ${JSON.stringify(now)}` }
        } catch (e) {
          return { applied: state, confirmed: false, error: e.message }
        }
      },
      // US-523: add one label to the CARD, created on first use (A8), READ BACK. Reported, never thrown:
      // a refused write is `confirmed: false` with the reason, so the caller still posts its comment.
      labelCard({ id, label, repo }) {
        try {
          try {
            gh(withRepo(['label', 'create', label, '--description', 'Needs a human review before it proceeds'], repo))
          } catch (e) {
            if (!/already exists/i.test(String(e?.detail ?? e?.message ?? ''))) throw e
          }
          gh(withRepo(['issue', 'edit', String(id), '--add-label', label], repo))
          const now = parseJson(gh(withRepo(['issue', 'view', String(id)], repo).concat(['--json', 'labels'])), { command: 'gh issue view labels' })
          const has = (now?.labels ?? []).some(l => l?.name === label)
          return { applied: label, confirmed: has, error: has ? null : `read-back: label ${JSON.stringify(label)} is not on issue #${id}` }
        } catch (e) {
          return { applied: label, confirmed: false, error: e.message }
        }
      },
      // US-523: remove one label from the CARD (an attended completion clears `needs-review`), READ BACK. Reported, never thrown.
      unlabelCard({ id, label, repo }) {
        try {
          gh(withRepo(['issue', 'edit', String(id), '--remove-label', label], repo))
          const now = parseJson(gh(withRepo(['issue', 'view', String(id)], repo).concat(['--json', 'labels'])), { command: 'gh issue view labels' })
          const has = (now?.labels ?? []).some(l => l?.name === label)
          return { removed: label, confirmed: !has, error: has ? `read-back: label ${JSON.stringify(label)} is still on issue #${id}` : null }
        } catch (e) {
          return { removed: label, confirmed: false, error: e.message }
        }
      },
      // US-572: `--assignee @me` — the login the tracker CLI is authenticated as.
      resolveUser() {
        const login = gh(['api', 'user', '-q', '.login']).trim()
        if (!login) throw new HostError('invalid-output', { message: 'gh api user: empty login', method: 'resolveUser' })
        return login
      },
      // One marker-keyed comment on the CARD (never the PR thread): the park path's "awaits action".
      commentOnCard({ id, marker, body, repo }) {
        return upsertOnIssue({ number: id, marker, body, repo })
      },
      // The card's comments with their host-reported author (US-647: a maintainer decision may live on the card).
      listCardComments({ id, repo }) {
        return listComments({ pr: id, repo })
      },

      // ── pull-request side (code-host) ──
      // Remote branch deletion through the API: `git push --delete` would run the local pre-push gate.
      deleteBranch({ branch, repo }) {
        const path = assertBranchName(branch).split('/').map(encodeURIComponent).join('/')
        const slug = apiRepo(resolveRepo(repo))
        try {
          gh(['api', '-X', 'DELETE', `${slug}/git/refs/heads/${path}`])
          return { deleted: true }
        } catch (e) {
          // Only GitHub's own "ref is absent" answer means gone; a wrong repo (404) or a protected ref (422) is a failure.
          if (/Reference does not exist/i.test(String(e?.message ?? e))) return { deleted: false, gone: true }
          throw e
        }
      },
      prHead({ pr, repo }) {
        const out = gh(withRepo(['pr', 'view', String(pr)], repo).concat(['--json', 'headRefOid', '-q', '.headRefOid'])).trim()
        if (!SHA_RE.test(out)) throw new HostError('invalid-output', { message: `gh pr view ${pr}: head is not a 40-hex sha: ${JSON.stringify(out)}` })
        return out
      },
      listComments,
      upsertComment({ pr, marker, body, repo }) {
        return upsertOnIssue({ number: pr, marker, body, repo })
      },
      readComment({ id, repo }) {
        const c = parseJson(gh(['api', `repos/${repo}/issues/comments/${id}`]), { command: 'gh api comment' })
        const pr = /\/issues\/(\d+)$/.exec(String(c?.issue_url ?? ''))?.[1]
        // The comment's canonical identity (numeric id, repo of its html_url) and its created/updated times: a
        // decision keyed on the ref's spelling, or on a comment edited after it was posted, would not be the maintainer's.
        const repoOf = /^https:\/\/github\.com\/([^/]+\/[^/]+)\//.exec(String(c?.html_url ?? ''))?.[1]
        return { body: c?.body, authorLogin: c?.user?.login, authorIsUser: c?.user?.type === 'User', pr: pr === undefined ? null : Number(pr), id: c?.id === undefined ? undefined : String(c.id), repo: repoOf, createdAt: c?.created_at, updatedAt: c?.updated_at }
      },
      parseCommentRef(ref, { repo } = {}) {
        const m = COMMENT_URL_RE.exec(String(ref ?? ''))
        return m ? { pr: Number(m[3]), id: m[4], inScope: `${m[1]}/${m[2]}` === repo } : null
      },
      commentRef({ repo, pr, id }) {
        return `https://github.com/${repo}/pull/${Number(pr)}#issuecomment-${id}`
      },
      readCheck,
      readCheckRun,
      readCiChecks,
      readLabels,
      isMerged,
      clearPrState,
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
          // A merged PR has no premerge state: a re-invoked writer clears instead of restoring (US-599).
          if (mergedSafe({ pr, repo })) return clearPrState({ pr, repo })
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
      // Exactly one `<family>:<value>` label of that family: the family's other values removed, this
      // one added, then READ BACK — a family/value outside CLASSIFICATION_FAMILIES is refused before
      // any write (off-cycle fix for PR #516: the review is the only writer of these tags).
      setClassification({ pr, repo, family, value }) {
        const values = CLASSIFICATION_FAMILIES[family]
        if (!values) throw new HostError('invalid-input', { message: `setClassification: unknown family ${JSON.stringify(family)} (expected ${Object.keys(CLASSIFICATION_FAMILIES).join(' | ')})`, method: 'setClassification' })
        if (!values.includes(value)) throw new HostError('invalid-input', { message: `setClassification: ${family} has no value ${JSON.stringify(value)} (expected ${values.join(' | ')})`, method: 'setClassification' })
        const label = `${family}:${value}`
        try {
          const before = readLabels({ pr, repo })
          const removed = before.filter(l => l.startsWith(`${family}:`) && l !== label)
          for (const l of removed) gh(['api', '-X', 'DELETE', `${apiRepo(repo)}/issues/${pr}/labels/${encodeURIComponent(l)}`])
          if (!before.includes(label)) gh(['api', '-X', 'POST', `${apiRepo(repo)}/issues/${pr}/labels`, '--input', '-'], { input: JSON.stringify({ labels: [label] }) })
          const after = readLabels({ pr, repo })
          const confirmed = after.includes(label) && !after.some(l => l.startsWith(`${family}:`) && l !== label)
          return { applied: label, removed, confirmed, error: confirmed ? null : `read-back: labels are ${JSON.stringify(after)}` }
        } catch (e) {
          return { applied: label, removed: [], confirmed: false, error: e.message }
        }
      },
      // merge-and-cascade.md CLI fallback: `gh pr merge <n> --squash --subject <title> --body <body>`.
      merge({ pr, repo, strategy = 'squash', message = '', headSha }) {
        if (!['squash', 'merge', 'rebase'].includes(strategy)) throw new HostError('unsupported', { message: `merge strategy ${JSON.stringify(strategy)} (expected squash | merge | rebase)`, method: 'merge' })
        if (headSha !== undefined && !(typeof headSha === 'string' && SHA_RE.test(headSha))) throw new HostError('invalid-input', { message: `merge headSha is not a 40-hex sha: ${JSON.stringify(headSha)}`, method: 'merge' })
        const [subject, ...rest] = String(message).split('\n')
        const args = withRepo(['pr', 'merge', String(pr), `--${strategy}`], repo)
        // Pinned to the reviewed head: the host refuses when the PR head moved since it was read.
        if (headSha) args.push('--match-head-commit', headSha)
        if (subject) args.push('--subject', subject)
        if (rest.join('\n').trim()) args.push('--body', rest.join('\n').replace(/^\n+/, ''))
        gh(args)
        return { merged: true, pr: Number(pr), strategy }
      },
    }
  },
})
