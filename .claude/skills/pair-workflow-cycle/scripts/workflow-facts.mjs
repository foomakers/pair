#!/usr/bin/env node
import { bindHosts, HostError } from './host/index.mjs'
import { prereqState } from './cycle-state.mjs'
import { closeStory } from './cycle-merge.mjs'
import { stateMapping } from './board-sync.mjs'

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

function cardDecision(body, { pr, head }) {
  const line = body.trimStart().split('\n')[0].trim()
  const match = /^\/(approve|reject)[ \t]+#(\d+)[ \t]+([0-9a-f]{40})(?:[ \t]+(.*))?$/.exec(line)
  if (!match || match[2] !== String(pr) || match[3] !== head) return undefined
  return { verdict: match[1] === 'approve' ? 'approved' : 'rejected', note: match[4] }
}

function approvalComments(pm, id, park) {
  try {
    return pm.listCardComments({ id })
  } catch (error) {
    if (park.channel === 'session' && error instanceof HostError
      && error.kind === 'not-implemented' && error.method === 'listCardComments') return []
    throw error
  }
}

async function confirmReady(pm, id, adoption, boardState) {
  const control = await import('../../pair-next/control-state.mjs').catch(error => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    return import('../../../next/control-state.mjs')
  })
  const view = pm.readCard(id, { fields: ['title', 'body'] })
  const verdict = control.resolveControlState({ ...view, boardState }, control.parseStateMapping(adoption))
  if (verdict.outOfProcess || verdict.readiness === 'draft')
    throw new Error(verdict.outOfProcess ?? verdict.explanation)
  return { confirmed: true }
}

async function boardState(pm, id, { state, adoption }) {
  const order = ['Draft', 'Ready', 'In Progress', 'Review', 'Done']
  if (!order.includes(state)) throw new Error(`unknown card state ${state}`)
  const mapping = stateMapping(adoption)
  const current = pm.cardState({ id })
  if (current.gap) throw new Error(current.gap)
  if (order.findIndex(key => mapping[key] === current.boardState) >= order.indexOf(state))
    return { confirmed: true }
  const literal = mapping[state]
  if (literal === undefined && state === 'Ready') return confirmReady(pm, id, adoption, current.boardState)
  if (literal === undefined) throw new Error(`no board state maps to ${state}`)
  const membership = pm.ensureBoardMembership({ id })
  if (!membership.confirmed) throw new Error(membership.error ?? 'membership was not confirmed')
  const written = pm.setBoardState({ id, state: literal })
  if (!written.confirmed) throw new Error(written.error ?? 'state was not confirmed')
  return { confirmed: true }
}

