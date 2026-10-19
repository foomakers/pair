import type { ReactNode } from 'react'
import { Button, RocketIcon, MapIcon, CodeIcon, CheckCircleIcon } from '@pair/brand'
import { URLS } from './constants'

interface Phase {
  step: string
  name: string
  description: string
  icon: ReactNode
}

const PHASES: Phase[] = [
  {
    step: '01',
    name: 'Induction',
    description: 'Once per project: PRD, bootstrap, prioritized initiatives.',
    icon: <RocketIcon className='h-5 w-5' />,
  },
  {
    step: '02',
    name: 'Strategic planning',
    description: 'Per initiative: epics sized for a few sprints each.',
    icon: <MapIcon className='h-5 w-5' />,
  },
  {
    step: '03',
    name: 'Iteration',
    description: 'Per epic: stories, refinement, tasks. Ready means ready.',
    icon: <CodeIcon className='h-5 w-5' />,
  },
  {
    step: '04',
    name: 'Execution',
    description: 'Per story: implement, independent review, merged pull request.',
    icon: <CheckCircleIcon className='h-5 w-5' />,
  },
]

export function LifecycleSection() {
  return (
    <section
      aria-label='Process lifecycle'
      className='relative overflow-hidden px-6 py-20 md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light via-pair-bg-light to-pair-border-light dark:from-pair-border-dark dark:via-pair-bg-dark dark:to-pair-border-dark' />
      <div className='relative mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          One lifecycle, from idea to merged PR.
        </h2>
        <p className='mx-auto mb-12 max-w-2xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Four phases take a product from PRD to code. Two workflows, refinement and delivery, run
          on top of them. Three modes decide who drives. Same process every time, whoever or
          whatever runs it.
        </p>
        <div className='mx-auto mb-12 max-w-4xl rounded-2xl bg-white p-4 shadow-sm md:p-6'>
          <img
            src='/diagrams/lifecycle-overview.svg'
            alt='The pair lifecycle: four phases, the refinement and delivery workflows on top, three modes choosing who drives'
            className='h-auto w-full'
            width={1080}
            height={380}
          />
        </div>
        <div className='grid gap-6 md:grid-cols-4'>
          {PHASES.map((phase, i) => (
            <div
              key={phase.name}
              className={`card-glow relative flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-6 dark:border-pair-border-dark dark:bg-pair-bg-dark ${i < PHASES.length - 1 ? 'phase-connector' : ''}`}>
              <span className='mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pair-blue to-pair-teal font-mono text-sm font-bold text-white'>
                {phase.step}
              </span>
              <h3 className='mb-1 font-sans text-lg font-bold'>{phase.name}</h3>
              <div className='mb-2 text-pair-teal'>{phase.icon}</div>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {phase.description}
              </p>
            </div>
          ))}
        </div>
        <div className='mt-12 text-center'>
          <Button
            as='a'
            variant='outline'
            href={URLS.LIFECYCLE}
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base'>
            Explore the lifecycle
          </Button>
        </div>
      </div>
    </section>
  )
}
