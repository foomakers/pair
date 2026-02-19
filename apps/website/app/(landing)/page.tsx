import type { Metadata } from 'next'
import Link from 'next/link'
import { PairLogo, Card } from '@pair/brand'

export const metadata: Metadata = {
  title: 'pair — Code is the easy part.',
  description:
    'pair enables seamless dev-AI collaboration throughout the product lifecycle. Process layer for AI coding tools.',
  openGraph: {
    title: 'pair — Code is the easy part.',
    description: 'pair enables seamless dev-AI collaboration throughout the product lifecycle.',
    type: 'website',
  },
}

const PAIN_POINTS = [
  'Who owns the process when AI writes the code?',
  'How do you keep quality consistent across AI-assisted sprints?',
  'Where do architectural decisions live when agents switch context?',
  'How does your team scale AI collaboration without chaos?',
]

const TOOLS = [
  { name: 'Claude Code' },
  { name: 'Cursor' },
  { name: 'VS Code Copilot' },
  { name: 'Windsurf' },
  { name: 'Codex' },
]

const AUDIENCE_TRACKS = [
  {
    audience: 'Solo Dev',
    pain: 'AI writes code fast, but your project has no structure, no tests, no process.',
    solution:
      'pair bootstraps your project with guidelines, skills, and quality gates — so AI follows your standards from day one.',
    cta: 'Get started',
    href: '/docs',
  },
  {
    audience: 'Team',
    pain: 'Every team member uses AI differently. No shared conventions, inconsistent output.',
    solution:
      'pair provides a shared knowledge base that every AI assistant reads — same guidelines, same quality, regardless of the tool.',
    cta: 'Set up for your team',
    href: '/docs/customization/team',
  },
  {
    audience: 'Organization',
    pain: 'Scaling AI adoption across teams without governance is a recipe for technical debt.',
    solution:
      'pair lets you publish and distribute organizational standards as a knowledge base — version, govern, and evolve.',
    cta: 'Enterprise rollout',
    href: '/docs/customization/organization',
  },
]

const PHASES = [
  {
    step: '1',
    name: 'Bootstrap',
    description: 'Define your project: PRD, tech stack, quality gates.',
  },
  {
    step: '2',
    name: 'Plan',
    description: 'Break work into initiatives, epics, stories, and tasks.',
  },
  {
    step: '3',
    name: 'Implement',
    description: 'AI follows your guidelines. TDD, quality checks, adoption compliance.',
  },
  {
    step: '4',
    name: 'Review',
    description: 'Structured code review against your standards. Merge with confidence.',
  },
]

const FEATURES = [
  {
    name: 'Skills',
    description: 'Reusable, composable process skills that any AI assistant can execute.',
  },
  {
    name: 'Knowledge Base',
    description: 'Guidelines, templates, and standards your AI reads automatically.',
  },
  {
    name: 'Adoption Files',
    description: 'Tech decisions, architecture, and way-of-working — versioned and enforced.',
  },
  {
    name: 'Agent Integration',
    description: 'Works with Claude Code, Cursor, Copilot, Windsurf, and Codex.',
  },
]

export default function HomePage() {
  return (
    <main className='min-h-screen bg-pair-bg-light text-pair-text-light dark:bg-pair-bg-dark dark:text-pair-text-dark'>
      <HeroSection />
      <WorksWithSection />
      <AudienceTracksSection />
      <HowItWorksSection />
      <FeaturesSection />
      <OpenSourceSection />
      <CTASection />
    </main>
  )
}

function HeroSection() {
  return (
    <section
      aria-label='Hero'
      className='flex flex-col items-center px-6 pb-16 pt-24 text-center md:pb-24 md:pt-32'>
      <PairLogo variant='full' animate size={64} className='mb-8' />
      <h1 className='font-sans text-4xl font-bold tracking-tight md:text-6xl'>
        Code is the easy part.
      </h1>
      <div className='mt-8 max-w-2xl space-y-3'>
        {PAIN_POINTS.map(q => (
          <p
            key={q}
            className='font-mono text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
            {q}
          </p>
        ))}
      </div>
      <p className='mt-8 max-w-xl text-lg text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        <strong className='text-pair-text-light dark:text-pair-text-dark'>pair</strong> is the
        process layer for AI-assisted development. It gives your AI assistant the context,
        guidelines, and skills to work the way your team works.
      </p>
    </section>
  )
}

