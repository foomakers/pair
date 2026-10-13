import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const REPO = join(__dirname, '../../../..')
const DATASET = join(__dirname, '../../dataset')
const OWNER = '.pair/knowledge/guidelines/collaboration/automation/delivery-cycle.md'
const ANCHOR = 'timeouts-stalls-and-retries-by-surface'
const read = (path: string) => readFileSync(path, 'utf-8')

describe('"Timeouts, stalls and retries by surface" — one owner, referenced everywhere else', () => {
  const owner = read(join(DATASET, OWNER))
  const section = owner.slice(owner.indexOf('## 9. Timeouts, stalls and retries by surface'))

  it('the KB delivery-cycle page owns the section (and its table of contents lists it)', () => {
    expect(owner).toMatch(/^## \d+\. Timeouts, stalls and retries by surface$/m)
    expect(owner).toContain(`](#9-timeouts-stalls-and-retries-by-surface)`)
  })

  it('states the exact facts, per surface', () => {
    for (const re of [
      /--iteration-timeout/,
      /1800/,
      /SIGTERM/,
      /deadDispatchRetries/,
      /failed-<stage>/,
      /selection/i,
      /transient/i,
      /durable/i,
      /retry budget/i,
      /stale lock|dead pid/i,
      /Step 4/,
      /agentTimeoutMinutes/,
      /30 minutes/,
      /setTimeout/,
      /continue-token/i,
      /human check required/,
      /second writer/,
    ])
      expect(section).toMatch(re)
  })

  it.each([
    'apps/website/content/docs/reference/delivery-cycle.mdx',
    'apps/website/content/docs/reference/cli/commands.mdx',
  ])('%s references the owner section instead of duplicating it', file => {
    expect(read(join(REPO, file))).toContain(ANCHOR)
  })

  it.each([
    '.skills/loop/SKILL.md',
    '.pair/knowledge/guidelines/collaboration/automation/automation-policy.md',
  ])('%s references the owner section', file => {
    expect(read(join(DATASET, file))).toContain(ANCHOR)
  })
})
