import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { pathsOverlap } from './working-area'
import { getReservedPaths, detectReservedPathOverlap } from './reserved-paths'
import { DEFAULT_WORKING_PATH } from './working-area'
import type { RegistryConfig } from './resolver'

// Story #233 (DoD — CLI recognizes `tech/risk-matrix.md` as an adoption artifact):
// `.pair/adoption/tech/risk-matrix.md` is the optional quality-model delta a project
// authors (or `/classify` proposes). It is a project artifact, not KB-shipped content —
// so on `pair-cli update` it must be RECOGNIZED as adoption (behavior `add`: added if absent,
// never overwritten) and never clobbered. This is already true structurally because it
// lives under the `adoption` registry (source `.pair/adoption`, behavior `add`); these
// tests pin that invariant so a future config change can't silently start clobbering it.

const SHIPPED_CONFIG = JSON.parse(readFileSync(join(__dirname, '../../config.json'), 'utf-8')) as {
  asset_registries: Record<string, RegistryConfig & { behavior: string }>
}

const RISK_MATRIX = '.pair/adoption/tech/risk-matrix.md'

const adoption = SHIPPED_CONFIG.asset_registries['adoption']
if (!adoption) throw new Error('adoption registry missing from shipped config.json')

describe('tech/risk-matrix.md — recognized as an adoption artifact (#233)', () => {
  it('the shipped config ships an adoption registry rooted at .pair/adoption', () => {
    expect(adoption.source).toBe('.pair/adoption')
  })

  it('risk-matrix.md lies within the adoption registry source', () => {
    expect(pathsOverlap(RISK_MATRIX, adoption.source)).toBe(true)
  })

  it('the adoption registry uses `add` — project artifacts are never overwritten on update', () => {
    expect(adoption.behavior).toBe('add')
  })

  it('is not a reserved path — it is legitimate registry-covered content, not excluded', () => {
    const reserved = getReservedPaths(DEFAULT_WORKING_PATH)
    expect(reserved.some(r => pathsOverlap(RISK_MATRIX, r))).toBe(false)
  })

  it('the adoption registry does not overlap any reserved path (still valid config)', () => {
    const errors = detectReservedPathOverlap(
      { adoption } as Record<string, RegistryConfig>,
      getReservedPaths(DEFAULT_WORKING_PATH),
    )
    expect(errors).toEqual([])
  })
})
