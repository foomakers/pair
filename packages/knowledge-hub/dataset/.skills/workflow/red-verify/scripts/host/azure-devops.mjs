// azure-devops.mjs — the Azure DevOps adapter (US-492 T-5): cards on Azure Boards, pull requests
// on Azure Repos, all through the `az` CLI and its `azure-devops` extension (CLI-first, AC6) —
// `az boards` / `az repos` where a verb exists, `az devops invoke` (the extension's own REST
// passthrough) for PR threads, statuses, labels and iterations, which have no `az repos` verb
// (azure-devops-implementation.md § Review Actions).
//
// Conventions (the adoption declares the tool; `az devops configure --defaults organization=…
// project=…` supplies the organization, azure-devops-implementation.md § Essential Setup Steps):
//   repo       `<project>/<repository>` — the two-segment slot the cycle scripts pass as `--repo`.
//   comment id `<threadId>:<commentId>` — a PR comment lives inside a thread.
//   check      a PR status (`context.name` = pair-review, `genre` = pair) bound to the iteration
//              whose source commit is the verified head — the exact-head rule of pr-states.md.
//   labels     PR labels (tags), the same `pr-state:*` vocabulary pr-states.md defines.
// Limitations, stated rather than hidden: `merge` supports `squash` and `merge` (no `rebase` flag on
// `az repos pr update`); `createCard` creates a `User Story` (the Agile process type — a Scrum
// project's `Product Backlog Item` is not selected automatically); `closeAndCascade` writes the
// caller's Done-mapped state literal (default `Done`), per canonical-states.md.
// REST shapes and api-versions follow the Azure DevOps REST 7.1 reference; this adapter is proven
// against a recorder stub, not a live organization (US-492 tests).
//
// Transport: `az` from PATH, or `transport.azBin` / PAIR_AZ_BIN (a test's recorder). `az`
// authenticates itself (`az login` / `az devops login`); this file never reads a token or PAT.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineAdapter, runCli, parseJson, HostError, upsertByMarker } from './adapter-kit.mjs'

export const CHECK_CONTEXT = 'pair-review'
export const CHECK_GENRE = 'pair'
export const STATE_LABELS = ['pr-state:to-be-reviewed', 'pr-state:ready-to-merge', 'pr-state:not-approved']
// A conservative cap, equal to GitHub's: the Azure DevOps REST reference states no PR-comment size
// limit this story could verify, so the adapter refuses the same size the GitHub path refuses.
export const MAX_COMMENT_CHARS = 65536
export const CARD_TYPE = 'User Story'
const SHA_RE = /^[0-9a-f]{40}$/
const CARD_URL_RE = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)$/
const COMMENT_URL_RE = /^https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+)\/pullrequest\/(\d+)\?discussionId=(\d+)#(\d+)$/
const STATE_TO_AZ = { success: 'succeeded', failure: 'failed', pending: 'pending' }
const STATE_FROM_AZ = { succeeded: 'success', failed: 'failure', pending: 'pending', error: 'failure' }
// REST api-versions per resource (Azure DevOps REST 7.1 reference).
const API = { pullRequestThreads: '7.1', pullRequestThreadComments: '7.1', pullRequestIterations: '7.1', pullRequestStatuses: '7.1-preview.1', pullRequestLabels: '7.1-preview.1' }

const splitRepo = repo => {
  const [project, repository] = String(repo ?? '').split('/')
  return { project: project || undefined, repository: repository || undefined }
}

