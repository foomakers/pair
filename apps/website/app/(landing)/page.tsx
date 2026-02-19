import type { Metadata } from 'next'
import Link from 'next/link'
import { PairLogo } from '@pair/brand'

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
  {
    question: 'Who owns the process when AI writes the code?',
    detail: 'AI generates code fast — but without process, you ship debt faster.',
  },
  {
    question: 'How do you keep quality consistent across AI-assisted sprints?',
    detail: 'Different prompts, different outputs. No shared standards, no consistency.',
  },
  {
    question: 'Where do architectural decisions live when agents switch context?',
    detail: 'Decisions are lost between sessions. Every new prompt starts from zero.',
  },
  {
    question: 'How does your team scale AI collaboration without chaos?',
    detail: 'One dev uses Cursor, another uses Copilot. No shared conventions.',
  },
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
    icon: '01',
    pain: 'AI writes code fast, but your project has no structure, no tests, no process.',
    solution:
      'pair bootstraps your project with guidelines, skills, and quality gates — so AI follows your standards from day one.',
    cta: 'Get started',
    href: '/docs',
  },
  {
    audience: 'Team',
    icon: '02',
    pain: 'Every team member uses AI differently. No shared conventions, inconsistent output.',
    solution:
      'pair provides a shared knowledge base that every AI assistant reads — same guidelines, same quality, regardless of the tool.',
    cta: 'Set up for your team',
    href: '/docs/customization/team',
  },
  {
    audience: 'Organization',
    icon: '03',
    pain: 'Scaling AI adoption across teams without governance is a recipe for technical debt.',
    solution:
      'pair lets you publish and distribute organizational standards as a knowledge base — version, govern, and evolve.',
    cta: 'Enterprise rollout',
    href: '/docs/customization/organization',
  },
]

const PHASES = [
  {
    step: '01',
    name: 'Bootstrap',
    description: 'Define your project: PRD, tech stack, quality gates.',
  },
  {
    step: '02',
    name: 'Plan',
    description: 'Break work into initiatives, epics, stories, and tasks.',
  },
  {
    step: '03',
    name: 'Implement',
    description: 'AI follows your guidelines. TDD, quality checks, adoption compliance.',
  },
  {
    step: '04',
    name: 'Review',
    description: 'Structured code review against your standards. Merge with confidence.',
  },
]

const FEATURES = [
  {
    name: 'Skills',
    description: 'Reusable, composable process skills that any AI assistant can execute.',
    accent: 'from-pair-blue to-blue-400',
  },
  {
    name: 'Knowledge Base',
    description: 'Guidelines, templates, and standards your AI reads automatically.',
    accent: 'from-pair-teal to-cyan-400',
  },
  {
    name: 'Adoption Files',
    description: 'Tech decisions, architecture, and way-of-working — versioned and enforced.',
    accent: 'from-blue-400 to-pair-teal',
  },
  {
    name: 'Agent Integration',
    description: 'Works with Claude Code, Cursor, Copilot, Windsurf, and Codex.',
    accent: 'from-pair-blue to-pair-teal',
  },
]

export default function HomePage() {
  return (
    <main className='min-h-screen bg-pair-bg-light text-pair-text-light dark:bg-pair-bg-dark dark:text-pair-text-dark'>
      <HeroSection />
      <div className='gradient-line mx-auto max-w-4xl' />
      <PainPointsSection />
      <WorksWithSection />
      <DemoPlaceholderSection />
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
      className='relative flex flex-col items-center overflow-hidden px-6 pb-20 pt-28 text-center md:pb-28 md:pt-36'>
      <div className='hero-glow animate-float' />
      <PairLogo variant='full' animate size={120} className='relative z-10 mb-10' />
      <h1 className='relative z-10 font-sans text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl'>
        Code is the <span className='gradient-text'>easy part.</span>
      </h1>
      <p className='relative z-10 mt-6 max-w-2xl text-lg text-pair-text-muted-light dark:text-pair-text-muted-dark md:text-xl'>
        <strong className='text-pair-text-light dark:text-pair-text-dark'>pair</strong> is the
        process layer for AI-assisted development. It gives your AI assistant the context,
        guidelines, and skills to work the way your team works.
      </p>
      <div className='relative z-10 mt-10 flex flex-col gap-4 sm:flex-row'>
        <a
          href='https://github.com/foomakers/pair/releases/latest'
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex min-h-[48px] items-center justify-center rounded-xl bg-pair-blue px-8 py-3 text-base font-semibold text-white shadow-lg shadow-pair-blue/25 transition-all duration-300 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
          Get pair
        </a>
        <Link
          href='/docs'
          className='gradient-border inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base font-semibold transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900'>
          Read the docs
        </Link>
      </div>
    </section>
  )
}

