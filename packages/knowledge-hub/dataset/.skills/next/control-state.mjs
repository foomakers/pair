#!/usr/bin/env node
// Canonical control-state authority shared by pair-next and pair run.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MACROSTATES = ['Draft', 'Ready', 'In Progress', 'Review', 'Done']
const WAY = '.pair/adoption/tech/way-of-working.md'
const SCHEMA =
  '.pair/knowledge/guidelines/collaboration/project-management-tool/canonical-states.md § State-Mapping Schema'
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
const canonical = value => MACROSTATES.find(state => same(state, value))

function sections(markdown, heading) {
  const bodies = []
  let current
  let fenced = false
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      fenced = !fenced
      if (current) current.push(raw)
    } else if (!fenced && /^##\s+/.test(line)) {
      if (current) bodies.push(current)
      current = line.replace(/^##\s+/, '') === heading ? [] : undefined
    } else if (current) current.push(raw)
  }
  if (current) bodies.push(current)
  return bodies
}

function malformed(detail) {
  throw new Error(
    `state-mapping-malformed: ${WAY} \`## State Mapping\` — ${detail}. See ${SCHEMA}; fix the table, then re-run.`,
  )
}
const cells = row =>
  row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())

export function parseStateMapping(markdown) {
  const bodies = sections(markdown, 'State Mapping')
  if (bodies.length === 0) return undefined
  if (bodies.length > 1) malformed(`the section is declared ${bodies.length} times`)
  const rows = bodies[0].map(line => line.trim()).filter(line => line.startsWith('|'))
  if (rows.length < 2 || !cells(rows[1]).every(cell => /^:?-{3,}:?$/.test(cell)))
    malformed('no parseable two-column table')
  if (rows.length === 2) malformed('the table declares no board state')
  const result = []
  for (const raw of rows.slice(2)) {
    const row = cells(raw)
    if (row.length !== 2 || !row[0])
      malformed(`row ${JSON.stringify(raw)} is not \`| Board State | Macrostate |\``)
    const macrostate = canonical(row[1])
    if (!macrostate)
      malformed(
        `\`${row[0]}\` maps to ${JSON.stringify(row[1])}, which is not one of ${MACROSTATES.join(', ')}`,
      )
    const prior = result.find(seen => same(seen.boardState, row[0]))
    if (!prior) result.push({ boardState: row[0], macrostate })
    else if (prior.macrostate !== macrostate)
      malformed(
        `board state \`${row[0]}\` is listed under two macrostates (${prior.macrostate} and ${macrostate})`,
      )
  }
  return result
}

export function readStateMapping(projectRoot) {
  const path = join(projectRoot, WAY)
  return existsSync(path) ? parseStateMapping(readFileSync(path, 'utf8')) : undefined
}

export function resolveMacrostate(literal, mapping) {
  return mapping?.find(row => same(row.boardState, literal))?.macrostate ?? canonical(literal)
}

export function readyBoardState(mapping) {
  if (mapping === undefined) return 'Ready'
  const row = mapping.find(row => row.macrostate === 'Ready')
  if (!row)
    throw new Error(
      `no-ready-state: ${WAY} \`## State Mapping\` maps no board state to Ready, so Ready cannot be written. See ${SCHEMA}.`,
    )
  return row.boardState
}

const section = (body, heading) =>
  sections(body, heading)
    .map(lines => lines.join('\n'))
    .join('\n')
const label = (text, name) =>
  new RegExp(`^\\s*\\**${name}\\**\\s*:?\\**\\s*(.*)$`, 'im').exec(text)?.[1]
const filled = value => !!value?.trim() && !/^\[[^\]]*\]$/.test(value.trim())
export const hasTaskBreakdown = body =>
  /^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(section(body, 'Task Breakdown'))

