import { describe, it, expect } from 'vitest'
import * as typography from './typography'

describe('Brand typography', () => {
  it('exports font stacks with fallbacks', () => {
    expect(typography.FONT_SANS).toContain('Plus Jakarta Sans')
    expect(typography.FONT_SANS).toContain('system-ui')
    expect(typography.FONT_SANS).toContain('sans-serif')

    expect(typography.FONT_MONO).toContain('JetBrains Mono')
    expect(typography.FONT_MONO).toContain('monospace')
  })

  it('exports CSS variable names', () => {
    expect(typography.TYPOGRAPHY_CSS_VAR_NAMES.fontSans).toBe('font-sans')
    expect(typography.TYPOGRAPHY_CSS_VAR_NAMES.fontMono).toBe('font-mono')
  })
})
