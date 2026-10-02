import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// US-521 remediation r1-g1, finding r0-3 (skill half) — `/pair-next` claims "argument > adoption
// (`## Autonomy`) > default, every effective value printed with its source"; its Step 0 must actually
// RESOLVE the selection through the one shared script (`autonomy-policy.mjs resolve`, the same one
// `pair-cli run` and `/pair-workflow-cycle` spawn) and its Scope output must print where each value
// came from. Without it, `## Autonomy filter: PIPPO` and no arguments still select the full backlog.
// Reads the dataset source of record and the installed root mirror.

const DATASET = join(__dirname, '../../dataset/.skills/next/SKILL.md')
const MIRROR = join(__dirname, '../../../../.claude/skills/pair-next/SKILL.md')

const sources: Array<[string, string]> = [
  ['dataset', readFileSync(DATASET, 'utf-8')],
  ['mirror', readFileSync(MIRROR, 'utf-8')],
]

function stepZero(content: string): string {
  const start = content.indexOf('### Step 0: Resolve Selection Scope')
  const end = content.indexOf('### Step 0.5')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return content.slice(start, end)
}

describe.each(sources)('pair-next — %s SKILL.md resolves `## Autonomy` selection', (_, content) => {
  it('R3-S1: Step 0 resolves the selection through `autonomy-policy.mjs resolve` and reads `## Autonomy`', () => {
    const step = stepZero(content)
    expect(step).toMatch(/autonomy-policy\.mjs[^\n]*resolve|resolve[^\n]*autonomy-policy\.mjs/)
    expect(step).toContain('## Autonomy')
  })

  it('R3-S3: Step 0 prints every effective selection value with its source', () => {
    expect(stepZero(content)).toMatch(/print[^\n]*(source|`lines`)/i)
  })

  it('R3-S4: the Output Format Scope line carries the source of each value', () => {
    const scope = content.split('\n').find(line => line.includes('├── Scope:')) ?? ''
    expect(scope).toMatch(/source|argument|adoption/)
  })
})
