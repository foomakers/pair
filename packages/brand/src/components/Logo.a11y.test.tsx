import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { PairLogo } from './Logo'

const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } }

describe('PairLogo a11y', () => {
  it('favicon variant has no violations', async () => {
    const { container } = render(<PairLogo variant='favicon' />)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('navbar variant has no violations', async () => {
    const { container } = render(<PairLogo variant='navbar' />)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('full variant has no violations', async () => {
    const { container } = render(<PairLogo variant='full' />)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })
})
