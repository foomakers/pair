// Offline transport: actual conclude/adapter writes update the same JSON read by the CLI.
const { readFileSync, writeFileSync, appendFileSync } = require('fs')
const { join } = require('path')
const root = process.env.PAIR_REVIEW_FIXTURE
const file = join(root, 'tracker.json')
const args = process.argv.slice(2)
const state = JSON.parse(readFileSync(file, 'utf8'))
appendFileSync(join(root, 'gh-calls.jsonl'), JSON.stringify(args) + '\n')
const save = () => writeFileSync(file, JSON.stringify(state))
function refuse() {
  appendFileSync(join(root, 'unexpected.txt'), JSON.stringify(args) + '\n')
  throw new Error('unsupported offline gh request')
}
function project(value, fields) {
  if (!value || !fields) return refuse()
  const allowed =
    'number,title,body,labels,state,stateReason,closedAt,projectItems,url,isDraft,headRefOid,headRefName,baseRefName,reviewDecision,statusCheckRollup,mergedAt,closingIssuesReferences'.split(
      ',',
    )
  if (fields.split(',').some(key => !allowed.includes(key))) return refuse()
  return Object.fromEntries(fields.split(',').map(key => [key, value[key] ?? null]))
}
function options(start, allowed) {
  const values = {}
  for (let i = start; i < args.length; i += 2) {
    const key = args[i] === '-R' ? '--repo' : args[i]
    const value = args[i + 1]
    if (!allowed.includes(key) || key in values || !value || value.startsWith('-')) return refuse()
    values[key] = value
  }
  if (values['--repo'] && values['--repo'] !== 'fixture/repo') return refuse()
  if (!values['--json']) return refuse()
  return values
}
function list() {
  const opts = options(2, ['--repo', '--json', '--state', '--limit', '--head', '--base'])
  const status = opts['--state'] ?? 'open'
  if (!['all', 'open', 'closed', 'merged'].includes(status)) return refuse()
  const limit = opts['--limit'] ?? '30'
  if (!/^[1-9][0-9]*$/.test(limit)) return refuse()
  // Validate fields even when a filter leaves no rows.
  project({}, opts['--json'])
  return state.prs
    .filter(pr => status === 'all' || pr.state === status.toUpperCase())
    .filter(pr => !opts['--head'] || pr.headRefName === opts['--head'])
    .filter(pr => !opts['--base'] || pr.baseRefName === opts['--base'])
    .slice(0, Number(limit))
    .map(pr => project(pr, opts['--json']))
}
function read() {
  if (args[0] === 'pr' && args[1] === 'list') return list()
  if (args[0] === 'pr' && args[1] === 'view') {
    const opts = options(3, ['--repo', '--json'])
    return project(
      state.prs.find(pr => String(pr.number) === args[2]),
      opts['--json'],
    )
  }
  if (args[0] === 'issue' && args[1] === 'view') {
    const opts = options(3, ['--repo', '--json'])
    return project(state.cards[args[2]], opts['--json'])
  }
  return refuse()
}
function api() {
  const path = args.find(arg => arg.startsWith('repos/'))
  if (!path?.startsWith('repos/fixture/repo/')) return refuse()
  const method = args.includes('-X') ? args[args.indexOf('-X') + 1] : 'GET'
  const field = key => args.find(arg => arg.startsWith(key + '='))?.slice(key.length + 1)
  const pr = state.prs[0]
  if (path === `repos/fixture/repo/commits/${pr.headRefOid}/status` && method === 'GET')
    return {
      statuses: pr.statusCheckRollup.map(check => ({ ...check, state: check.state.toLowerCase() })),
    }
  if (path === `repos/fixture/repo/statuses/${pr.headRefOid}` && method === 'POST') {
    pr.statusCheckRollup = [{ context: field('context'), state: field('state').toUpperCase() }]
    save()
    return { state: field('state'), context: field('context') }
  }
  return labels(pr, path, method)
}
function labels(pr, path, method) {
  const labelPath = `repos/fixture/repo/issues/${pr.number}/labels`
  if (path === labelPath && method === 'GET') return pr.labels
  if (path.startsWith(labelPath + '/') && method === 'DELETE') {
    const label = decodeURIComponent(path.slice(labelPath.length + 1))
    pr.labels = pr.labels.filter(item => item.name !== label)
    save()
    return pr.labels
  }
  if (path === labelPath && method === 'POST' && args.includes('--input')) {
    const body = JSON.parse(readFileSync(0, 'utf8'))
    pr.labels.push(...body.labels.map(name => ({ name })))
    save()
    return pr.labels
  }
  return refuse()
}
process.stdout.write(JSON.stringify(args[0] === 'api' ? api() : read()))