function WorksWithSection() {
  return (
    <section
      aria-label='Works with'
      className='border-y border-pair-border-light px-6 py-12 dark:border-pair-border-dark'>
      <p className='mb-6 text-center text-sm font-medium uppercase tracking-widest text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Works with
      </p>
      <div className='flex flex-wrap items-center justify-center gap-6 md:gap-10'>
        {TOOLS.map(tool => (
          <span
            key={tool.name}
            className='font-mono text-sm font-medium text-pair-text-muted-light dark:text-pair-text-muted-dark'
            role='img'
            aria-label={`${tool.name} logo`}>
            {tool.name}
          </span>
        ))}
      </div>
    </section>
  )
}

function AudienceTracksSection() {
  return (
    <section aria-label='Audience tracks' className='px-6 py-16 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-12 text-center font-sans text-3xl font-bold md:text-4xl'>
          Built for every scale
        </h2>
        <div className='grid gap-8 md:grid-cols-3'>
          {AUDIENCE_TRACKS.map(track => (
            <Card
              key={track.audience}
              className='flex flex-col bg-pair-bg-light dark:bg-pair-bg-dark'>
              <h3 className='mb-3 font-sans text-xl font-bold text-pair-blue'>{track.audience}</h3>
              <p className='mb-4 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {track.pain}
              </p>
              <p className='mb-6 flex-1 text-sm'>{track.solution}</p>
              <Link
                href={track.href}
                className='inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pair-blue px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:opacity-90'>
                {track.cta}
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section
      aria-label='How it works'
      className='bg-pair-border-light px-6 py-16 dark:bg-pair-border-dark md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-12 text-center font-sans text-3xl font-bold md:text-4xl'>How it works</h2>
        <div className='grid gap-6 md:grid-cols-4'>
          {PHASES.map((phase, i) => (
            <div
              key={phase.name}
              className='flex items-start gap-4 md:flex-col md:items-center md:text-center'>
              <Card className='flex-1 bg-pair-bg-light dark:bg-pair-bg-dark'>
                <div className='mb-2 font-mono text-xs font-bold text-pair-teal'>
                  Phase {phase.step}
                </div>
                <h3 className='mb-2 font-sans text-lg font-bold'>{phase.name}</h3>
                <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                  {phase.description}
                </p>
              </Card>
              {i < PHASES.length - 1 && (
                <span
                  className='hidden self-center font-mono text-pair-text-muted-light dark:text-pair-text-muted-dark md:block'
                  aria-hidden='true'>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section aria-label='Features' className='px-6 py-16 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-12 text-center font-sans text-3xl font-bold md:text-4xl'>What you get</h2>
        <div className='grid gap-8 sm:grid-cols-2'>
          {FEATURES.map(feature => (
            <Card key={feature.name} className='bg-pair-bg-light dark:bg-pair-bg-dark'>
              <h3 className='mb-2 font-sans text-lg font-bold'>{feature.name}</h3>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {feature.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function OpenSourceSection() {
  return (
    <section
      aria-label='Open source'
      className='border-t border-pair-border-light px-6 py-16 text-center dark:border-pair-border-dark'>
      <h2 className='mb-4 font-sans text-2xl font-bold'>Open Source</h2>
      <p className='mb-6 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        pair is free, open source, and community-driven.
      </p>
      <a
        href='https://github.com/foomakers/pair'
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-current px-4 py-2 font-medium transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        aria-label='View pair on GitHub'>
        <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
          <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' />
        </svg>
        foomakers/pair
      </a>
    </section>
  )
}

function CTASection() {
  return (
    <section
      aria-label='Call to action'
      className='bg-pair-border-light px-6 py-16 text-center dark:bg-pair-border-dark md:py-24'>
      <h2 className='mb-4 font-sans text-3xl font-bold md:text-4xl'>Ready to start?</h2>
      <p className='mb-8 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Add pair to your project in under a minute.
      </p>
      <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
        <a
          href='https://github.com/foomakers/pair/releases/latest'
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-[44px] items-center justify-center rounded-lg bg-pair-blue px-6 py-3 font-semibold text-white transition-all duration-200 hover:opacity-90'>
          Get pair
        </a>
        <Link
          href='/docs'
          className='inline-flex min-h-[44px] items-center justify-center rounded-lg border border-current px-6 py-3 font-semibold transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800'>
          Read the docs
        </Link>
      </div>
    </section>
  )
}
