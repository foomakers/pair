// Every cycle stage resolves the durable state with the SAME inputs, card hash included: a stage
// that omits `--acHash` sees a different `next` after a card edit than one that passes it, and
// the two redirect each other forever (observed on #433: red-spec ⇒ verify, review-phase ⇒ prepare).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), '../../skills')
const STAGES = ['pair-workflow-cycle', 'pair-workflow-implement-phase', 'pair-workflow-red-spec', 'pair-workflow-red-verify', 'pair-workflow-green-fix', 'pair-workflow-review-phase']

const resolveCommands = text => {
  const lines = text.split('\n')
  const out = []
  lines.forEach((line, i) => {
    if (!/^\s*node .*cycle-state\.mjs"? resolve\b/.test(line)) return
    let cmd = line
    for (let j = i; lines[j].trimEnd().endsWith('\\') && j + 1 < lines.length; j++) cmd += '\n' + lines[j + 1]
    out.push(cmd)
  })
  return out
}

for (const stage of STAGES) {
  test(`${stage}: every \`cycle-state.mjs resolve\` it prescribes passes --acHash`, () => {
    const cmds = resolveCommands(readFileSync(join(SKILLS, stage, 'SKILL.md'), 'utf8'))
    assert.ok(cmds.length > 0, `${stage} prescribes no resolve`)
    for (const cmd of cmds) assert.match(cmd, /--acHash\b/, `${stage}: resolve without --acHash:\n${cmd}`)
  })
}
