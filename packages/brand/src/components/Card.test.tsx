import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders children', () => {
    const { container } = render(<Card>Test content</Card>)
    expect(container.textContent).toContain('Test content')
  })

  it('applies default styling classes', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('pair-card')
  })

  it('forwards custom className', () => {
    const { container } = render(<Card className='custom'>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('custom')
    expect(card.className).toContain('pair-card')
  })

  it('applies glass effect when glass prop is true', () => {
    const { container } = render(<Card glass>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('glass')
  })

  it('does not apply glass effect by default', () => {
    const { container } = render(<Card>Content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('glass')
  })
})
