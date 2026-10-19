import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** US-560 AC7: no stale "--card only / --parallel does not forward" profile caveat in docs or parser JSDoc. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
const stale = /Both flags need `--card`|does not forward them|unattended runs use `workflowProfiles\.default`|needs `--card`; |present only when passed \(with `--card`\)/

describe('stale profile caveat', () => {
  it('configuration reference has none', () => {
    expect(read('../../../../website/content/docs/reference/configuration.mdx')).not.toMatch(stale)
  })
  it('parser JSDoc has none', () => {
    expect(read('./parser.ts')).not.toMatch(stale)
  })
})
