import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Callout } from './Callout'

describe('Callout', () => {
  it('renders children', () => {
    const { container } = render(<Callout>Test content</Callout>)
    expect(container.textContent).toContain('Test content')
  })

  it('renders info type by default', () => {
    const { container } = render(<Callout>Content</Callout>)
    const callout = container.firstChild as HTMLElement
    expect(callout.className).toContain('info')
  })

  it('renders warning type', () => {
    const { container } = render(<Callout type='warning'>Warning</Callout>)
    const callout = container.firstChild as HTMLElement
    expect(callout.className).toContain('warning')
  })

  it('renders tip type', () => {
    const { container } = render(<Callout type='tip'>Tip</Callout>)
    const callout = container.firstChild as HTMLElement
    expect(callout.className).toContain('tip')
  })

  it('renders title when provided', () => {
    const { container } = render(<Callout title='Important'>Content</Callout>)
    expect(container.textContent).toContain('Important')
  })

  it('renders without title', () => {
    const { container } = render(<Callout>Content only</Callout>)
    const callout = container.firstChild as HTMLElement
    expect(callout).toBeTruthy()
  })

  it('forwards custom className', () => {
    const { container } = render(<Callout className='custom'>Content</Callout>)
    const callout = container.firstChild as HTMLElement
    expect(callout.className).toContain('custom')
  })
})
