import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('posthog-js', () => ({
  default: { init: vi.fn() },
}))

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}))

import posthog from 'posthog-js'
import { PostHogProvider } from '../components/posthog-provider'

describe('PostHogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('renders children without error', () => {
    const { container } = render(
      <PostHogProvider>
        <span>hello</span>
      </PostHogProvider>,
    )
    expect(container.textContent).toContain('hello')
  })

  it('initializes posthog with cookieless config when key is present', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test123')
    render(
      <PostHogProvider>
        <div />
      </PostHogProvider>,
    )
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test123',
      expect.objectContaining({ persistence: 'memory' }),
    )
  })

  it('skips init when key is absent', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '')
    render(
      <PostHogProvider>
        <div />
      </PostHogProvider>,
    )
    expect(posthog.init).not.toHaveBeenCalled()
  })
})
