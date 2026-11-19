import { InMemoryFileSystemService } from '@pair/content-ops'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

import { parseGrepOutput, quarantinedTitles } from './code-hygiene-check'

const mem = new InMemoryFileSystemService({}, '/', '/')
let n = 0

const SKIP = 'it.' + 'skip'
const hit = (title: string) => `a.test.ts:3:  ${SKIP}('${title}', () => {})`

const rootWith = (quarantine: unknown): string => {
  const root = `/hyg-${n++}`
  mem.writeFileSync(
    join(root, 'docs/testing/test-policy.config.json'),
    JSON.stringify({ quarantine }),
  )
  return root
}

describe('quarantine exemption (US-613)', () => {
  it('takes the test title (last segment) of every quarantined id', () => {
    const root = rootWith([{ id: 'p/a.test.ts::suite > nested > flaky one' }])
    expect(quarantinedTitles(root, mem)).toEqual(['flaky one'])
  })
  it('no config, or a config without quarantine, exempts nothing', () => {
    expect(quarantinedTitles('/does-not-exist-hyg', mem)).toEqual([])
    expect(quarantinedTitles(rootWith(undefined), mem)).toEqual([])
  })
  it('drops the skip of a quarantined test and keeps any other', () => {
    const out = [hit('flaky one'), hit('someone forgot this')].join('\n')
    expect(parseGrepOutput(out, ['flaky one'])).toEqual(['  a.test.ts:3'])
    expect(parseGrepOutput(out)).toHaveLength(2)
  })
})
