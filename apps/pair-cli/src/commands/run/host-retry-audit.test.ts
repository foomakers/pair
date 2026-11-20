import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { readRecords } from './telemetry'
import { relayHostRetries, withHostRetryContext } from './host-retry-audit'
import { createCycleScriptsBridge } from './cycle-scripts'
import { readCardDocumentViaGh, readPrLabels } from './cycle-wiring'

it('#601 AC5: retry events reach console and attributed telemetry without host secrets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-audit-'))
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await withHostRetryContext({ root, card: '601', run: 'story-601', enabled: true }, async () => {
      relayHostRetries(
        'authorization: secret\nHOST-RETRY: operation=secret attempt=2 outcome=recovered\nHOST-RETRY: operation=gh:issue:read attempt=2 outcome=recovered\n',
      )
    })
    const events = readRecords(root)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      schema: 2,
      epic: null,
      pr: null,
      branch: null,
      step: null,
      phase: null,
      block: null,
      round: null,
      group: null,
      engine: null,
      model: null,
      effort: null,
      profile: null,
      tier: null,
      cause: null,
    })
    expect(events[0]).toMatchObject({
      kind: 'event',
      event: 'host-retry',
      card: '601',
      run: 'story-601',
      operation: 'gh:issue:read',
      attempt: 2,
      outcome: 'recovered',
    })
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('operation=gh:issue:read'))
  } finally {
    log.mockRestore()
  }
})

it.each(['card', 'pr'])('#601 AC5: recovered %s reads persist retry events', async kind => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-read-audit-'))
  const scripts = join(root, '.claude/skills/pair-workflow-cycle/scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(
    join(scripts, 'cycle-state.mjs'),
    `process.stderr.write('HOST-RETRY: operation=gh:issue:read attempt=2 outcome=recovered\\n');process.stdout.write(JSON.stringify(process.argv[2]==='card'?{title:'Example',body:'',labels:[],state:'OPEN'}:{labels:['risk:red']}))`,
  )
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await withHostRetryContext({ root, card: '601', run: 'story-601', enabled: true }, async () => {
      if (kind === 'card') await readCardDocumentViaGh('601', root)
      else await readPrLabels('7', root)
    })
    expect(readRecords(root)).toEqual([
      expect.objectContaining({
        card: '601',
        run: 'story-601',
        operation: 'gh:issue:read',
        attempt: 2,
        outcome: 'recovered',
      }),
    ])
    expect(log).toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})

it.each(['card', 'pr'])('#601 AC5: exhausted %s reads persist retry events', async kind => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-exhausted-audit-'))
  const scripts = join(root, '.claude/skills/pair-workflow-cycle/scripts')
  mkdirSync(scripts, { recursive: true })
  writeFileSync(
    join(scripts, 'cycle-state.mjs'),
    `process.stderr.write('HOST-RETRY: operation=gh:issue:read attempt=4 outcome=exhausted\\nhost-transient: HTTP 503 secret\\n');process.exit(1)`,
  )
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await withHostRetryContext({ root, card: '601', run: 'story-601', enabled: true }, async () => {
      const read = kind === 'card' ? readCardDocumentViaGh('601', root) : readPrLabels('7', root)
      await expect(read).rejects.toThrow(/host-transient/)
      if (kind === 'pr') await expect(read).rejects.not.toThrow(/secret/)
    })
    expect(readRecords(root)).toEqual([
      expect.objectContaining({ card: '601', run: 'story-601', attempt: 4, outcome: 'exhausted' }),
    ])
    expect(log).toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})

it('#601 AC5: decision bridge persists actual host retry events', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pair-601-bridge-audit-'))
  writeFileSync(
    join(root, 'cycle-state.mjs'),
    'process.stderr.write("HOST-RETRY: operation=gh:issue:read attempt=2 outcome=recovered\\n");process.stdout.write("{}")',
  )
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const bridge = createCycleScriptsBridge({ scriptsDir: root }, root)
    await withHostRetryContext({ root, card: '601', run: 'story-601', enabled: true }, async () => {
      await bridge.decisions?.({ dir: root, story: '601' })
    })
    expect(readRecords(root)).toEqual([
      expect.objectContaining({
        card: '601',
        run: 'story-601',
        operation: 'gh:issue:read',
        attempt: 2,
        outcome: 'recovered',
      }),
    ])
    expect(log).toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
