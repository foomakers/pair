import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Card } from './Card'

const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } }

describe('Card a11y', () => {
  it('default variant has no violations', async () => {
    const { container } = render(<Card>Content</Card>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('glow variant has no violations', async () => {
    const { container } = render(<Card variant='glow'>Glow</Card>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('glass has no violations', async () => {
    const { container } = render(<Card glass>Glass</Card>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })
})
