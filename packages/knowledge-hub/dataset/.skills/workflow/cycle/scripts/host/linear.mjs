// linear.mjs — the Linear PM adapter (US-577): cards are Linear issues, read and written through
// Linear's GraphQL API. PM side only (`hostsCode: false`): pull requests, checks and merge go to the
// declared `code-host` (GitHub), cross-linked by `Refs: ENG-123` in the PR body.
//
//   id        the issue identifier `<TEAM>-<n>` (`ENG-123`), or its `linear.app/<ws>/issue/ENG-123/…` URL
//   team      `- \`linear-team\`: \`ENG\`` (or `Team: ENG.`) in way-of-working.md; an issue of another
//             team is refused naming both. No team declared ⇒ no team check, and createCard is refused.
//   state     a Linear workflow state of the issue's team; `setBoardState` accepts a board state or a
//             macrostate, translated through `## State Mapping` (first row whose Macrostate matches).
//   labels    issue labels; comments: issue comments, marker-keyed (upsertByMarker).
//
// Transport: `curl` (transport.curlBin / PAIR_CURL_BIN), spawned through `sh -c` by the kit's runCli.
// The API key (ADR-026 amendment 2026-10-25): `$LINEAR_API_KEY` is expanded by the child shell into
// the request header on fd 3 — this file never reads, stores, prints or passes it as argv; absent ⇒ the child
// exits 64 and the call fails `host-unconfigured`, naming the variable.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { defineAdapter, runCli, parseJson, upsertByMarker, HostError } from './adapter-kit.mjs'

