import { describe, it, expect } from 'vitest'
import * as brand from './index'

describe('@pair/brand', () => {
  it('exports color tokens', () => {
    expect(brand.PAIR_BLUE).toBe('#0062FF')
    expect(brand.PAIR_TEAL).toBe('#00D1FF')
    expect(brand.LIGHT_BG).toBeDefined()
    expect(brand.DARK_BG).toBeDefined()
  })

  it('exports typography tokens', () => {
    expect(brand.FONT_SANS).toBeDefined()
    expect(brand.FONT_MONO).toBeDefined()
  })

  it('exports Tailwind preset', () => {
    expect(brand.brandPreset).toBeDefined()
    expect(typeof brand.brandPreset).toBe('object')
  })

  it('exports all components', () => {
    expect(brand.PairLogo).toBeDefined()
    expect(brand.Card).toBeDefined()
    expect(brand.Button).toBeDefined()
    expect(brand.Callout).toBeDefined()
  })
})
