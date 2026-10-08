import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HydrationMarker } from './hydration-marker'

describe('HydrationMarker', () => {
  afterEach(() => document.documentElement.removeAttribute('data-hydrated'))

  it('marks the document hydrated only once effects have run, and renders nothing', () => {
    expect(document.documentElement.getAttribute('data-hydrated')).toBeNull()
    const { container } = render(<HydrationMarker />)
    expect(document.documentElement.getAttribute('data-hydrated')).toBe('true')
    expect(container.innerHTML).toBe('')
  })
})
