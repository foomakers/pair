import { RootProvider } from 'fumadocs-ui/provider'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PostHogProvider } from '@/components/posthog-provider'
import './global.css'

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

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
