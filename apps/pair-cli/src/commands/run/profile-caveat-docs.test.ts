import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** US-560 AC7: no stale "--card only / --parallel does not forward" profile caveat in docs or parser JSDoc. */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
const stale =
  /Both flags need `--card`|does not forward them|unattended runs use `workflowProfiles\.default`|(?:profile|workflow-config)[^\n]*needs `--card`\.|present only when passed \(with `--card`\)/

const original = process.platform
afterEach(() => Object.defineProperty(process, 'platform', { value: original }))

describe.each(['darwin', 'linux'] as const)('stale profile caveat (platform %s)', platform => {
  it('configuration reference and parser JSDoc have none', () => {
    Object.defineProperty(process, 'platform', { value: platform })
    expect(read('../../../../website/content/docs/reference/configuration.mdx')).not.toMatch(stale)
    expect(read('./parser.ts')).not.toMatch(stale)
  })
})
