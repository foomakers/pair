// A recorder stub for `curl` against Linear's GraphQL API (US-577 tests): answers each named
// operation the adapter sends with the response shape Linear returns, over a world file it mutates.
// Called as `<this> <curl args…>` with the request on stdin; prints the body, then the HTTP status.
// FAKE_LINEAR_WORLD = the world file; FAKE_LINEAR_LOG = one JSON line per call; FAKE_LINEAR_429_FILE = a
// file holding how many leading calls answer HTTP 429.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'

const world = JSON.parse(readFileSync(process.env.FAKE_LINEAR_WORLD, 'utf8'))
const req = JSON.parse(readFileSync(0, 'utf8'))
const op = /^(?:query|mutation)\s+(\w+)/.exec(req.query)?.[1]
const v = req.variables ?? {}
const header = process.argv.includes('@/dev/fd/3') ? readFileSync('/dev/fd/3', 'utf8').trim() : ''
appendFileSync(process.env.FAKE_LINEAR_LOG, JSON.stringify({ op, variables: v, args: process.argv.slice(2), auth: header === `Authorization: ${process.env.LINEAR_API_KEY}`, env: Object.keys(process.env).filter(k => /KEY|TOKEN/.test(k)) }) + '\n')
const reply = (data, status = 200) => {
  writeFileSync(process.env.FAKE_LINEAR_WORLD, JSON.stringify(world))
  process.stdout.write(`${JSON.stringify(data)}\n${status}`)
  process.exit(0)
}
const left = process.env.FAKE_LINEAR_429_FILE ? Number(readFileSync(process.env.FAKE_LINEAR_429_FILE, 'utf8')) : 0
if (left > 0) {
  writeFileSync(process.env.FAKE_LINEAR_429_FILE, String(left - 1))
  reply({ errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] }, 429)
}

const team = key => world.teams.find(t => t.key === key)
const find = id => world.issues.find(i => i.identifier === id || i.id === id)
const shape = i => {
  const t = team(i.team)
  const st = t.states.find(s => s.name === i.state)
  return {
    id: i.id,
    identifier: i.identifier,
    url: i.url,
    title: i.title,
    description: i.description,
    completedAt: i.completedAt,
    state: { name: st.name, type: st.type },
    team: { id: t.id, key: t.key, states: { nodes: t.states.map(({ id, name }) => ({ id, name })) } },
    labels: { nodes: i.labels.map(name => world.labels.find(l => l.name === name)) },
    comments: { nodes: i.comments },
    parent: i.parent
      ? { identifier: i.parent, children: { nodes: world.issues.filter(c => c.parent === i.parent).map(c => ({ identifier: c.identifier, state: { type: team(c.team).states.find(s => s.name === c.state).type } })) } }
      : null,
  }
}

switch (op) {
  case 'PairIssue':
    reply(find(v.id) ? { data: { issue: shape(find(v.id)) } } : { data: null, errors: [{ message: 'Entity not found: Issue', extensions: { code: 'INVALID_INPUT' } }] })
  case 'PairFind':
    reply({ data: { issues: { nodes: world.issues.filter(i => i.description.includes(v.filter.description.contains) && (!v.filter.team || i.team === v.filter.team.key.eq)).map(shape) } } })
  case 'PairTeam':
    reply({ data: { teams: { nodes: world.teams.filter(t => t.key === v.key).map(({ id }) => ({ id })) } } })
  case 'PairCreate': {
    const t = world.teams.find(x => x.id === v.input.teamId)
    const num = world.issues.filter(i => i.team === t.key).length + 1
    const i = { id: `uuid-${t.key}-${num}`, identifier: `${t.key}-${num}`, url: `https://linear.app/acme/issue/${t.key}-${num}/new`, title: v.input.title, description: v.input.description, completedAt: null, team: t.key, state: 'Todo', labels: [], parent: null, comments: [] }
    world.issues.push(i)
    reply({ data: { issueCreate: { success: true, issue: { identifier: i.identifier, url: i.url } } } })
  }
  case 'PairUpdate':
    find(v.id).description = v.body
    reply({ data: { issueUpdate: { success: true } } })
  case 'PairSetState': {
    const i = find(v.id)
    const st = team(i.team).states.find(s => s.id === v.stateId)
    i.state = st.name
    i.completedAt = st.type === 'completed' ? '2026-10-25T00:00:00.000Z' : null
    reply({ data: { issueUpdate: { success: true } } })
  }
  case 'PairLabel':
    reply({ data: { issueLabels: { nodes: world.labels.filter(l => l.name === v.name) } } })
  case 'PairAddLabel': {
    const i = find(v.id)
    i.labels.push(world.labels.find(l => l.id === v.labelId).name)
    reply({ data: { issueAddLabel: { success: true } } })
  }
  case 'PairRemoveLabel': {
    const i = find(v.id)
    i.labels = i.labels.filter(n => world.labels.find(l => l.id === v.labelId).name !== n)
    reply({ data: { issueRemoveLabel: { success: true } } })
  }
  case 'PairComment': {
    const i = find(v.issueId)
    const c = { id: `c-${i.comments.length + 1}`, body: v.body, url: `${i.url}#comment-${i.comments.length + 1}` }
    i.comments.push(c)
    reply({ data: { commentCreate: { comment: { id: c.id, url: c.url } } } })
  }
  case 'PairCommentUpdate': {
    const c = world.issues.flatMap(i => i.comments).find(x => x.id === v.id)
    c.body = v.body
    reply({ data: { commentUpdate: { comment: { id: c.id, url: c.url } } } })
  }
  default:
    reply({ errors: [{ message: `unknown operation ${op}` }] }, 400)
}
