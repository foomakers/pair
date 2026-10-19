import type { Metadata } from 'next'
import { ThemeToggle } from '@pair/brand'
import { HeroSection } from './hero-section'
import { WhatsNewBanner } from './whats-new-banner'
import { PainPointsSection } from './pain-points-section'
import { WorksWithSection } from './works-with-section'
import { DemoSection } from './demo-section'
import { AudienceTracksSection } from './audience-tracks-section'
import { HowItWorksSection } from './how-it-works-section'
import { FeaturesSection } from './features-section'
import { OpenSourceSection } from './open-source-section'
import { CTASection } from './cta-section'

export const metadata: Metadata = {
  title: 'pair: Code is the easy part.',
  description:
    'pair runs your development process with AI, from PRD to merged PR, in assisted, supervised or autonomous mode. Open source. Works with Claude Code, Codex, pi, opencode, Cursor, Copilot and Windsurf.',
  openGraph: {
    title: 'pair: Code is the easy part.',
    description:
      'pair runs your development process with AI, from PRD to merged PR, in assisted, supervised or autonomous mode.',
    type: 'website',
    images: [{ url: '/social-preview.png', width: 1280, height: 640 }],
    siteName: 'pair',
  },
}

export default function HomePage() {
  return (
    <main className='min-h-screen bg-pair-bg-light text-pair-text-light dark:bg-pair-bg-dark dark:text-pair-text-dark'>
      <ThemeToggle />
      <HeroSection />
      <div className='gradient-line mx-auto max-w-4xl' />
      <WhatsNewBanner />
      <PainPointsSection />
      <WorksWithSection />
      <DemoSection />
      <AudienceTracksSection />
      <HowItWorksSection />
      <FeaturesSection />
      <OpenSourceSection />
      <CTASection />
    </main>
  )
}
