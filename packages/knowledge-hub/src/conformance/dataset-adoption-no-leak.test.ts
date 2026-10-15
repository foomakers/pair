import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// Dataset adoption ships adapt-me templates only: no pair-specific delta (#548 AC-1).
const ADOPTION = join(__dirname, '../../dataset/.pair/adoption')

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

describe('dataset adoption ships no project-specific delta', () => {
  it('has no tech/automation.md (absent = automation off)', () => {
    expect(existsSync(join(ADOPTION, 'tech/automation.md'))).toBe(false)
  })

  it('decision-log holds only .keep', () => {
    expect(readdirSync(join(ADOPTION, 'decision-log'))).toEqual(['.keep'])
  })

  it('mentions no mirrors:regenerate', () => {
    const hits = walk(ADOPTION).filter(p => readFileSync(p, 'utf-8').includes('mirrors:regenerate'))
    expect(hits).toEqual([])
  })
})
