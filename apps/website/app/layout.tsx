import { RootProvider } from 'fumadocs-ui/provider'
import type { ReactNode } from 'react'
import { PostHogProvider } from '@/components/posthog-provider'
import './global.css'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body>
        <PostHogProvider>
          <RootProvider search={{ options: { type: 'static' } }}>{children}</RootProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
