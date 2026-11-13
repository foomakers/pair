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

export function stateMapping(text) {
  const section = /^## State Mapping[ \t]*\r?\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m.exec(String(text ?? ''))?.[1]
  if (section === undefined) return { ...DEFAULT }
  const map = {}
  for (const line of section.split('\n')) {
    const cells = line.split('|').map(s => s.trim())
    if (cells.length < 4 || !Object.hasOwn(DEFAULT, cells[2])) continue
    if (!map[cells[2]]) map[cells[2]] = cells[1]
  }
  return map
}

export function decideBoardState({ pr, issue, reason, member = true }) {
  if (!['merged', 'closed-unmerged', 'open', 'none'].includes(pr)) return { gap: 'pr-state-unreadable' }
  if (!['OPEN', 'CLOSED'].includes(issue)) return { gap: 'issue-state-unreadable' }
  if (pr === 'merged') return { status: 'Done', close: issue === 'CLOSED' && reason === 'COMPLETED' ? null : 'merged' }
  if (issue === 'CLOSED') return { status: pr === 'none' && reason === 'COMPLETED' ? 'Done' : 'Not planned', close: null }
  if (pr === 'closed-unmerged') return { status: 'Not planned', close: 'unmerged' }
  if (pr === 'open') return { status: 'Review', close: null }
  return { status: member ? null : 'Todo', close: null }
}

export function applyBoardState({ pm, id, pr, repo, mapping = DEFAULT }) {
  try {
    let current = pm.cardState({ id, repo })
    const wanted = decideBoardState({ pr, issue: current.issueState, reason: current.issueReason, member: current.member })
    if (wanted.gap) return { confirmed: false, gaps: [wanted.gap] }
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
    const target = wanted.status === 'Todo' ? mapping.Draft : wanted.status === 'Not planned' ? 'Not planned' : wanted.status ? mapping[wanted.status] : null
    if (wanted.status === 'Review' && !target) return { confirmed: true, expected: null, actions, skipped: 'no-review-state' }
    if (wanted.status && !target) return { confirmed: false, gaps: [`state-unmapped:${wanted.status}`], actions }
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

export function auditCards({ pm, code, repo, mapping = DEFAULT, apply = false }) {
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
      const decision = decideBoardState({ pr, issue: actual.issueState, reason: actual.issueReason, member: actual.member })
      if (decision.gap) {
        gaps.push({ id, reason: decision.gap })
        continue
      }
      const expected = decision.status === 'Todo' ? mapping.Draft : decision.status === 'Not planned' ? 'Not planned' : decision.status ? mapping[decision.status] : null
      if (decision.status && !expected) {
        gaps.push({ id, reason: `state-unmapped:${decision.status}` })
        continue
      }
      if (!decision.close && actual.member && (!expected || actual.boardState === expected)) continue
      mismatches.push({ id, actual: actual.boardState, expected })
      if (apply) {
        const result = applyBoardState({ pm, id, pr, repo, mapping })
        if (!result.confirmed) gaps.push({ id, reason: result.gaps?.join(',') ?? result.error })
      }
    } catch (e) {
      gaps.push({ id, reason: e.message })
    }
  }
  return { mismatches, gaps }
}

