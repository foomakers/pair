import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders children', () => {
    const { container } = render(<Button>Click me</Button>)
    expect(container.textContent).toContain('Click me')
  })

  it('renders primary variant by default', () => {
    const { container } = render(<Button>Test</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.className).toContain('primary')
  })

  it('renders secondary variant', () => {
    const { container } = render(<Button variant='secondary'>Test</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.className).toContain('secondary')
  })

  it('renders ghost variant', () => {
    const { container } = render(<Button variant='ghost'>Test</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.className).toContain('ghost')
  })

  it('forwards custom className', () => {
    const { container } = render(<Button className='custom'>Test</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.className).toContain('custom')
  })

  it('handles click events', () => {
    const handleClick = vi.fn()
    const { container } = render(<Button onClick={handleClick}>Click</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('respects disabled state', () => {
    const handleClick = vi.fn()
    const { container } = render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>,
    )
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders as anchor when as="a"', () => {
    const { container } = render(
      <Button as='a' href='https://example.com'>
        Link
      </Button>,
    )
    const anchor = container.querySelector('a') as HTMLAnchorElement
    expect(anchor).not.toBeNull()
    expect(anchor.tagName).toBe('A')
    expect(anchor.href).toContain('example.com')
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders outline variant', () => {
    const { container } = render(<Button variant='outline'>Outline</Button>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.className).toContain('outline')
    expect(button.className).toContain('gradient-border')
  })

  it('propagates href to anchor', () => {
    const { container } = render(
      <Button as='a' href='/docs'>
        Docs
      </Button>,
    )
    const anchor = container.querySelector('a') as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('/docs')
  })
})
