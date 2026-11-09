// Offline gh read boundary. Unsupported requests fail closed; no network or writes.
const { readFileSync, appendFileSync } = require('fs')
const { join } = require('path')
const root = process.env['PAIR_CARDS_FIXTURE']
const args = process.argv.slice(2)
appendFileSync(join(root, 'gh-calls.jsonl'), JSON.stringify(args) + '\n')
const state = JSON.parse(readFileSync(join(root, 'tracker.json'), 'utf8'))
function refuse(message) {
  appendFileSync(join(root, 'unexpected.txt'), JSON.stringify(args) + '\n')
  throw new Error(message)
}
const issueFields = 'number,title,body,labels,state,stateReason,closedAt,projectItems,url'.split(
  ',',
)
const prFields =
  'number,title,body,state,isDraft,headRefName,headRefOid,baseRefName,url,labels,reviewDecision,statusCheckRollup,mergedAt,closedAt,closingIssuesReferences'.split(
    ',',
  )
function options(start, allowed) {
  const result = {}
  for (let i = start; i < args.length; i += 2) {
    const key = args[i]
    if (!allowed.includes(key) || result[key] !== undefined || !args[i + 1])
      refuse('unsupported or duplicate option')
    result[key] = args[i + 1]
  }
  if (result['--repo'] && result['--repo'] !== 'fixture/repo') refuse('wrong repository')
  return result
}
function project(value, opts, fields) {
  if (!opts['--json']) refuse('JSON field selection required')
  const selected = opts['--json'].split(',')
  if (selected.some(key => !fields.includes(key))) refuse('unsupported JSON field')
  return Object.fromEntries(selected.map(key => [key, value[key] ?? null]))
}
function list(opts) {
  const status = opts['--state'] ?? 'open'
  if (!['open', 'closed', 'merged', 'all'].includes(status)) refuse('unsupported state')
  let rows = state.prs.filter(pr => status === 'all' || pr.state.toLowerCase() === status)
  if (opts['--head']) rows = rows.filter(pr => pr.headRefName === opts['--head'])
  if (opts['--base']) rows = rows.filter(pr => pr.baseRefName === opts['--base'])
  if (opts['--search']) {
    const match = /^#?(\d+)(?: in:body)?$/.exec(opts['--search'])
    if (!match) refuse('unsupported search')
    rows = rows.filter(pr => new RegExp('(?:^|[^0-9])#' + match[1] + '(?![0-9])').test(pr.body))
  }
  if (opts['--limit']) {
    if (!/^[1-9]\d*$/.test(opts['--limit'])) refuse('invalid limit')
    rows = rows.slice(0, Number(opts['--limit']))
  }
  return rows.map(pr => project(pr, opts, prFields))
}
function answer() {
  if (args[0] === 'issue' && args[1] === 'view') {
    const opts = options(3, ['--json', '--repo'])
    const card = state.cards[args[2]]
    if (!card) process.exit(1)
    return project(card, opts, issueFields)
  }
  if (args[0] === 'pr' && args[1] === 'list')
    return list(
      options(2, ['--json', '--repo', '--state', '--head', '--base', '--search', '--limit']),
    )
  if (args[0] === 'pr' && args[1] === 'view') {
    const opts = options(3, ['--json', '--repo'])
    const pr = state.prs.find(pr => [String(pr.number), pr.url, pr.headRefName].includes(args[2]))
    if (!pr) process.exit(1)
    return project(pr, opts, prFields)
  }
  return refuse('unsupported fixture command')
}
process.stdout.write(JSON.stringify(answer()))
