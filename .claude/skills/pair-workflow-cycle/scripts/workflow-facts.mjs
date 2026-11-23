#!/usr/bin/env node
import { bindHosts } from './host/index.mjs'
import { prereqState } from './cycle-state.mjs'
import { closeStory } from './cycle-merge.mjs'

const [, , action, card, raw] = process.argv
const allowed = new Set(['admin', 'maintain', 'write'])
const sameLogin = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
const failed = (reason, summary = 'Workflow merge refused') => ({ status: 'failed', reason, summary })
const permission = (code, login) => allowed.has(code.readPermission({ user: login }))
const humanLogin = (login, bot) => /^[A-Za-z0-9-]+$/.test(login ?? '') && !sameLogin(login, bot)
const originalComment = row => row.authorIsUser && !row.performedViaApp && row.createdAt === row.updatedAt
const soloAnswer = (code, target, comment) =>
  originalComment(comment) && sameLogin(comment.authorLogin, target.author)
  && code.workflowApprovalToken({ head: target.head, author: target.author, comment })

const workflowMerge = (host, card, input) => {
  const { code, pm } = host
  const pr = code.workflowPr({ id: card })
  if (pr !== input.pr) return failed('pr-changed')
  let current = code.workflowPrDetails({ pr })
  if (current.head !== input.head) return failed('head-moved')
  if (!current.merged) {
    if (current.draft) return failed('pr-is-draft')
    const author = input.approvedBy
    if (!humanLogin(author, code.workflowReviewIdentity({})) || !permission(code, author)
      || (sameLogin(author, current.author)
        && !pm.listCardComments({ id: card }).some(comment => soloAnswer(code, current, comment))))
      return failed('approval-no-longer-authorized')
    code.merge({ pr, strategy: input.method ?? 'squash', headSha: input.head })
    current = code.workflowPrDetails({ pr })
    if (!current.merged || current.head !== input.head) return failed('merge-not-confirmed')
  }
  const closure = closeStory({ hosts: host, story: card, pr, branch: current.branch, root: input.root })
  const outputs = { merged: true, mergeCommit: current.mergeCommit }
  return closure.cascaded
    ? { status: 'ok', summary: `Merged #${pr} and closed the card`, ...outputs }
    : { ...failed('cascade-incomplete', 'Merged, closure incomplete'), detail: closure.reason, ...outputs }
}

try {
  const host = bindHosts({ from: process.cwd() })
  let result
  if (action === 'merge') {
    result = workflowMerge(host, card, JSON.parse(raw))
  } else if (action === 'merge-resume') {
    const pr = host.code.workflowPr({ id: card })
    result = host.code.workflowPrDetails({ pr }).merged
  } else if (action === 'approval-notice') {
    const { marker, body } = JSON.parse(raw)
    result = host.pm.commentOnCard({ id: card, marker, body })
  } else if (action === 'approval-target' || action === 'approval-answers') {
    const { code, pm } = host
    const pr = code.workflowPr({ id: card })
    const target = code.workflowPrDetails({ pr })
    if (action === 'approval-target') result = { pr, head: target.head }
    else {
      const park = JSON.parse(raw)
      if (park.pr !== pr || park.head !== target.head) throw new Error('Approval target moved')
      const since = Date.parse(park.since)
      const bot = code.workflowReviewIdentity({})
      const authorized = row => row.human && humanLogin(row.login, bot)
        && Date.parse(row.at) >= since && permission(code, row.login)
        && (!sameLogin(row.login, target.author) || row.solo)
      const comments = pm.listCardComments({ id: card }).flatMap(row => {
        if (!originalComment(row) || Date.parse(row.createdAt) < since) return []
        const answer = { login: row.authorLogin, human: true, at: row.createdAt, body: row.body, channel: 'comment' }
        if (sameLogin(row.authorLogin, target.author))
          return humanLogin(row.authorLogin, bot) && soloAnswer(code, target, row)
            ? [{ ...answer, solo: true, body: '/approve ' + target.head }] : []
        return /^\s*\/(approve|reject)(?:\s|$)/.test(row.body) ? [answer] : []
      })
      const reviews = code.workflowReviews({ pr }).filter(row =>
        row.head === target.head && ['APPROVED', 'CHANGES_REQUESTED'].includes(row.state)
      ).map(row => ({ ...row, channel: 'review' }))
      const flagged = park.flag ? [{ ...park.flag, ...code.workflowActor(), channel: 'flag', at: new Date().toISOString() }] : []
      result = [...flagged, ...comments, ...reviews].filter(authorized).sort((a,b) => Date.parse(b.at) - Date.parse(a.at))
    }
  } else if (action === 'prerequisites') {
    const data = prereqState({ story: card, host })
    if (data.blocked && data.prerequisites.length === 0) throw new Error(data.blockedBy?.reason ?? 'prerequisites unreadable')
    result = data.prerequisites.filter(p => p.state !== 'merged').map(p => String(p.id))
  } else {
    const { code } = host
    if (typeof code.workflowPr !== 'function') throw new Error('code host cannot resolve workflow PRs')
    const pr = code.workflowPr({ id: card })
    const sha = code.prHead({ pr })
    if ((action === 'ci' || action === 'review') && raw !== undefined && JSON.parse(raw).expectedHead !== sha)
      throw new Error('PR head moved since review')
    if (action === 'head') result = sha
    else if (action === 'ci') {
      const checks = code.readCiChecks({ sha, pr }).filter(c => !['pair-review', 'pair-explicit-approval'].includes(c.name))
      result = checks.some(c => c.conclusion === 'failure') ? 'red'
        : checks.length === 0 || checks.some(c => c.conclusion !== 'success') ? 'pending' : 'green'
    } else if (action === 'review') {
      result = (code.readCheckRun({ sha, context: 'pair-review' }) ?? code.readCheck({ sha, context: 'pair-review' })) === 'success'
    } else throw new Error('unknown workflow fact')
  }
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
