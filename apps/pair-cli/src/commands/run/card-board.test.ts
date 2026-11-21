import { describe, expect, it } from 'vitest'
import { fileSystemService as fs } from '@pair/content-ops'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { ghBoard } from './card-board'

// AC-13: the board state set on the card's project item, membership first. Fake `gh`, real adapter.
const SCRIPTS = resolve(__dirname, '../../../../../.claude/skills/pair-workflow-cycle/scripts')
const WOW = '# way\n\n- `pm-project`: `B`\n- GitHub Projects\n'

const setup = (member: boolean, failWrites = false) => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'pair-board-'))
  const log = join(dir, 'log.json')
  fs.writeFileSync(log, JSON.stringify({ member, calls: [] }))
  fs.mkdirSync(join(dir, '.pair/adoption/tech'), { recursive: true })
  fs.writeFileSync(join(dir, '.pair/adoption/tech/way-of-working.md'), WOW)
  const bin = join(dir, 'gh')
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const s = JSON.parse(fs.readFileSync(${JSON.stringify(log)}, 'utf8'))
const q = (a.find(x => x.startsWith('query=')) || '').slice(6); const out = x => process.stdout.write(JSON.stringify(x))
s.calls.push(q.split('{')[0] + (a.find(x => x.startsWith('option=')) || ''))
const save = () => fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify(s))
if (a[0] === 'repo') process.stdout.write('o/r\\n')
else if (a[0] === 'project') out({ projects: [{ id: 'P1', title: 'B', number: 1 }] })
else if (q.startsWith('mutation($project:ID!,$content')) { ${failWrites ? 'process.exit(1)' : 's.member = true'} ; out({}) }
else if (q.startsWith('mutation')) { s.set = a.find(x => x.startsWith('option=')).slice(7); out({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { fieldValueByName: { name: s.set === 'o2' ? 'Review' : 'Todo' } } } } }) }
else out({ data: { repository: { issue: { id: 'I1', projectItems: { nodes: s.member ? [{ id: 'IT1', project: { id: 'P1', title: 'B', fields: { nodes: [{ id: 'F1', name: 'Status', options: [{ id: 'o1', name: 'Todo' }, { id: 'o2', name: 'Review' }] }] } } }] : [] } } } } })
save()
`,
  )
  fs.chmodSync(bin, 0o755)
  return { dir, bin, read: () => JSON.parse(fs.readFileSync(log)) }
}

describe('ghBoard.setState', () => {
  it('sets the Status option id of the literal on the card item', async () => {
    const t = setup(true)
    await ghBoard(fs, SCRIPTS, t.dir, t.bin).setState('627', 'Review')
    expect(t.read().set).toBe('o2')
  })

  it('adds the item when it is not on the board, then sets the state', async () => {
    const t = setup(false)
    await ghBoard(fs, SCRIPTS, t.dir, t.bin).setState('627', 'Review')
    expect(t.read().member).toBe(true)
    expect(t.read().set).toBe('o2')
  })

  it('throws what the read observed when membership stays unconfirmed; no state written', async () => {
    const t = setup(false, true)
    await expect(ghBoard(fs, SCRIPTS, t.dir, t.bin).setState('627', 'Review')).rejects.toThrow(
      /membership unconfirmed/,
    )
    expect(t.read().set).toBeUndefined()
  })
})
