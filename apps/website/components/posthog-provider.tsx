'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, type ReactNode } from 'react'

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env['NEXT_PUBLIC_POSTHOG_KEY']
    const host = process.env['NEXT_PUBLIC_POSTHOG_HOST']

    if (!key) return

    posthog.init(key, {
      api_host: host ?? 'https://eu.i.posthog.com',
      persistence: 'memory',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      capture_performance: { web_vitals: true },
    })
  }, [])

  return <PHProvider client={posthog}>{children}</PHProvider>
}
