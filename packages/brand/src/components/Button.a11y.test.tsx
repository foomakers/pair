import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Button } from './Button'

const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } }

describe('Button a11y', () => {
  it('primary variant has no violations', async () => {
    const { container } = render(<Button>Primary</Button>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('secondary variant has no violations', async () => {
    const { container } = render(<Button variant='secondary'>Secondary</Button>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('ghost variant has no violations', async () => {
    const { container } = render(<Button variant='ghost'>Ghost</Button>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('outline variant has no violations', async () => {
    const { container } = render(<Button variant='outline'>Outline</Button>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('as="a" has no violations', async () => {
    const { container } = render(
      <Button as='a' href='https://example.com'>
        Link
      </Button>,
    )
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })

  it('disabled has no violations', async () => {
    const { container } = render(<Button disabled>Disabled</Button>)
    expect(await axe(container, AXE_OPTS)).toHaveNoViolations()
  })
})
