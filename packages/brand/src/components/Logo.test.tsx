import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PairLogo } from './Logo'

describe('PairLogo', () => {
  describe('variant rendering', () => {
    it('renders favicon variant (icon-only, 32x32)', () => {
      const { container } = render(<PairLogo variant='favicon' />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32')
      // Favicon should have 2 pills (rects), no wordmark
      const rects = container.querySelectorAll('rect')
      expect(rects.length).toBeGreaterThanOrEqual(2)
      const wordmark = container.querySelector('[data-wordmark]')
      expect(wordmark).toBeFalsy()
    })

    it('renders navbar variant (horizontal, 24px height)', () => {
      const { container } = render(<PairLogo variant='navbar' />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      // Navbar should have pills + wordmark
      const rects = container.querySelectorAll('rect')
      expect(rects.length).toBeGreaterThanOrEqual(2)
      const wordmark = container.querySelector('[data-wordmark]')
      expect(wordmark).toBeTruthy()
    })

    it('renders full variant (vertical stack, 40x52)', () => {
      const { container } = render(<PairLogo variant='full' />)
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('viewBox')).toContain('40')
      // Full should have pills + wordmark
      const wordmark = container.querySelector('[data-wordmark]')
      expect(wordmark).toBeTruthy()
    })
  })

  describe('animation', () => {
    it('applies animation class by default', () => {
      const { container } = render(<PairLogo variant='navbar' />)
      const logo = container.querySelector('[data-logo-container]')
      expect(logo?.className).toContain('animate')
    })

    it('removes animation class when animate={false}', () => {
      const { container } = render(<PairLogo variant='navbar' animate={false} />)
      const logo = container.querySelector('[data-logo-container]')
      expect(logo?.className).not.toContain('animate')
    })
  })

  describe('className forwarding', () => {
    it('forwards custom className', () => {
      const { container } = render(<PairLogo variant='favicon' className='custom-class' />)
      const logo = container.querySelector('[data-logo-container]')
      expect(logo?.className).toContain('custom-class')
    })
  })

  describe('accessibility', () => {
    it('SVG has role and aria-label', () => {
      const { container } = render(<PairLogo variant='navbar' />)
      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('role')).toBe('img')
      expect(svg?.getAttribute('aria-label')).toBe('pair logo')
    })

    it('SVG has a title element for screen readers', () => {
      const { container } = render(<PairLogo variant='navbar' />)
      const title = container.querySelector('svg title')
      expect(title?.textContent).toBe('pair logo')
    })

    it('animation CSS includes prefers-reduced-motion rule', () => {
      const { container } = render(<PairLogo variant='navbar' />)
      const style = container.querySelector('style')
      expect(style?.textContent).toContain('prefers-reduced-motion')
      expect(style?.textContent).toContain('transform: none')
      expect(style?.textContent).toContain('transition: none')
    })
  })
})
