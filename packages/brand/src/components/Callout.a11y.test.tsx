import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Callout } from './Callout'

const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } }

describe('Callout a11y', () => {
  it('info type has no violations', async () => {
    const { container } = render(<Callout type='info'>Info message</Callout>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('warning type has no violations', async () => {
    const { container } = render(<Callout type='warning'>Warning message</Callout>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('tip type has no violations', async () => {
    const { container } = render(<Callout type='tip'>Tip message</Callout>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('with title has no violations', async () => {
    const { container } = render(<Callout title='Note'>Content with title</Callout>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })
})
