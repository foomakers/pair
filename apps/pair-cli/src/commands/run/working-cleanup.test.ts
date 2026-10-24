import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readWorkingCleanup, sweepWorkingArea, DEFAULT_CLEANUP } from './working-cleanup'

/** US-576 AC7: `## Working Cleanup` and the start-of-run sweep of Done cards' run state. */

const DAY = 86_400_000
const section = (line: string) => `# A\n\n## Working Cleanup\n\n${line}\n`

describe('readWorkingCleanup', () => {
  it('defaults to `after 7d` (absent file, absent section)', () => {
    expect(readWorkingCleanup(undefined)).toEqual(DEFAULT_CLEANUP)
    expect(readWorkingCleanup('# A\n')).toEqual({ mode: 'after', ms: 7 * DAY, text: 'after 7d' })
  })

  it('reads never | on-close | after <n>d|h|m; `after 0d` is on-close', () => {
    expect(readWorkingCleanup(section('cleanup: never'))).toEqual({ mode: 'never', text: 'never' })
    expect(readWorkingCleanup(section('cleanup: on-close'))).toEqual({ mode: 'after', ms: 0, text: 'on-close' })
    expect(readWorkingCleanup(section('cleanup: after 0d'))).toEqual({ mode: 'after', ms: 0, text: 'after 0d' })
    expect(readWorkingCleanup(section('cleanup: after 12h'))).toMatchObject({ ms: 12 * 3_600_000 })
    expect(readWorkingCleanup(section('cleanup: after 30m'))).toMatchObject({ ms: 30 * 60_000 })
  })

  it.each(['cleanup: sometimes', 'cleanup: after 7', 'cleanup: after -1d', 'keep: never', ''])(
    'HALTs on a malformed declaration (%j), naming the expected grammar',
    line => {
      expect(() => readWorkingCleanup(section(line))).toThrow(/never \| on-close \| after <n>/)
    },
  )
})

function area() {
  const root = mkdtempSync(join(tmpdir(), 'working-cleanup-'))
  const card = (run: string, id: string) => {
    mkdirSync(join(root, 'runs', run, id), { recursive: true })
    writeFileSync(join(root, 'runs', run, id, 'handoff.json'), '{}')
    mkdirSync(join(root, 'checkpoints'), { recursive: true })
    writeFileSync(join(root, 'checkpoints', `${id}.md`), '# cp')
  }
  card('story-1', '1') // Done 10 days ago
  card('story-2', '2') // Done 1 day ago
  card('story-3', '3') // open: parked / escalated / failed / reopened
  card('story-4', '4') // unreadable
  mkdirSync(join(root, 'automation'), { recursive: true })
  writeFileSync(join(root, 'automation', 'loop-audit.md'), 'audit')
  return root
}

const NOW = new Date('2026-10-24T00:00:00Z')
const closedAt = (id: string): Date | null | undefined =>
  ({ '1': new Date(NOW.getTime() - 10 * DAY), '2': new Date(NOW.getTime() - DAY), '3': null })[id]

describe('sweepWorkingArea', () => {
  it('removes runs/<card>/** and the checkpoint of cards Done longer than the duration — nothing else', () => {
    const root = area()
    const removed = sweepWorkingArea({ workingArea: root, policy: DEFAULT_CLEANUP, closedAt, now: NOW })
    expect(removed).toEqual(['1'])
    expect(existsSync(join(root, 'runs', 'story-1'))).toBe(false)
    expect(existsSync(join(root, 'checkpoints', '1.md'))).toBe(false)
    for (const id of ['2', '3', '4']) {
      expect(existsSync(join(root, 'runs', `story-${id}`, id, 'handoff.json'))).toBe(true)
      expect(existsSync(join(root, 'checkpoints', `${id}.md`))).toBe(true)
    }
    expect(existsSync(join(root, 'automation', 'loop-audit.md'))).toBe(true)
  })

  it('on-close removes every Done card, never an open (parked / reopened) or unreadable one', () => {
    const root = area()
    expect(
      sweepWorkingArea({ workingArea: root, policy: readWorkingCleanup(section('cleanup: after 0d')), closedAt, now: NOW }),
    ).toEqual(['1', '2'])
  })

  it('never removes nothing and reads no card state; a missing working area is a no-op', () => {
    const root = area()
    let reads = 0
    const count = (id: string) => ((reads += 1), closedAt(id))
    expect(sweepWorkingArea({ workingArea: root, policy: { mode: 'never', text: 'never' }, closedAt: count, now: NOW })).toEqual([])
    expect(reads).toBe(0)
    expect(sweepWorkingArea({ workingArea: join(root, 'nope'), policy: DEFAULT_CLEANUP, closedAt, now: NOW })).toEqual([])
  })
})
