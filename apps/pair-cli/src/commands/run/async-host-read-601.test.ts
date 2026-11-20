import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readCardDocumentViaGh, readPrLabels } from './cycle-wiring'

it.each(['card', 'pr'] as const)(
  '#601 AC3: %s host read does not block the event loop',
  async kind => {
    const cwd = mkdtempSync(join(tmpdir(), 'pair-601-read-'))
    const scripts = join(cwd, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    writeFileSync(
      join(scripts, 'cycle-state.mjs'),
      `setTimeout(() => console.log(JSON.stringify(process.argv[2] === 'card' ? {title:'Example',body:'',labels:[],state:'OPEN'} : {labels:['risk:red']})), 100)`,
    )
    let ticked = false
    setImmediate(() => {
      ticked = true
    })
    const pending = kind === 'card' ? readCardDocumentViaGh('601', cwd) : readPrLabels('7', cwd)
    const value = await pending
    expect(ticked).toBe(true)
    expect(kind === 'card' ? value : (value as readonly string[])?.[0]).toEqual(
      kind === 'card' ? expect.objectContaining({ title: 'Example' }) : 'risk:red',
    )
  },
)
