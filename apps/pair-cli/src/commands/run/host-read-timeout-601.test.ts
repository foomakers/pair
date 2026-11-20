import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('./host-process', () => ({
  runHostProcess: vi.fn(async () => ({
    status: null,
    stdout: '',
    stderr: '',
    error: new Error('host command timed out after 30000ms'),
  })),
}))

import { readCardDocumentViaGh, readPrLabels } from './cycle-wiring'

it.each(['card', 'pr'] as const)(
  '#601 AC3: timeout of %s host read stays host-transient',
  async kind => {
    const cwd = mkdtempSync(join(tmpdir(), 'pair-601-host-timeout-'))
    const scripts = join(cwd, '.claude/skills/pair-workflow-cycle/scripts')
    mkdirSync(scripts, { recursive: true })
    writeFileSync(join(scripts, 'cycle-state.mjs'), '')
    const pending = kind === 'card' ? readCardDocumentViaGh('601', cwd) : readPrLabels('7', cwd)
    await expect(pending).rejects.toThrow(/host-transient.*timed out/)
  },
)
