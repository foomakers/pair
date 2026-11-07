import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect } from 'vitest'

import { parseGrepOutput, quarantinedTitles } from './code-hygiene-check'

const SKIP = 'it.' + 'skip'
const hit = (title: string) => `a.test.ts:3:  ${SKIP}('${title}', () => {})`

const rootWith = (quarantine: unknown): string => {
  const root = mkdtempSync(join(tmpdir(), 'hyg-'))
  mkdirSync(join(root, 'docs/testing'), { recursive: true })
  writeFileSync(join(root, 'docs/testing/test-policy.config.json'), JSON.stringify({ quarantine }))
  return root
}

describe('quarantine exemption (US-613)', () => {
  it('takes the test title (last segment) of every quarantined id', () => {
    const root = rootWith([{ id: 'p/a.test.ts::suite > nested > flaky one' }])
    expect(quarantinedTitles(root)).toEqual(['flaky one'])
  })
  it('no config, or a config without quarantine, exempts nothing', () => {
    expect(quarantinedTitles(join(tmpdir(), 'does-not-exist-hyg'))).toEqual([])
    expect(quarantinedTitles(rootWith(undefined))).toEqual([])
  })
  it('drops the skip of a quarantined test and keeps any other', () => {
    const out = [hit('flaky one'), hit('someone forgot this')].join('\n')
    expect(parseGrepOutput(out, ['flaky one'])).toEqual(['  a.test.ts:3'])
    expect(parseGrepOutput(out)).toHaveLength(2)
  })
})
