import type { ReactNode } from 'react'
import { Button } from '@pair/brand'
import { TerminalIcon, TeamIcon, BuildingIcon } from './icons'
import { URLS } from './constants'

interface AudienceTrack {
  audience: string
  icon: ReactNode
  pain: string
  solution: string
  cta: string
  href: string
}

const AUDIENCE_TRACKS: AudienceTrack[] = [
  {
    audience: 'Solo Dev',
    icon: <TerminalIcon className='h-7 w-7' />,
    pain: 'AI writes code fast, but your project has no structure, no tests, no process.',
    solution:
      'pair bootstraps your project with guidelines, skills, and quality gates — so AI follows your standards from day one.',
    cta: 'Get started',
    href: URLS.DOCS,
  },
  {
    audience: 'Team',
    icon: <TeamIcon className='h-7 w-7' />,
    pain: 'Every team member uses AI differently. No shared conventions, inconsistent output.',
    solution:
      'pair provides a shared knowledge base that every AI assistant reads — same guidelines, same quality, regardless of the tool.',
    cta: 'Set up for your team',
    href: URLS.DOCS_TEAM,
  },
  {
    audience: 'Organization',
    icon: <BuildingIcon className='h-7 w-7' />,
    pain: 'Scaling AI adoption across teams without governance is a recipe for technical debt.',
    solution:
      'pair lets you publish and distribute organizational standards as a knowledge base — version, govern, and evolve.',
    cta: 'Enterprise rollout',
    href: URLS.DOCS_ORG,
  },
]

export function AudienceTracksSection() {
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
              <div className='mb-4 text-pair-blue'>{track.icon}</div>
              <h3 className='mb-3 font-sans text-xl font-bold'>{track.audience}</h3>
              <p className='mb-4 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {track.pain}
              </p>
              <p className='mb-8 flex-1 text-sm'>{track.solution}</p>
              <Button
                as='a'
                variant='outline'
                href={track.href}
                className='inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 py-2 text-sm group-hover:shadow-md'>
                {track.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
