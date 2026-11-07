import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseStateMapping,
  resolveControlState,
  resolveMacrostate,
  unmetReadinessCriteria,
  validateStatusFilter,
} from '../packages/knowledge-hub/dataset/.skills/next/control-state.mjs'

const script = fileURLToPath(
  new URL('../packages/knowledge-hub/dataset/.skills/next/control-state.mjs', import.meta.url),
)
const mapping = rows =>
  parseStateMapping(
    `## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n${rows.map(row => `| ${row[0]} | ${row[1]} |`).join('\n')}\n`,
  )
const full = `## Story Statement\n**As a** user\n**I want** a state\n**So that** work proceeds\n## Acceptance Criteria\nGiven input When read Then resolve\n## Story Sizing and Sprint Readiness\n**Final Story Points**: 3\n## Dependencies and Coordination\n**Story Dependencies**: none\n## Technical Analysis\nDesign: not required\n`
const card = (boardState, body = full, title = 'Work') => ({ boardState, body, title })

test('mapping decisions cover aliases, canonical precedence, duplicates and failures', () => {
  const map = mapping([
    ['Todo', 'Draft'],
    ['Next', 'Ready'],
    ['Later', 'Ready'],
    ['todo', 'Draft'],
  ])
  assert.equal(map.length, 3)
  assert.equal(resolveMacrostate('nExT', map), 'Ready')
  assert.equal(resolveMacrostate('rEaDy', map), 'Ready')
  assert.equal(resolveMacrostate('unknown', map), undefined)
  assert.equal(resolveMacrostate('Todo', mapping([['Todo', 'Done']])), 'Done')
  assert.throws(
    () =>
      mapping([
        ['Todo', 'Draft'],
        ['todo', 'Ready'],
      ]),
    /two macrostates/,
  )
  assert.throws(() => mapping([['Todo', 'Unknown']]), /not one of/)
  assert.throws(() => parseStateMapping('## State Mapping\n\ninvalid'), /no parseable/)
  assert.throws(
    () =>
      parseStateMapping(
        '## State Mapping\n\n| A | B |\n| --- | --- |\n| A | Draft |\n## State Mapping',
      ),
    /declared 2 times/,
  )
})

test('DoR and routing cover every state and the Draft/Ready boundary', () => {
  const map = mapping([
    ['Todo', 'Draft'],
    ['Next', 'Ready'],
    ['Doing', 'In Progress'],
    ['QA', 'Review'],
    ['Closed', 'Done'],
  ])
  for (const [literal, expected] of [
    ['Todo', 'Draft'],
    ['Next', 'Ready'],
    ['Doing', 'In Progress'],
    ['QA', 'Review'],
    ['Closed', 'Done'],
  ]) {
    assert.equal(resolveControlState(card(literal), map).macrostate, expected)
  }
  assert.equal(
    resolveControlState(card('unknown'), map).outOfProcess,
    'board state "unknown" is unmapped',
  )
  assert.match(resolveControlState(card(undefined), map).outOfProcess, /not declared/)
  assert.equal(resolveControlState(card('Next', ''), map).macrostate, 'Ready')
  assert.equal(resolveControlState(card('Next', ''), map).warnings.length, 1)
  assert.match(resolveControlState(card('Closed'), map).outOfProcess, /"Closed" resolves to Done/)
})

test('the six DoR failures and inline breakdown are resolved at the boundary', () => {
  const noReady = mapping([
    ['Todo', 'Draft'],
    ['Closed', 'Done'],
  ])
  assert.equal(resolveControlState(card('Todo'), noReady).macrostate, 'Ready')
  assert.equal(resolveControlState(card('Todo', ''), noReady).macrostate, 'Draft')
  assert.deepEqual(unmetReadinessCriteria(card('Todo', '', '[Title]')), [
    'Clear title',
    'Problem/goal',
    'Verifiable AC',
    'Estimate',
    'Dependencies',
    'Design flag',
  ])
  const criteria = [
    ['Clear title', card('Todo', full, '[Title]')],
    ['Problem/goal', card('Todo', full.replace('**I want** a state', ''))],
    ['Verifiable AC', card('Todo', full.replace('Given input When read Then resolve', ''))],
    ['Estimate', card('Todo', full.replace('**Final Story Points**: 3', ''))],
    ['Dependencies', card('Todo', full.replace('**Story Dependencies**: none', ''))],
    ['Design flag', card('Todo', full.replace('Design: not required', ''))],
  ]
  for (const [name, document] of criteria) {
    assert.deepEqual(unmetReadinessCriteria(document), [name])
    assert.match(resolveControlState(document, noReady).explanation, new RegExp(name))
  }
  assert.equal(
    resolveControlState(
      card('Todo', full.replace('Design: not required', '')),
      noReady,
    ).explanation.includes('Design flag'),
    true,
  )
  assert.equal(
    resolveControlState(
      card(
        'Todo',
        '## Story Statement\n**As a** user\n**I want** a thing\n**So that** it works\n## Technical Analysis\nDesign: not required\n## Task Breakdown\n- [ ] T1',
      ),
      noReady,
    ).readiness,
    'ready',
  )
})

test('status filter validates mapped availability', () => {
  const map = mapping([
    ['Todo', 'Draft'],
    ['Closed', 'Done'],
  ])
  assert.deepEqual(validateStatusFilter('Draft,Ready,Done', map), ['Draft', 'Ready', 'Done'])
  assert.throws(() => validateStatusFilter('Review', map), /mapped states/)
  assert.throws(() => validateStatusFilter('Todo', map), /status-filter-invalid/)
})

test('real executable reads a consuming project adoption', () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-state-'))
  try {
    const path = join(root, '.pair/adoption/tech/way-of-working.md')
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(
      path,
      '## State Mapping\n\n| Board State | Macrostate |\n| --- | --- |\n| Todo | Draft |\n| Next | Ready |\n',
    )
    const answer = JSON.parse(
      execFileSync(
        process.execPath,
        [script, 'resolve', root, JSON.stringify(card('Next', full))],
        { encoding: 'utf8' },
      ),
    )
    assert.equal(answer.macrostate, 'Ready')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