export function unmetReadinessCriteria(card) {
  const body = card.body
  const breakdown = hasTaskBreakdown(body)
  const statement = section(body, 'Story Statement')
  const criteria = [
    ['Clear title', filled(card.title)],
    ['Problem/goal', ['As an?', 'I want', 'So that'].every(name => filled(label(statement, name)))],
    [
      'Verifiable AC',
      breakdown ||
        /\bGiven\b[\s\S]*?\bWhen\b[\s\S]*?\bThen\b/i.test(section(body, 'Acceptance Criteria')),
    ],
    [
      'Estimate',
      breakdown ||
        filled(label(section(body, 'Story Sizing and Sprint Readiness'), 'Final Story Points')),
    ],
    [
      'Dependencies',
      breakdown || /Story Dependencies/i.test(section(body, 'Dependencies and Coordination')),
    ],
    [
      'Design flag',
      /\bDesign\b\**\s*:\s*\**\s*(not required|required\s*[—–-]+\s*reference)/i.test(
        section(body, 'Technical Analysis'),
      ),
    ],
  ]
  return criteria.filter(([, met]) => !met).map(([name]) => name)
}

export function resolveControlState(card, mapping) {
  const literal = card.boardState
  if (literal == null)
    return {
      macrostate: null,
      readiness: null,
      outOfProcess: `board state ${JSON.stringify(null)} is not declared by the card`,
      warnings: [],
    }
  const mapped = resolveMacrostate(literal, mapping)
  if (!mapped)
    return {
      macrostate: null,
      readiness: null,
      outOfProcess: `board state ${JSON.stringify(literal)} is unmapped`,
      warnings: [],
    }
  const unmet = unmetReadinessCriteria(card)
  const warnings =
    mapped === 'Ready' && unmet.length ? [`state says Ready, DoR fails: ${unmet.join(', ')}`] : []
  const via = `board state \`${literal}\` ⇒ ${mapped}`
  if (mapped === 'Done')
    return {
      macrostate: 'Done',
      readiness: null,
      outOfProcess: `board state ${JSON.stringify(literal)} resolves to Done (delivered)`,
      warnings,
    }
  if (mapped === 'Review')
    return { macrostate: 'Review', readiness: 'ready', explanation: via, warnings }
  const ready = () => (hasTaskBreakdown(card.body) ? 'ready' : 'refined-no-breakdown')
  if (mapped === 'Ready' || mapped === 'In Progress')
    return {
      macrostate: mapped,
      readiness: ready(),
      explanation: `${via}, ${hasTaskBreakdown(card.body) ? 'task breakdown present' : 'no task breakdown yet'}`,
      warnings,
    }
  if (mapping === undefined || mapping.some(row => row.macrostate === 'Ready'))
    return { macrostate: 'Draft', readiness: 'draft', explanation: via, warnings }
  const fallback = `${via}; no board state maps to Ready, so the Definition of Ready decides`
  if (unmet.length)
    return {
      macrostate: 'Draft',
      readiness: 'draft',
      explanation: `${fallback} — unmet: ${unmet.join(', ')}`,
      warnings,
    }
  return {
    macrostate: 'Ready',
    readiness: ready(),
    explanation: `${fallback} — all six criteria met, ${hasTaskBreakdown(card.body) ? 'task breakdown present' : 'no task breakdown yet'}`,
    warnings,
  }
}

export function validateStatusFilter(value, mapping) {
  const states = value.split(',').map(value => value.trim())
  const available = [
    ...new Set([...(mapping?.map(row => row.macrostate) ?? MACROSTATES), 'Draft', 'Ready']),
  ]
  for (const state of states) {
    if (!MACROSTATES.includes(state) || !available.includes(state)) {
      throw new Error(
        `status-filter-invalid: ${JSON.stringify(state)} is unavailable; mapped states: ${available.join(', ')}`,
      )
    }
  }
  return states
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, projectRoot, json] = process.argv.slice(2)
    const mapping = readStateMapping(projectRoot ?? process.cwd())
    const result =
      command === 'resolve'
        ? resolveControlState(JSON.parse(json), mapping)
        : command === 'mapping'
          ? (mapping ?? null)
          : command === 'ready-board-state'
            ? readyBoardState(mapping)
            : command === 'status-filter'
              ? validateStatusFilter(json, mapping)
              : (() => {
                  throw new Error(`unknown command: ${command}`)
                })()
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