export default defineAdapter({
  id: 'azure-devops',
  aliases: ['azure-boards', 'azure-repos'],
  hostsCode: true,
  binaries: ['az'],
  create(transport = {}) {
    const bin = transport.azBin || process.env.PAIR_AZ_BIN || 'az'
    const az = args => runCli({ bin, args, label: 'az' })
    const azJson = (args, what) => parseJson(az([...args, '--output', 'json']), { command: `az ${what}` })

    // `az devops invoke` — a body travels through a private temp file (`--in-file`), never argv.
    const invoke = ({ resource, repo, route = {}, method = 'GET', body }) => {
      const { project, repository } = splitRepo(repo)
      if (!project || !repository) throw new HostError('unsupported', { message: `azure-devops: repo must be <project>/<repository>, got ${JSON.stringify(repo)}` })
      const params = { project, repositoryId: repository, ...route }
      const args = ['devops', 'invoke', '--area', 'git', '--resource', resource, '--route-parameters', ...Object.entries(params).map(([k, v]) => `${k}=${v}`), '--http-method', method, '--api-version', API[resource]]
      let dir
      try {
        if (body !== undefined) {
          dir = mkdtempSync(join(tmpdir(), 'pair-az-'))
          writeFileSync(join(dir, 'body.json'), JSON.stringify(body), { mode: 0o600 })
          args.push('--in-file', join(dir, 'body.json'))
        }
        const out = az([...args, '--output', 'json'])
        return out.trim() ? parseJson(out, { command: `az devops invoke ${resource}` }) : null
      } finally {
        if (dir) rmSync(dir, { recursive: true, force: true })
      }
    }

    const cardId = ref => {
      const m = CARD_URL_RE.exec(String(ref))
      return m ? m[3] : String(ref)
    }
    const showCard = (id, expand) => azJson(['boards', 'work-item', 'show', '--id', cardId(id), ...(expand ? ['--expand', expand] : [])], 'boards work-item show')
    const orgOf = wi => /^https:\/\/dev\.azure\.com\/([^/]+)\//.exec(String(wi?.url ?? ''))?.[1]
    const cardUrl = wi => `https://dev.azure.com/${orgOf(wi)}/${wi?.fields?.['System.TeamProject']}/_workitems/edit/${wi?.id}`
    const asCard = wi => ({ number: wi?.id, url: cardUrl(wi), title: wi?.fields?.['System.Title'], body: wi?.fields?.['System.Description'] ?? '' })
    const relatedIds = (wi, rel) => (wi?.relations ?? []).filter(r => r.rel === rel).map(r => Number(/\/workItems\/(\d+)$/i.exec(String(r.url))?.[1])).filter(Number.isInteger)

    const prShow = pr => azJson(['repos', 'pr', 'show', '--id', String(pr)], 'repos pr show')
    const webUrls = new Map()
    const prWebUrl = pr => {
      if (!webUrls.has(pr)) webUrls.set(pr, String(prShow(pr)?.repository?.webUrl ?? ''))
      return webUrls.get(pr)
    }
    const threadUrl = (pr, threadId, commentId) => `${prWebUrl(pr)}/pullrequest/${pr}?discussionId=${threadId}#${commentId}`

    const listComments = ({ pr, repo }) => {
      const threads = invoke({ resource: 'pullRequestThreads', repo, route: { pullRequestId: pr } })?.value ?? []
      const out = []
      for (const t of threads) {
        if (t.isDeleted) continue
        for (const c of t.comments ?? []) {
          if (c.isDeleted || c.commentType === 'system') continue
          out.push({ id: `${t.id}:${c.id}`, body: String(c.content ?? ''), url: threadUrl(pr, t.id, c.id) })
        }
      }
      return out
    }
    const iterationOf = ({ pr, repo, sha }) => {
      const its = invoke({ resource: 'pullRequestIterations', repo, route: { pullRequestId: pr } })?.value ?? []
      const hit = its.filter(i => i?.sourceRefCommit?.commitId === sha).pop()
      if (!hit) throw new HostError('invalid-output', { message: `azure-devops: ${sha} is not an iteration of PR ${pr}`, method: 'concludeCheck' })
      return hit.id
    }
    const readCheck = ({ pr, repo, sha, context = CHECK_CONTEXT }) => {
      const iteration = iterationOf({ pr, repo, sha })
      const own = (invoke({ resource: 'pullRequestStatuses', repo, route: { pullRequestId: pr } })?.value ?? []).filter(s => s?.context?.name === context && s?.context?.genre === CHECK_GENRE && s.iterationId === iteration)
      return own.length ? (STATE_FROM_AZ[own[own.length - 1].state] ?? String(own[own.length - 1].state)) : null
    }
    const readLabels = ({ pr, repo }) => (invoke({ resource: 'pullRequestLabels', repo, route: { pullRequestId: pr } })?.value ?? []).filter(l => l.active !== false).map(l => String(l.name))

    return {
      checkContext: CHECK_CONTEXT,
      stateLabels: STATE_LABELS,
      errorPrefix: 'az',

      // ── card side (Azure Boards) ──
      readCard(id, { fields } = {}) {
        const wi = showCard(id)
        if (!fields) return { body: wi?.fields?.['System.Description'] ?? '' }
        const card = asCard(wi)
        return Object.fromEntries(fields.map(f => [f, card[f]]))
      },
      findCards({ repo, search }) {
        const { project } = splitRepo(repo)
        const q = s => String(s).replace(/'/g, "''")
        const wiql = `SELECT [System.Id], [System.Title], [System.Description], [System.TeamProject] FROM WorkItems WHERE [System.TeamProject] = '${q(project)}' AND [System.Description] CONTAINS '${q(search)}'`
        const rows = azJson(['boards', 'query', '--wiql', wiql], 'boards query')
        return (Array.isArray(rows) ? rows : []).map(asCard)
      },
      createCard({ repo, title, body }) {
        const { project } = splitRepo(repo)
        const wi = azJson(['boards', 'work-item', 'create', '--type', CARD_TYPE, '--title', title, '--description', body, ...(project ? ['--project', project] : [])], 'boards work-item create')
        return { url: cardUrl(wi) }
      },
      updateCard({ id, body }) {
        azJson(['boards', 'work-item', 'update', '--id', cardId(id), '--description', body], 'boards work-item update')
        return { id }
      },
      parseCardRef(ref, { repo } = {}) {
        const m = CARD_URL_RE.exec(String(ref ?? ''))
        return m ? { number: Number(m[3]), inScope: m[2] === splitRepo(repo).project } : null
      },
      // Recursive Parent Cascade Logic (azure-devops-implementation.md): the card takes the Done
      // state; a parent whose children are ALL in it takes it too, up the hierarchy.
      closeAndCascade({ id, doneState = 'Done' }) {
        const setDone = n => azJson(['boards', 'work-item', 'update', '--id', String(n), '--state', doneState], 'boards work-item update')
        setDone(cardId(id))
        const closed = [Number(cardId(id))]
        let child = Number(cardId(id))
        for (;;) {
          const parent = relatedIds(showCard(child, 'relations'), 'System.LinkTypes.Hierarchy-Reverse')[0]
          if (parent === undefined) return { closed, stoppedAt: null }
          const children = relatedIds(showCard(parent, 'relations'), 'System.LinkTypes.Hierarchy-Forward')
          if (children.some(c => showCard(c)?.fields?.['System.State'] !== doneState)) return { closed, stoppedAt: parent }
          setDone(parent)
          closed.push(parent)
          child = parent
        }
      },

      // ── pull-request side (Azure Repos) ──
      prHead({ pr }) {
        const head = String(prShow(pr)?.lastMergeSourceCommit?.commitId ?? '')
        if (!SHA_RE.test(head)) throw new HostError('invalid-output', { message: `az repos pr show ${pr}: head is not a 40-hex sha: ${JSON.stringify(head)}` })
        return head
      },
      listComments,
      upsertComment({ pr, marker, body, repo }) {
        return upsertByMarker({
          marker,
          body,
          max: MAX_COMMENT_CHARS,
          list: () => listComments({ pr, repo }),
          update: (hit, full) => {
            const [threadId, commentId] = String(hit.id).split(':')
            invoke({ resource: 'pullRequestThreadComments', repo, route: { pullRequestId: pr, threadId, commentId }, method: 'PATCH', body: { content: full } })
            return { id: hit.id, url: hit.url }
          },
          create: full => {
            const t = invoke({ resource: 'pullRequestThreads', repo, route: { pullRequestId: pr }, method: 'POST', body: { comments: [{ parentCommentId: 0, content: full, commentType: 1 }], status: 1 } })
            const c = t?.comments?.[0]
            return { id: `${t?.id}:${c?.id}`, url: threadUrl(pr, t?.id, c?.id) }
          },
        })
      },
      readComment({ id, pr, repo }) {
        const [threadId, commentId] = String(id).split(':')
        const t = invoke({ resource: 'pullRequestThreads', repo, route: { pullRequestId: pr, threadId } })
        const c = (t?.comments ?? []).find(x => String(x.id) === String(commentId))
        // A person, not a service/build identity: Azure DevOps subject descriptors of users are
        // `aad.` (Entra ID) or `msa.` (Microsoft account).
        const a = c?.author
        return { body: c?.content, authorLogin: a?.uniqueName, authorIsUser: !!a && !a.isContainer && /^(aad|msa)\./.test(String(a.descriptor ?? '')), pr: c ? Number(pr) : null }
      },
      parseCommentRef(ref, { repo } = {}) {
        const m = COMMENT_URL_RE.exec(String(ref ?? ''))
        return m ? { pr: Number(m[4]), id: `${m[5]}:${m[6]}`, inScope: `${m[2]}/${m[3]}` === repo } : null
      },
      commentRef({ pr, id }) {
        const [threadId, commentId] = String(id).split(':')
        return threadUrl(pr, threadId, commentId)
      },
      readCheck,
      readLabels,
      concludeCheck({ pr, sha, repo, state, description, targetUrl, context = CHECK_CONTEXT }) {
        try {
          const iterationId = iterationOf({ pr, repo, sha })
          const body = { state: STATE_TO_AZ[state] ?? state, context: { name: context, genre: CHECK_GENRE }, iterationId }
          if (description) body.description = String(description).slice(0, 140)
          if (targetUrl) body.targetUrl = targetUrl
          invoke({ resource: 'pullRequestStatuses', repo, route: { pullRequestId: pr }, method: 'POST', body })
          return { context, sha, state, published: true, error: null }
        } catch (e) {
          return { context, sha, state, published: false, error: e.message }
        }
      },
      setPrState({ pr, repo, label }) {
        try {
          const before = readLabels({ pr, repo })
          const removed = before.filter(l => STATE_LABELS.includes(l) && l !== label)
          for (const l of removed) invoke({ resource: 'pullRequestLabels', repo, route: { pullRequestId: pr, labelIdOrName: encodeURIComponent(l) }, method: 'DELETE' })
          if (!before.includes(label)) invoke({ resource: 'pullRequestLabels', repo, route: { pullRequestId: pr }, method: 'POST', body: { name: label } })
          const after = readLabels({ pr, repo })
          const confirmed = after.includes(label) && !after.some(l => STATE_LABELS.includes(l) && l !== label)
          return { applied: label, removed, confirmed, error: confirmed ? null : `read-back: labels are ${JSON.stringify(after)}` }
        } catch (e) {
          return { applied: label, removed: [], confirmed: false, error: e.message }
        }
      },
      merge({ pr, strategy = 'squash', message = '' }) {
        if (!['squash', 'merge'].includes(strategy)) throw new HostError('unsupported', { message: `azure-devops: merge strategy ${JSON.stringify(strategy)} is not supported (squash | merge)`, method: 'merge' })
        const args = ['repos', 'pr', 'update', '--id', String(pr), '--status', 'completed', '--squash', strategy === 'squash' ? 'true' : 'false']
        if (message) args.push('--merge-commit-message', String(message))
        azJson(args, 'repos pr update')
        return { merged: true, pr: Number(pr), strategy }
      },
    }
  },
})
