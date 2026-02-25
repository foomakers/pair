import { RootProvider } from 'fumadocs-ui/provider'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PostHogProvider } from '@/components/posthog-provider'
import './global.css'

export const metadata: Metadata = {
  title: 'pair — Code is the easy part.',
  description: 'AI-assisted development toolkit for solo devs, teams, and organizations.',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'pair — Code is the easy part.',
    description: 'AI-assisted development toolkit for solo devs, teams, and organizations.',
    images: [{ url: '/social-preview.png', width: 1280, height: 640 }],
    siteName: 'pair',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'pair — Code is the easy part.',
    description: 'AI-assisted development toolkit for solo devs, teams, and organizations.',
    images: ['/social-preview.png'],
  },
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
