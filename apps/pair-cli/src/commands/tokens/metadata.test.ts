import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { tokensCommandMetadata } from './metadata'

const REPO_ROOT = resolve(__dirname, '../../../../..')

describe('tokensCommandMetadata', () => {
  it('r1-g1-w4 the --baseline example names a committed baseline, not a git-ignored path', () => {
    const example = tokensCommandMetadata.examples.find(e => e.includes('--baseline'))!
    const path = /--baseline\s+(\S+)/.exec(example)![1]!
    expect(path.startsWith('.pair/working/')).toBe(false)
    expect(existsSync(resolve(REPO_ROOT, path))).toBe(true)
  })
})
