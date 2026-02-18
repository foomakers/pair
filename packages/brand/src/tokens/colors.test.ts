import { describe, it, expect } from 'vitest'
import * as colors from './colors'

describe('Brand colors', () => {
  it('exports all primary brand colors', () => {
    expect(colors.PAIR_BLUE).toBeDefined()
    expect(colors.PAIR_TEAL).toBeDefined()
  })

  it('primary colors match Brand Identity Guide spec', () => {
    expect(colors.PAIR_BLUE).toBe('#0062FF')
    expect(colors.PAIR_TEAL).toBe('#00D1FF')
  })

  it('exports light mode palette', () => {
    expect(colors.LIGHT_BG).toBe('#FFFFFF')
    expect(colors.LIGHT_TEXT_MAIN).toBe('#0A0D14')
    expect(colors.LIGHT_TEXT_MUTED).toBe('#4B5563')
    expect(colors.LIGHT_BORDER).toBe('#F1F5F9')
  })

  it('exports dark mode palette', () => {
    expect(colors.DARK_BG).toBe('#0A0D14')
    expect(colors.DARK_TEXT_MAIN).toBe('#F8FAFC')
    expect(colors.DARK_TEXT_MUTED).toBe('#94A3B8')
    expect(colors.DARK_BORDER).toBe('#1E293B')
  })

  it('has no undefined exports', () => {
    const exportValues = Object.values(colors)
    exportValues.forEach(value => {
      expect(value).toBeDefined()
    })
  })
})