function PainPointsSection() {
  return (
    <section aria-label='Pain points' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-5xl'>
        <p className='mb-12 text-center font-mono text-sm font-medium uppercase tracking-widest text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Sound familiar?
        </p>
        <div className='grid gap-6 md:grid-cols-2'>
          {PAIN_POINTS.map((point, i) => (
            <div
              key={point.question}
              className='card-glow gradient-border rounded-2xl bg-pair-bg-light p-6 dark:bg-pair-bg-dark'
              style={{ animationDelay: `${i * 100}ms` }}>
              <p className='mb-2 font-sans text-lg font-bold text-pair-text-light dark:text-pair-text-dark'>
                {point.question}
              </p>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {point.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
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
      <div className='flex flex-wrap items-center justify-center gap-8 md:gap-12'>
        {TOOLS.map(tool => (
          <span
            key={tool.name}
            className='font-mono text-sm font-medium text-pair-text-muted-light transition-colors duration-200 hover:text-pair-text-light dark:text-pair-text-muted-dark dark:hover:text-pair-text-dark'
            role='img'
            aria-label={`${tool.name} logo`}>
            {tool.name}
          </span>
        ))}
      </div>
    </section>
  )
}

function DemoPlaceholderSection() {
  return (
    <section aria-label='Demo' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-4xl'>
        <div className='asset-placeholder h-80 rounded-2xl bg-pair-border-light dark:bg-pair-border-dark'>
          <span className='opacity-60'>[ demo video / terminal animation placeholder ]</span>
        </div>
      </div>
    </section>
  )
}

function AudienceTracksSection() {
  return (
    <section aria-label='Audience tracks' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          Built for <span className='gradient-text'>every scale</span>
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Whether you work alone, with a team, or across an organization — pair adapts to your
          workflow.
        </p>
        <div className='grid gap-8 md:grid-cols-3'>
          {AUDIENCE_TRACKS.map(track => (
            <div
              key={track.audience}
              className='card-glow group flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <span className='mb-4 font-mono text-3xl font-bold text-pair-blue/20 dark:text-pair-blue/30'>
                {track.icon}
              </span>
              <h3 className='mb-3 font-sans text-xl font-bold'>{track.audience}</h3>
              <p className='mb-4 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {track.pain}
              </p>
              <p className='mb-8 flex-1 text-sm'>{track.solution}</p>
              <Link
                href={track.href}
                className='gradient-border inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-300 hover:bg-slate-50 group-hover:shadow-md dark:hover:bg-slate-900'>
                {track.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section aria-label='How it works' className='relative overflow-hidden px-6 py-20 md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light via-pair-bg-light to-pair-border-light dark:from-pair-border-dark dark:via-pair-bg-dark dark:to-pair-border-dark' />
      <div className='relative mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          How it works
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Four phases. One continuous process. From idea to production.
        </p>
        <div className='grid gap-6 md:grid-cols-4'>
          {PHASES.map((phase, i) => (
            <div
              key={phase.name}
              className={`card-glow relative flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-6 dark:border-pair-border-dark dark:bg-pair-bg-dark ${i < PHASES.length - 1 ? 'phase-connector' : ''}`}>
              <span className='mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pair-blue to-pair-teal font-mono text-sm font-bold text-white'>
                {phase.step}
              </span>
              <h3 className='mb-2 font-sans text-lg font-bold'>{phase.name}</h3>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {phase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section aria-label='Features' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          What you get
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Everything your AI assistant needs to follow your standards.
        </p>
        <div className='grid gap-8 sm:grid-cols-2'>
          {FEATURES.map(feature => (
            <div
              key={feature.name}
              className='card-glow group rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <div
                className={`mb-4 h-1 w-12 rounded-full bg-gradient-to-r ${feature.accent} transition-all duration-300 group-hover:w-20`}
              />
              <h3 className='mb-2 font-sans text-lg font-bold'>{feature.name}</h3>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {feature.description}
              </p>
            </div>
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
      className='border-t border-pair-border-light px-6 py-20 text-center dark:border-pair-border-dark'>
      <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-4xl'>Open Source</h2>
      <p className='mb-8 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        pair is free, open source, and community-driven.
      </p>
      <a
        href='https://github.com/foomakers/pair'
        target='_blank'
        rel='noopener noreferrer'
        className='gradient-border inline-flex min-h-[48px] items-center gap-3 rounded-xl px-6 py-3 font-semibold transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900'
        aria-label='View pair on GitHub'>
        <svg width='22' height='22' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
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
      className='relative overflow-hidden px-6 py-20 text-center md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light to-pair-bg-light dark:from-pair-border-dark dark:to-pair-bg-dark' />
      <div className='relative'>
        <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-5xl'>
          Ready to <span className='gradient-text'>start?</span>
        </h2>
        <p className='mb-10 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Add pair to your project in under a minute.
        </p>
        <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
          <a
            href='https://github.com/foomakers/pair/releases/latest'
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl bg-pair-blue px-8 py-3 text-base font-semibold text-white shadow-lg shadow-pair-blue/25 transition-all duration-300 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
            Get pair
          </a>
          <Link
            href='/docs'
            className='gradient-border inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base font-semibold transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900'>
            Read the docs
          </Link>
        </div>
      </div>
    </section>
  )
}