export const API_URL = 'https://api.linear.app/graphql'
export const TOKEN_VAR = 'LINEAR_API_KEY'
const UNCONFIGURED = 64
// $0 = the curl binary; stdin = the JSON request; stdout = the response body, then the HTTP status on its own line.
// The auth header reaches curl through a here-doc on fd 3 (`-H @file`), so the key is never an argv element (`ps`).
const GQL_SH = `test -n "$${TOKEN_VAR}" || { echo "${TOKEN_VAR} is not set" >&2; exit ${UNCONFIGURED}; }
exec "$0" -sS -X POST -H "Content-Type: application/json" -H @/dev/fd/3 --data-binary @- -w '\\n%{http_code}' ${API_URL} 3<<PAIR_EOF
Authorization: $${TOKEN_VAR}
PAIR_EOF`
const KEY_RE = /^#?([A-Za-z][A-Za-z0-9_]*)-(\d+)$/
const URL_RE = /^https:\/\/linear\.app\/[^/]+\/issue\/([A-Za-z][A-Za-z0-9_]*-\d+)(?:\/[^?#]*)?(?:[?#].*)?$/
const MAX_COMMENT_CHARS = 65536
const fail = (kind, message, method) => new HostError(kind, { message: `linear: ${message}`, ...(method ? { method } : {}) })

const ISSUE = 'id identifier url title description completedAt state { name type } team { id key } labels { nodes { id name } }'

// way-of-working.md, found upward from `from` (the adapter is self-contained: no import of index.mjs).
const adoptionText = from => {
  for (let cur = from; ; cur = dirname(cur)) {
    const f = join(cur, '.pair', 'adoption', 'tech', 'way-of-working.md')
    if (existsSync(f)) return readFileSync(f, 'utf8')
    if (dirname(cur) === cur) return ''
  }
}
const teamOf = text => (/`linear-team`\s*:\s*`([^`]+)`/.exec(text)?.[1] ?? /\bTeam:\s*([A-Za-z][A-Za-z0-9_]*)\b/.exec(text)?.[1])?.toUpperCase() ?? null
// `## State Mapping` rows → { macrostate (lower-case) → board state }, first row wins.
const stateMapOf = text => {
  const section = /^##\s+State Mapping\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(text)?.[1] ?? ''
  const map = {}
  for (const c of section.split('\n').map(l => l.split('|').map(x => x.trim()))) if (c.length > 3 && c[1] && !/^-+$/.test(c[1]) && !(c[2].toLowerCase() in map)) map[c[2].toLowerCase()] = c[1]
  return map
}
const sleep = ms => ms > 0 && Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

export default defineAdapter({
  id: 'linear',
  aliases: ['linear-app'],
  hostsCode: false,
  binaries: ['sh', 'curl'],
  create(transport = {}) {
    const curlBin = transport.curlBin || process.env.PAIR_CURL_BIN || 'curl'
    const retryDelayMs = transport.retryDelayMs ?? 2000
    const adoption = transport.wayOfWorking ?? adoptionText(process.cwd())
    const team = transport.team ?? teamOf(adoption)
    const stateMap = stateMapOf(adoption)

    const send = (query, variables) => {
      let out
      try {
        out = runCli({ bin: 'sh', args: ['-c', GQL_SH, curlBin], input: JSON.stringify({ query, variables }), label: 'linear-graphql' })
      } catch (e) {
        if (e.detail?.includes(`${TOKEN_VAR} is not set`)) throw new HostError('host-unconfigured', { message: `linear: host-unconfigured — set ${TOKEN_VAR} (a Linear personal API key) in the environment`, detail: TOKEN_VAR })
        throw e
      }
      const at = out.lastIndexOf('\n')
      return { status: Number(out.slice(at + 1)), res: parseJson(out.slice(0, at), { command: 'linear graphql' }) }
    }
    const limited = ({ status, res }) => status === 429 || (res?.errors ?? []).some(e => e?.extensions?.code === 'RATELIMITED')
    // One bounded retry on a rate limit, then `linear-rate-limited`.
    const gql = (query, variables = {}) => {
      let r = send(query, variables)
      if (limited(r)) {
        sleep(retryDelayMs)
        r = send(query, variables)
        if (limited(r)) throw new HostError('failed', { message: 'linear: linear-rate-limited (retried once)', detail: 'linear-rate-limited', command: 'linear graphql' })
      }
      if (r.res?.errors?.length || r.status >= 400) {
        const detail = (r.res?.errors ?? []).map(e => e?.message).join('; ') || `HTTP ${r.status}`
        throw new HostError('failed', { message: `linear: ${detail}`, detail, command: 'linear graphql' })
      }
      return r.res.data
    }

    // ref → identifier; another team than the bound one is refused naming both.
    const parse = ref => {
      const s = String(ref ?? '')
      const m = KEY_RE.exec(s) ?? URL_RE.exec(s)?.[1].match(KEY_RE)
      if (!m) throw fail('invalid-input', `${JSON.stringify(s)} is not a Linear issue (<TEAM>-<n> or a linear.app issue URL)`, 'parseCardRef')
      const key = m[1].toUpperCase()
      return { id: `${key}-${m[2]}`, key }
    }
    const keyOf = (ref, method) => {
      const { id, key } = parse(ref)
      if (team && key !== team) throw fail('invalid-input', `${id} belongs to team ${key}, not the bound team ${team}`, method)
      return id
    }
    const issue = (ref, method = 'readCard', extra = '') => {
      const i = gql(`query PairIssue($id: String!) { issue(id: $id) { ${ISSUE} ${extra} } }`, { id: keyOf(ref, method) })?.issue
      if (!i) throw fail('failed', `issue ${keyOf(ref, method)} not found`, method)
      return i
    }
    const closed = i => ['completed', 'canceled'].includes(i?.state?.type)
    const view = i => ({
      id: i.identifier,
      number: i.identifier,
      url: i.url,
      title: i.title,
      body: i.description ?? '',
      labels: (i.labels?.nodes ?? []).map(l => ({ name: l.name })),
      state: closed(i) ? 'CLOSED' : 'OPEN',
      stateReason: i.state?.type === 'completed' ? 'COMPLETED' : i.state?.type === 'canceled' ? 'NOT_PLANNED' : null,
      closedAt: i.completedAt ?? null,
      // the board item, in the code-host --json dialect every consumer reads; an unmapped state is just a name
      projectItems: i.state?.name ? [{ status: { name: i.state.name } }] : [],
    })
    const teamId = () => {
      if (!team) throw fail('unsupported', 'no team declared — add `- `linear-team`: `<KEY>`` to way-of-working.md', 'createCard')
      const t = gql('query PairTeam($key: String!) { teams(filter: { key: { eq: $key } }) { nodes { id } } }', { key: team })?.teams?.nodes?.[0]
      if (!t) throw fail('failed', `team ${team} not found`, 'createCard')
      return t.id
    }
    // the issue's team labels or workspace labels only: Linear refuses another team's label on the issue
    const labelId = (name, teamKey) => gql('query PairLabel($name: String!, $team: String!) { issueLabels(filter: { name: { eq: $name }, or: [{ team: { key: { eq: $team } } }, { team: { null: true } }] }) { nodes { id name } } }', { name, team: teamKey })?.issueLabels?.nodes?.[0]?.id
    const labelNames = ref => (issue(ref, 'readLabels').labels?.nodes ?? []).map(l => l.name)
    // Board state or macrostate → the team's workflow state; the board write is read back.
    const writeState = (ref, wanted, method) => {
      const name = stateMap[String(wanted).toLowerCase()] ?? wanted
      const i = issue(ref, method, 'team { id key states { nodes { id name } } }')
      const st = (i.team?.states?.nodes ?? []).find(s => s.name.toLowerCase() === String(name).toLowerCase())
      if (!st) return { applied: name, confirmed: false, error: `team ${i.team?.key} has no workflow state ${JSON.stringify(name)}` }
      if (i.state?.name !== st.name) gql('mutation PairSetState($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }', { id: i.identifier, stateId: st.id })
      const now = issue(i.identifier, method).state?.name
      return { applied: st.name, confirmed: now === st.name, error: now === st.name ? null : `read-back: ${i.identifier} is in ${JSON.stringify(now)}` }
    }
    const codeSide = method => () => {
      throw new HostError('unsupported', { message: `linear: ${method} is a code-host operation — declare \`code-host\` in way-of-working.md → ## Git Workflow`, method })
    }

    return {
      errorPrefix: 'linear',
      team,
      parseCardRef(ref) {
        const { id, key } = parse(ref)
        return { id, number: id, inScope: !team || key === team }
      },
      readCard(ref, { fields } = {}) {
        const v = view(issue(ref))
        return fields ? Object.fromEntries(fields.map(f => [f, v[f]])) : { body: v.body }
      },
      findCards({ search } = {}) {
        const filter = { description: { contains: String(search ?? '') }, ...(team ? { team: { key: { eq: team } } } : {}) }
        const rows = gql(`query PairFind($filter: IssueFilter) { issues(filter: $filter, first: 50) { nodes { ${ISSUE} } } }`, { filter })?.issues?.nodes ?? []
        return rows.map(view).map(({ number, url, title, body }) => ({ number, url, title, body }))
      },
      createCard({ title, body }) {
        const r = gql('mutation PairCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }', { input: { teamId: teamId(), title, description: body } })?.issueCreate
        if (!r?.success || !r.issue?.url) throw fail('invalid-output', 'issueCreate returned no issue', 'createCard')
        return { url: r.issue.url, number: r.issue.identifier }
      },
      updateCard({ id, body }) {
        const key = keyOf(id, 'updateCard')
        if (!gql('mutation PairUpdate($id: String!, $body: String!) { issueUpdate(id: $id, input: { description: $body }) { success } }', { id: key, body })?.issueUpdate?.success) throw fail('failed', `issueUpdate ${key} did not succeed`, 'updateCard')
        return { id: key }
      },
      readLabels({ id, pr } = {}) {
        return labelNames(id ?? pr)
      },
      // Reported, never thrown, like every board write; read back.
      labelCard({ id, label }) {
        try {
          const i = issue(id, 'labelCard')
          if (!(i.labels?.nodes ?? []).some(l => l.name === label)) {
            const lid = labelId(label, i.team.key)
            if (!lid) return { applied: label, confirmed: false, error: `no Linear label ${JSON.stringify(label)} — create it in the workspace` }
            gql('mutation PairAddLabel($id: String!, $labelId: String!) { issueAddLabel(id: $id, labelId: $labelId) { success } }', { id: i.identifier, labelId: lid })
          }
          const has = labelNames(i.identifier).includes(label)
          return { applied: label, confirmed: has, error: has ? null : `read-back: label ${JSON.stringify(label)} is not on ${i.identifier}` }
        } catch (e) {
          return { applied: label, confirmed: false, error: e.message }
        }
      },
      unlabelCard({ id, label }) {
        try {
          const i = issue(id, 'unlabelCard')
          const hit = (i.labels?.nodes ?? []).find(l => l.name === label)
          if (hit) gql('mutation PairRemoveLabel($id: String!, $labelId: String!) { issueRemoveLabel(id: $id, labelId: $labelId) { success } }', { id: i.identifier, labelId: hit.id })
          const has = labelNames(i.identifier).includes(label)
          return { removed: label, confirmed: !has, error: has ? `read-back: label ${JSON.stringify(label)} is still on ${i.identifier}` : null }
        } catch (e) {
          return { removed: label, confirmed: false, error: e.message }
        }
      },
      setBoardState({ id, state }) {
        try {
          return writeState(id, state, 'setBoardState')
        } catch (e) {
          return { applied: state, confirmed: false, error: e.message }
        }
      },
      commentOnCard({ id, marker, body }) {
        const key = keyOf(id, 'commentOnCard')
        return upsertByMarker({
          marker,
          body,
          max: MAX_COMMENT_CHARS,
          list: () => issue(key, 'commentOnCard', 'comments { nodes { id body url } }').comments?.nodes ?? [],
          update: (hit, full) => {
            const c = gql('mutation PairCommentUpdate($id: String!, $body: String!) { commentUpdate(id: $id, input: { body: $body }) { comment { id url } } }', { id: hit.id, body: full })?.commentUpdate?.comment
            return { id: c?.id ?? hit.id, url: c?.url ?? hit.url }
          },
          create: full => {
            const issueId = issue(key, 'commentOnCard').id
            const c = gql('mutation PairComment($issueId: String!, $body: String!) { commentCreate(input: { issueId: $issueId, body: $body }) { comment { id url } } }', { issueId, body: full })?.commentCreate?.comment
            return { id: c?.id, url: c?.url }
          },
        })
      },
      // The issue takes the state mapped to `Done`; a parent whose sub-issues are ALL completed takes it too, upward.
      closeAndCascade({ id }) {
        const done = []
        let cur = keyOf(id, 'closeAndCascade')
        for (;;) {
          const r = writeState(cur, 'Done', 'closeAndCascade')
          if (!r.confirmed) throw fail('failed', r.error, 'closeAndCascade')
          done.push(cur)
          const parent = issue(cur, 'closeAndCascade', 'parent { identifier children { nodes { identifier state { type } } } }').parent
          if (!parent) return { closed: done, stoppedAt: null }
          if ((parent.children?.nodes ?? []).some(c => c.state?.type !== 'completed')) return { closed: done, stoppedAt: parent.identifier }
          cur = parent.identifier
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
