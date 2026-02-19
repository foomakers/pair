import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App showcase', () => {
  it('renders header with title and description', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('@pair/brand Component Showcase')
    expect(container.textContent).toContain('Brand identity component library')
  })

  it('renders theme toggle button', () => {
    const { container } = render(<App />)
    const button = container.querySelector('button')
    expect(button?.textContent).toContain('Toggle')
  })

  it('toggles theme when button clicked', () => {
    const { container } = render(<App />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    const button = container.querySelector('button') as HTMLButtonElement
    fireEvent.click(button)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('renders logo section with all variants', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Logo Variants')
    expect(container.textContent).toContain('Favicon (32x32)')
    expect(container.textContent).toContain('Navbar (24px)')
    expect(container.textContent).toContain('Full (40x52)')
  })

  it('renders button section with all variants', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Buttons')
    expect(container.textContent).toContain('Primary Button')
    expect(container.textContent).toContain('Secondary Button')
    expect(container.textContent).toContain('Ghost Button')
    expect(container.textContent).toContain('Outline Button')
    expect(container.textContent).toContain('Link Button')
    expect(container.textContent).toContain('Disabled')

    const buttons = container.querySelectorAll('button')
    const disabledButton = Array.from(buttons).find(b => b.textContent?.includes('Disabled'))
    expect(disabledButton?.disabled).toBe(true)
  })

  it('renders card section with standard, glass, and glow cards', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Cards')
    expect(container.textContent).toContain('Standard Card')
    expect(container.textContent).toContain('Basic card with rounded corners, border, and shadow.')
    expect(container.textContent).toContain('Glass Effect Card')
    expect(container.textContent).toContain('Card with glass-effect backdrop blur.')
    expect(container.textContent).toContain('Glow Card')
    expect(container.textContent).toContain('Card with glow hover and gradient border.')
  })

  it('renders callout section with all types', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Callouts')
    expect(container.textContent).toContain('Information')
    expect(container.textContent).toContain('This is an informational callout with blue accent.')
    expect(container.textContent).toContain('Warning')
    expect(container.textContent).toContain('This is a warning callout with amber accent.')
    expect(container.textContent).toContain('Pro Tip')
    expect(container.textContent).toContain('This is a tip callout with teal accent.')
  })

  it('renders color palette section', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Color Palette')
    expect(container.textContent).toContain('PAIR Blue')
    expect(container.textContent).toContain('PAIR Teal')
    expect(container.textContent).toContain('Light BG')
    expect(container.textContent).toContain('Light Text')
    expect(container.textContent).toContain('Dark BG')
    expect(container.textContent).toContain('Dark Text')
  })

  it('renders typography section with font families', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Typography')
    expect(container.textContent).toContain('Headings (Plus Jakarta Sans)')
    expect(container.textContent).toContain('Heading 1')
    expect(container.textContent).toContain('Heading 2')
    expect(container.textContent).toContain('Heading 3')
    expect(container.textContent).toContain('Body Text (Plus Jakarta Sans)')
    expect(container.textContent).toContain('This is regular body text')
    expect(container.textContent).toContain('Code (JetBrains Mono)')
  })

  it('renders utility classes section', () => {
    const { container } = render(<App />)
    expect(container.textContent).toContain('Utility Classes')
    expect(container.textContent).toContain('.gradient-brand')
    expect(container.textContent).toContain('.glass-effect')
    expect(container.textContent).toContain('.text-gradient')
    expect(container.textContent).toContain('.gradient-border')
    expect(container.textContent).toContain('.card-glow')
  })

  it('applies gradient-brand class to utility showcase', () => {
    const { container } = render(<App />)
    const gradientDiv = container.querySelector('.gradient-brand')
    expect(gradientDiv).not.toBeNull()
  })

  it('applies glass-effect class to utility showcase', () => {
    const { container } = render(<App />)
    const glassDiv = container.querySelector('.glass-effect')
    expect(glassDiv).not.toBeNull()
  })

  it('applies text-gradient class to utility showcase', () => {
    const { container } = render(<App />)
    const textGradient = container.querySelector('.text-gradient')
    expect(textGradient).not.toBeNull()
    expect(textGradient?.textContent).toBe('pair')
  })

  it('applies gradient-border class to utility showcase', () => {
    const { container } = render(<App />)
    const gradientBorder = container.querySelector('.gradient-border')
    expect(gradientBorder).not.toBeNull()
  })

  it('applies card-glow class to utility showcase', () => {
    const { container } = render(<App />)
    const cardGlow = container.querySelector('.card-glow')
    expect(cardGlow).not.toBeNull()
  })
})