const workflowMerge = (host, card, input) => {
  const { code, pm } = host
  const pr = code.workflowPr({ id: card })
  if (pr !== input.pr) return failed('pr-changed')
  let current = code.workflowPrDetails({ pr })
  if (current.head !== input.head) return failed('head-moved')
  if (!current.merged) {
    if (input.closureOnly) return failed('merge-not-confirmed')
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

function assignCard() {
  try {
    const input = raw === undefined ? {} : JSON.parse(raw)
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('assign-card expects a JSON object')
    const { assign, login } = input
    if (assign !== undefined && login !== undefined) throw new Error('assign-card accepts either assign or login')
    if (assign === 'none') return { status: 'unchanged' }
    const { pm } = bindHosts({ from: process.cwd() })
    return pm.assignCard({ id: card, assign, login })
  } catch (error) {
    return { status: 'warning', reason: error.message }
  }
}

try {
  const host = action === 'assign-card' ? undefined : bindHosts({ from: process.cwd() })
  let result
  if (action === 'assign-card') {
    result = assignCard()
  } else if (action === 'merge') {
    result = workflowMerge(host, card, JSON.parse(raw))
  } else if (action === 'linked-pr') {
    result = host.code.workflowPr({ id: card })
  } else if (action === 'pr-branch') {
    result = host.code.workflowPrDetails({ pr: Number(card) }).branch
  } else if (action === 'merge-resume') {
    const pr = host.code.workflowPr({ id: card })
    const expected = JSON.parse(raw)
    const target = host.code.workflowPrDetails({ pr })
    result = pr === expected.pr && target.head === expected.head && target.merged === true
  } else if (action === 'board-state') {
    result = await boardState(host.pm, card, JSON.parse(raw))
  } else if (action === 'board-mapping') {
    result = stateMapping(JSON.parse(raw))
  } else if (action === 'card-comment-support') {
    result = Object.hasOwn(host.pm, 'commentOnCard')
  } else if (action === 'approval-notice' || action === 'comment-on-card') {
    const { marker, body } = JSON.parse(raw)
    result = host.pm.commentOnCard({ id: card, marker, body })
    if (action === 'comment-on-card' && result?.error) throw new Error(result.error)
  } else if (action === 'approval-target' || action === 'approval-answers') {
    const { code, pm } = host
    const pr = code.workflowPr({ id: card })
    const target = code.workflowPrDetails({ pr })
    if (action === 'approval-target') result = { pr, head: target.head }
    else {
      const park = JSON.parse(raw)
      if (park.pr !== pr) result = { reason: 'pr-changed' }
      else if (park.head !== target.head) result = { reason: 'head-moved' }
      else {
        const since = Date.parse(park.since)
        const bot = code.workflowReviewIdentity({})
        const authorized = row => row.human && humanLogin(row.login, bot)
          && Date.parse(row.at) >= since && permission(code, row.login)
          && (!sameLogin(row.login, target.author) || row.solo)
        const comments = approvalComments(pm, card, park).flatMap(row => {
          if (!originalComment(row) || Date.parse(row.createdAt) < since) return []
          const answer = { login: row.authorLogin, human: true, at: row.createdAt, channel: 'comment', pr, head: target.head }
          if (sameLogin(row.authorLogin, target.author))
            return humanLogin(row.authorLogin, bot) && soloAnswer(code, target, row)
              ? [{ ...answer, solo: true, verdict: 'approved', note: target.head }] : []
          const decision = cardDecision(row.body, park)
          return decision ? [{ ...answer, ...decision }] : []
        })
        const reviews = code.workflowReviews({ pr }).filter(row =>
          row.head === target.head && ['APPROVED', 'CHANGES_REQUESTED'].includes(row.state)
        ).map(row => ({ ...row, channel: 'review' }))
        const flagged = park.flag ? [{ ...park.flag, ...code.workflowActor(), channel: 'flag', at: new Date().toISOString() }] : []
        const session = park.channel === 'session' && park.session
          ? [{ verdict: park.session.verdict, note: park.session.note, ...code.workflowActor(), channel: 'session', at: new Date().toISOString() }] : []
        result = [...flagged, ...session, ...comments, ...reviews].filter(authorized).sort((a,b) => Date.parse(b.at) - Date.parse(a.at))
      }
    }
  } else if (action === 'prerequisites') {
    const data = prereqState({ story: card, host })
    if (data.blocked && data.prerequisites.length === 0) throw new Error(data.blockedBy?.reason ?? 'prerequisites unreadable')
    result = data.prerequisites.filter(p => p.state !== 'merged').map(p => String(p.id))
  } else {
    const { code } = host
    if (typeof code.workflowPr !== 'function') throw new Error('code host cannot resolve workflow PRs')
    const pr = code.workflowPr({ id: card })
    const target = action === 'ci' ? code.workflowPrDetails({ pr }) : undefined
    const sha = target?.head ?? code.prHead({ pr })
    if ((action === 'ci' || action === 'review') && raw !== undefined && JSON.parse(raw).expectedHead !== sha)
      result = { headChanged: true }
    else if (action === 'head') result = sha
    else if (action === 'ci') result = code.workflowCi({ sha, base: target.base })
    else if (action === 'review') {
      result = (code.readCheckRun({ sha, context: 'pair-review' }) ?? code.readCheck({ sha, context: 'pair-review' })) === 'success'
    } else throw new Error('unknown workflow fact')
  }
  console.log(JSON.stringify(result))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
