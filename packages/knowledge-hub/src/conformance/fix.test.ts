import { fileSystemService as fs } from '@pair/content-ops'
import { join } from 'path'
import { expect, it } from 'vitest'

it.each([
  ['dataset', '../../dataset/.skills/process/fix/SKILL.md'],
  ['installed mirror', '../../../../.claude/skills/pair-process-fix/SKILL.md'],
])('#728 AC 22: %s fix declares every result status', (_, file) => {
  const skill = fs.readFileSync(join(__dirname, file))
  const statuses = /^- `status`:(.*)$/m.exec(skill)?.[1]

  expect(skill.match(/\bneeds-human\b/g)).toBeNull()
  expect(statuses?.match(/`[^`]+`/g)?.sort()).toEqual([
    '`blocked`',
    '`failed`',
    '`needs-decision`',
    '`ok`',
  ])
})
