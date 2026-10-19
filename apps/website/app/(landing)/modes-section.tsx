import { Button } from '@pair/brand'
import { URLS } from './constants'

interface Mode {
  name: string
  analogy: string
  description: string
}

const MODES: Mode[] = [
  {
    name: 'Assisted',
    analogy: 'You drive, pair helps.',
    description: 'pair guides every phase with AI. You run each skill and approve each step.',
  },
  {
    name: 'Supervised',
    analogy: 'pair drives one stretch, you take over when asked.',
    description:
      'pair automates one card end to end, from Ready to a review-approved PR, and stops at a checkpoint or an escalation.',
  },
  {
    name: 'Autonomous',
    analogy: 'pair drives inside the area you define.',
    description:
      'pair watches the backlog and processes every card matching a criterion you set, for example risk:green, and hands a card back when a human is needed.',
  },
]

export function ModesSection() {
  return (
    <section aria-label='Three modes' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          Assisted, Supervised, <span className='gradient-text'>Autonomous.</span>
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Three modes, like the levels of driving automation. Same phases, same gates. Raise the
          level as trust grows.
        </p>
        <div className='grid gap-8 md:grid-cols-3'>
          {MODES.map(mode => (
            <div
              key={mode.name}
              className='card-glow flex flex-col rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <h3 className='mb-1 font-sans text-xl font-bold'>{mode.name}</h3>
              <p className='mb-4 text-sm font-medium text-pair-teal'>{mode.analogy}</p>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {mode.description}
              </p>
            </div>
          ))}
        </div>
        <p className='mx-auto mt-10 max-w-xl text-center text-sm font-medium'>
          Safe by default: nothing merges unattended until you declare it.
        </p>
        <div className='mt-8 text-center'>
          <Button
            as='a'
            variant='outline'
            href={URLS.LIFECYCLE_MODES}
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base'>
            Choose your mode
          </Button>
        </div>
      </div>
    </section>
  )
}
