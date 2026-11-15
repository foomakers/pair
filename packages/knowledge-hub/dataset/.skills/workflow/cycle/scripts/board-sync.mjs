// Shared PM state decisions. Host I/O stays behind the bound adapter.
export { updateEpicBody } from './host/adapter-kit.mjs'
const DEFAULT = { Draft: 'Draft', Ready: 'Ready', 'In Progress': 'In Progress', Review: 'Review', Done: 'Done' }

export function checkDodBoxes(body) {
  let inDod = false
  return String(body ?? '')
    .split('\n')
    .map(line => {
      if (/^##\s+/.test(line)) inDod = /^##\s+Definition of Done/i.test(line)
      return inDod ? line.replace(/^(\s*[-*]\s+)\[ \]/, '$1[x]') : line
    })
    .join('\n')
}

// Closure without completion lives in the tracker's native field (canonical-states.md); a board column
// for it is written only when the adoption names one: `not-planned-state`: `<column>`.
export function stateMapping(text) {
  const section = /^## State Mapping[ \t]*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(String(text ?? ''))?.[1]
  const notPlanned = /`not-planned-state`\s*:\s*`([^`]+)`/.exec(String(text ?? ''))?.[1]
  const map = section === undefined ? { ...DEFAULT } : {}
  for (const line of section?.split('\n') ?? []) {
    const cells = line.split('|').map(s => s.trim())
    if (cells.length < 4 || !Object.hasOwn(DEFAULT, cells[2])) continue
    if (!map[cells[2]]) map[cells[2]] = cells[1]
  }
  if (notPlanned) map['Not planned'] = notPlanned
  return map
}

const targetOf = (status, mapping) => (status === 'Todo' ? mapping.Draft : status ? mapping[status] ?? null : null)
// Review may be absent on a minimal board; Not planned converges on the native close when no column is adopted.
const optional = status => status === 'Review' || status === 'Not planned'

export function decideBoardState({ pr, issue, reason, member = true, board }) {
  if (!['merged', 'closed-unmerged', 'open', 'none'].includes(pr)) return { gap: 'pr-state-unreadable' }
  if (!['OPEN', 'CLOSED'].includes(issue)) return { gap: 'issue-state-unreadable' }
  if (pr === 'merged') return { status: 'Done', close: issue === 'CLOSED' && reason === 'COMPLETED' ? null : 'merged' }
  if (issue === 'CLOSED') return { status: pr === 'none' && reason === 'COMPLETED' ? 'Done' : 'Not planned', close: null }
  if (pr === 'closed-unmerged') return { status: 'Not planned', close: 'unmerged' }
  if (pr === 'open') return { status: 'Review', close: null }
  // An empty Status on a member is uninitialized, not synchronized; `board` omitted means unknown.
  return { status: member && board !== null ? null : 'Todo', close: null }
}

export function applyBoardState({ pm, id, pr, repo, mapping = DEFAULT }) {
  try {
    let current = pm.cardState({ id, repo })
    const wanted = decideBoardState({ pr, issue: current.issueState, reason: current.issueReason, member: current.member, board: current.boardState })
    if (wanted.gap) return { confirmed: false, gaps: [wanted.gap] }
    const target = targetOf(wanted.status, mapping)
    if (wanted.status && !target && !optional(wanted.status)) return { confirmed: false, gaps: [`state-unmapped:${wanted.status}`] }
    const actions = []
    if (wanted.close) {
      const result = pm.closeCard({ id, repo, reason: wanted.close })
      if (!result.confirmed) return { confirmed: false, gaps: [result.gap ?? 'issue-close-failed'], error: result.error }
      actions.push(`close:${wanted.close}`)
      current = pm.cardState({ id, repo })
    }
    if (pr === 'merged') {
      const before = pm.readCard(id, { repo }).body
      const next = checkDodBoxes(before)
      if (next !== before) pm.updateCard({ id, repo, body: next })
      const after = pm.readCard(id, { repo }).body
      if (checkDodBoxes(after) !== after) return { confirmed: false, gaps: ['dod-write-failed'] }
      if (next !== before) actions.push('dod')
      const epic = pm.syncEpic({ id, repo })
      if (!epic.confirmed && epic.gap !== 'parent-absent') return { confirmed: false, gaps: [epic.gap ?? 'epic-sync-failed'], error: epic.error }
      if (epic.confirmed) actions.push('epic')
    }
    if (!current.member) {
      const result = pm.ensureBoardMembership({ id, repo })
      if (!result.confirmed) return { confirmed: false, gaps: [result.gap ?? 'board-membership-failed'], error: result.error }
      actions.push('membership')
      current = pm.cardState({ id, repo })
    }
    if (wanted.status === 'Review' && !target) return { confirmed: true, expected: null, actions, skipped: 'no-review-state' }
    if (target && current.boardState !== target) {
      const result = pm.setBoardState({ id, repo, state: target })
      if (!result.confirmed) return { confirmed: false, gaps: ['board-write-failed'], error: result.error, actions }
      actions.push(`status:${target}`)
    }
    return { confirmed: true, expected: target, actions }
  } catch (e) {
    return { confirmed: false, gaps: ['adapter-failed'], error: e.message }
  }
}

// `onRepair` observes each confirmed --apply repair (the caller records it as a manual unblock, AC-7).
export function auditCards({ pm, code, repo, mapping = DEFAULT, apply = false, onRepair }) {
  const mismatches = []
  const gaps = []
  let cards
  try {
    cards = pm.listCards({ repo })
  } catch (e) {
    return { mismatches, gaps: [{ id: null, reason: e.message }] }
  }
  for (const card of cards) {
    const id = String(card.id ?? card.number)
    try {
      const pr = code.linkedPr({ id, repo })
      const actual = pm.cardState({ id, repo })
      const decision = decideBoardState({ pr, issue: actual.issueState, reason: actual.issueReason, member: actual.member, board: actual.boardState })
      if (decision.gap) {
        gaps.push({ id, reason: decision.gap })
        continue
      }
      const expected = targetOf(decision.status, mapping)
      if (decision.status && !expected && decision.status !== 'Not planned') {
        gaps.push({ id, reason: `state-unmapped:${decision.status}` })
        continue
      }
      if (!decision.close && actual.member && (!expected || actual.boardState === expected)) continue
      mismatches.push({ id, actual: actual.boardState, expected })
      if (apply) {
        const result = applyBoardState({ pm, id, pr, repo, mapping })
        if (!result.confirmed) gaps.push({ id, reason: result.gaps?.join(',') ?? result.error })
        else onRepair?.({ id, actual: actual.boardState, expected })
      }
    } catch (e) {
      gaps.push({ id, reason: e.message })
    }
  }
  return { mismatches, gaps }
}

