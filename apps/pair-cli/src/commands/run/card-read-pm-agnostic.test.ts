import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  readCardClosedAt,
  readCardDocumentViaGh,
  readCardLabels,
  readCardTier,
  readCardTitle,
} from './cycle-wiring'

/**
 * US-572 AC7: on `pm-tool: filesystem` (+ `code-host: github`) pair-cli reads the card through the
 * installed cycle skill's bound adapter — the backlog file — with no `gh` on PATH at all.
 */
const SCRIPTS_SRC = join(
  __dirname,
  '../../../../../packages/knowledge-hub/dataset/.skills/workflow/cycle/scripts',
)
const CARD =
  '# US 01-01-001: Login\n\n**Status**: In Progress\n**Labels**: risk:yellow, cli\n\nbody\n'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'card-read-fs-')))
  cpSync(SCRIPTS_SRC, join(root, '.claude/skills/pair-workflow-cycle/scripts'), { recursive: true })
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  writeFileSync(
    join(root, '.pair/adoption/tech/way-of-working.md'),
    '- `pm-tool`: `filesystem`\n\n## Git Workflow\n\n- `code-host`: `github`\n',
  )
  const stories = join(root, '.pair/adoption/product/backlog/03-user-stories')
  mkdirSync(join(stories, 'in-progress'), { recursive: true })
  mkdirSync(join(stories, 'completed'), { recursive: true })
  writeFileSync(join(stories, 'in-progress/01-01-001-login.md'), CARD)
  writeFileSync(join(stories, 'completed/01-01-002-logout.md'), '# Logout\n\n**Status**: Done\n')
  const bin = join(root, 'bin')
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, 'node'))
  vi.stubEnv('PATH', bin)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('pair-cli reads a filesystem card through the bound adapter (US-572)', () => {
  it('labels, tier, title and board state come from the backlog file', () => {
    expect(readCardLabels('01-01-001', root)).toEqual(['risk:yellow', 'cli'])
    expect(readCardTier('01-01-001', root)).toBe('risk:yellow')
    expect(readCardTitle('01-01-001', root)).toBe('US 01-01-001: Login')
    expect(readCardDocumentViaGh('01-01-001', root).boardState).toBe('In Progress')
  })

  it('closure: an open card is null, a completed one carries a date', () => {
    expect(readCardClosedAt('01-01-001', root)).toBeNull()
    expect(readCardClosedAt('01-01-002', root)).toBeInstanceOf(Date)
  })

  it('an unknown or path-shaped id is unreadable, never a guess', () => {
    expect(readCardLabels('09-09-009', root)).toBeUndefined()
    expect(readCardLabels('../etc', root)).toBeUndefined()
  })
})
