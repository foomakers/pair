/**
 * test-audit pre-push profile (US-625 T-3): wall time of each step of the root `quality-gate`
 * (what the pre-push hook runs), one process per step, in gate order. A failing step is recorded,
 * not fatal: the profile needs every step's time. Output: JSON on stdout.
 */
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

import { REPO_ROOT } from '../quality-gates/repo-root'

export interface StepProfile {
  command: string
  exit: number
  ms: number
}

export const gateSteps = (gate: string): string[] => gate.split(' && ').map(s => s.trim())

export function profileStep(cwd: string, command: string): StepProfile {
  const t0 = Date.now()
  const r = spawnSync(command, { cwd, shell: true, stdio: ['ignore', 'ignore', 'inherit'] })
  return { command, exit: r.status ?? 1, ms: Date.now() - t0 }
}

if (require.main === module) {
  const gate = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts[
    'quality-gate'
  ]
  const only = process.argv[2]
  const steps = gateSteps(gate).filter((_, i) => only === undefined || i === Number(only))
  const profile = steps.map(s => profileStep(REPO_ROOT, s))
  console.log(JSON.stringify({ steps: profile, total_ms: profile.reduce((a, p) => a + p.ms, 0) }))
}
