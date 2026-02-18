import { RootProvider } from 'fumadocs-ui/provider'
import type { ReactNode } from 'react'
import { PostHogProvider } from '@/components/posthog-provider'
import { WebVitals } from '@/components/web-vitals'
import './global.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <PostHogProvider>
          <RootProvider>{children}</RootProvider>
          <WebVitals />
        </PostHogProvider>
      </body>
    </html>
  )
}
