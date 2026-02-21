import type { ReactNode } from 'react'
import { RocketIcon, MapIcon, CodeIcon, CheckCircleIcon } from '@pair/brand'

interface Phase {
  step: string
  name: string
  description: string
  icon: ReactNode
}

const PHASES: Phase[] = [
  {
    step: '01',
    name: 'Bootstrap',
    description: 'Define your project: PRD, tech stack, quality gates.',
    icon: <RocketIcon className='h-5 w-5' />,
  },
  {
    step: '02',
    name: 'Plan',
    description: 'Break work into initiatives, epics, stories, and tasks.',
    icon: <MapIcon className='h-5 w-5' />,
  },
  {
    step: '03',
    name: 'Implement',
    description: 'AI follows your guidelines. TDD, quality checks, adoption compliance.',
    icon: <CodeIcon className='h-5 w-5' />,
  },
  {
    step: '04',
    name: 'Review',
    description: 'Structured code review against your standards. Merge with confidence.',
    icon: <CheckCircleIcon className='h-5 w-5' />,
  },
]

export function HowItWorksSection() {
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
              <h3 className='mb-1 font-sans text-lg font-bold'>{phase.name}</h3>
              <div className='mb-2 text-pair-teal'>{phase.icon}</div>
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
