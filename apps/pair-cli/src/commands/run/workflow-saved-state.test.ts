import { expect, it, vi } from 'vitest'
import type { FileSystemService } from '@pair/content-ops'
import { savedWorkflow } from './workflow-saved-state'

it('reads an expanded frozen workflow containing included step IDs (#726)', () => {
  const state = JSON.stringify({ card: '738', workflow: { name: 'delivery' }, steps: {} })
  const yaml = 'version: 1\nname: delivery\nsteps:\n  "included/review": { kind: review }\n'
  const fs = {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((path: string) => (path.endsWith('state.json') ? state : yaml)),
  } as unknown as FileSystemService
  expect(savedWorkflow({ card: '738', restart: false }, '/run', fs)?.workflow.steps[0]?.id).toBe(
    'included/review',
  )
})
