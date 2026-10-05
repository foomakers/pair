import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createCycleScriptsBridge } from './cycle-scripts'
import { pinnedTier } from './cycle-wiring'

/**
 * US-524 AC-6 — the `pair-cli run --card` realization of the parity matrix. The fixture file is the SAME one
 * `dataset/.workflows/pair-contracts/autonomy-parity.test.mjs` reads for the cycle and for the batch (sequential and
 * parallel): the same policy + card gives the same decision, conditions and stage. `run --card` reaches the
 * decision through the typed bridge over the REAL installed scripts (real spawn, a fake `gh` through PAIR_GH_BIN) —
 * `autonomyResolve` → `resolve` at the stage boundary (policy `{ autonomy: { until, merge } }`, labels) →
 * `mergeCheck` (`--mergeGate`) at the merge boundary — and re-derives nothing: a rule copied into this app could not
 * agree with the matrix on every row.
 */

interface Decision {
  readonly decision: string
  readonly target?: string
  readonly conditions?: readonly string[]
}
interface Row {
  readonly id: string
  readonly args: Readonly<Record<string, string>>
  readonly adoption?: string
  readonly labels: readonly string[]
  readonly labelsAtMerge?: readonly string[]
  readonly prLabelsAtMerge?: readonly string[]
  readonly implement: Decision
  readonly merge: Decision | null
}

const REPO = join(__dirname, '../../../../..')
const rows = (
  JSON.parse(
    readFileSync(
      join(
        REPO,
        'packages/knowledge-hub/dataset/.workflows/pair-contracts/autonomy-parity.fixtures.json',
      ),
      'utf8',
    ),
  ) as { rows: Row[] }
).rows
const HEAD = 'a'.repeat(40)
const tierOf = (labels: readonly string[]) => labels.find(l => l.startsWith('risk:')) ?? 'risk:red'

let root: string
let ghBin: string
const labelsJson = (names: readonly string[]) => JSON.stringify(names.map(name => ({ name })))

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pair-cli-parity-'))
  const scriptsDir = join(root, '.claude/skills/pair-workflow-cycle/scripts')
  cpSync(join(REPO, '.claude/skills/pair-workflow-cycle/scripts'), scriptsDir, { recursive: true })
  mkdirSync(join(root, '.pair/adoption/tech'), { recursive: true })
  const dir = join(root, '.pair/working/runs/story-1/1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '.host-binding.json'),
    JSON.stringify({ schemaVersion: 1, pmTool: 'github', codeHost: 'github' }),
  )
  ghBin = join(root, 'fake-gh.sh')
  writeFileSync(
    ghBin,
    `#!/bin/sh
case "$*" in
  *"issue view"*"--json labels"*) echo "{\\"labels\\":$PARITY_LABELS}" ;;
  *"/issues/"*"/labels"*) echo "$PARITY_PR_LABELS" ;;
  *"headRefOid"*) echo ${HEAD} ;;
  *"/status"*) echo '{"statuses":[{"context":"pair-review","state":"success"},{"context":"pair-explicit-approval","state":"success"}]}' ;;
  *"--paginate"*) echo '[]' ;;
  *) echo '{}' ;;
esac
`,
  )
  chmodSync(ghBin, 0o755)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

const bridge = () =>
  createCycleScriptsBridge(
    { scriptsDir: join(root, '.claude/skills/pair-workflow-cycle/scripts') },
    root,
  )

interface NextAnswer {
  step: string
  reason?: string
  conditions?: string[]
  target?: string
}

const stageDecision = (next: NextAnswer): Decision => {
  if (next.step === 'blocked' && next.reason === 'escalated')
    return { decision: 'escalate', ...(next.conditions && { conditions: next.conditions }) }
  if (next.step === 'done')
    return { decision: 'stop-at-target', ...(next.target && { target: next.target }) }
  return { decision: 'proceed' }
}

const mergeDecision = (check: {
  mergeAllowed?: boolean
  reason?: string | null
  [key: string]: unknown
}): Decision => {
  if (check.mergeAllowed) return { decision: 'proceed' }
  if (check['parkKind'] === 'awaiting-human') return { decision: 'await-human' }
  if (check['parkKind'] === 'escalated')
    return { decision: 'escalate', conditions: (check['conditions'] ?? []) as string[] }
  return { decision: `halted:${String(check.reason)}` }
}

/** `pair-cli run --card` at the merge boundary: `mergeCheck` with the gate, the fake `gh` answering the reads. */
function mergeBoundary(
  row: Row,
  dir: string,
  mergeGate: Parameters<ReturnType<typeof bridge>['mergeCheck']>[0]['mergeGate'],
) {
  process.env['PAIR_GH_BIN'] = ghBin
  process.env['PARITY_LABELS'] = labelsJson(row.labelsAtMerge ?? row.labels)
  process.env['PARITY_PR_LABELS'] = labelsJson(
    row.prLabelsAtMerge ?? row.labelsAtMerge ?? row.labels,
  )
  try {
    return mergeDecision(
      bridge().mergeCheck({
        dir,
        story: '1',
        pr: 7,
        reviewedHead: HEAD,
        cardTier: pinnedTier(tierOf(row.labels), true) as string,
        ...(mergeGate && { mergeGate }),
      }),
    )
  } finally {
    delete process.env['PAIR_GH_BIN']
    delete process.env['PARITY_LABELS']
    delete process.env['PARITY_PR_LABELS']
  }
}

/** What `pair-cli run --card` does at the two boundaries — through the bridge, nothing else. */
function runCardDecisions(row: Row): { implement: Decision; merge: Decision | null } {
  writeFileSync(join(root, '.pair/adoption/tech/automation.md'), row.adoption ?? '')
  const resolution = bridge().autonomyResolve({
    adoption: join(root, '.pair/adoption/tech/automation.md'),
    args: { ...row.args },
  })
  expect(resolution.ok, JSON.stringify(resolution.errors)).toBe(true)
  const runsRoot = join(root, '.pair/working/runs')
  const dir = join(runsRoot, 'story-1/1')
  const autonomy = { until: resolution.policy.until, merge: resolution.policy.merge }
  const answer = bridge().resolve({
    dir,
    runsRoot,
    story: '1',
    workflowVersion: '4.0.1',
    entry: 'fresh',
    policy: { blockingFloor: 'Minor', ...(resolution.active && { autonomy }) },
    tier: tierOf(row.labels),
    labels: row.labels,
  })
  const implement = stageDecision(answer.next as NextAnswer)
  const merging = resolution.active && resolution.policy.until === 'merged'
  return { implement, merge: merging ? mergeBoundary(row, dir, resolution.policy.merge) : null }
}

const strip = (d: Decision | null) =>
  d === null
    ? null
    : {
        decision: d.decision,
        ...(d.target !== undefined && { target: d.target }),
        ...(d.conditions !== undefined && { conditions: d.conditions }),
      }

describe('US-524 AC-6: `pair-cli run --card` reaches the same decision as the cycle and the batch', () => {
  it.each(rows)('$id: $args', row => {
    const got = runCardDecisions(row)
    expect(strip(got.implement)).toEqual(strip(row.implement))
    expect(strip(got.merge)).toEqual(strip(row.merge))
  })

  it('the matrix covers every decision the shared function can return (a realization missing one proves nothing)', () => {
    const seen = new Set(rows.flatMap(r => [r.implement.decision, r.merge?.decision]))
    for (const d of ['proceed', 'stop-at-target', 'await-human', 'escalate'])
      expect(seen).toContain(d)
  })
})
