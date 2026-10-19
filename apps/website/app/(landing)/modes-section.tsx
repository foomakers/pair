import { Button } from '@pair/brand'
import { URLS } from './constants'

interface Mode {
  name: string
  analogy: string
  description: string
  human: string
  scope: string
  level: number
  hands: 'on' | 'ready' | 'off'
  icon: string
}

/** Steering wheel with the human's hands: on the rim, hovering just off it, or absent. */
function Wheel({ hands, level }: { hands: Mode['hands']; level: number }) {
  const hx = hands === 'on' ? 10 : 0
  const rim = level > 1 ? 'text-pair-teal' : ''
  return (
    <>
      <g className={rim} fill='none' stroke='currentColor' strokeWidth={3}>
        <circle cx={48} cy={40} r={26} />
        <circle cx={48} cy={40} r={6} />
        <path d='M22 40h20M54 40h20M48 46v20' />
      </g>
      {hands !== 'off' && (
        <g className='text-pair-blue' fill='currentColor'>
          <rect x={6 + hx} y={28} width={12} height={24} rx={6} />
          <rect x={78 - hx} y={28} width={12} height={24} rx={6} />
          {hands === 'ready' && (
            <path
              d='M20 40h4M72 40h4'
              stroke='currentColor'
              strokeWidth={2}
              strokeDasharray='2 2'
            />
          )}
        </g>
      )}
    </>
  )
}

const MODES: Mode[] = [
  {
    name: 'Assisted',
    hands: 'on',
    icon: 'Assisted: hands on the wheel',
    analogy: 'You drive, pair helps.',
    description: 'pair guides every phase with AI. You run each skill and approve each step.',
    scope: 'each step',
    human: 'You: every step',
    level: 1,
  },
  {
    name: 'Supervised',
    hands: 'ready',
    icon: 'Supervised: hands ready, just off the wheel',
    analogy: 'pair drives one stretch, you take over when asked.',
    description:
      'pair automates one card end to end, from Ready to a review-approved PR, and stops at a checkpoint or an escalation.',
    scope: 'one card, end to end',
    human: 'You: at checkpoints and escalations',
    level: 2,
  },
  {
    name: 'Autonomous',
    hands: 'off',
    icon: 'Autonomous: hands off, the wheel drives',
    analogy: 'pair drives inside the area you define.',
    description:
      'pair watches the backlog and processes every card matching a criterion you set, for example risk:green, and hands a card back when a human is needed.',
    scope: 'the backlog, filtered by your criterion',
    human: 'You: only on escalation',
    level: 3,
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
              <svg
                role='img'
                aria-label={mode.icon}
                viewBox='0 0 96 80'
                className='mx-auto mb-5 h-20 w-24'>
                <title>{mode.icon}</title>
                <Wheel hands={mode.hands} level={mode.level} />
              </svg>
              <div className='mb-6'>
                <div className='flex items-center gap-2' aria-hidden='true'>
                  {[1, 2, 3].map(i => (
                    <span
                      key={i}
                      className={`h-3 flex-1 rounded-full ${i <= mode.level ? 'bg-pair-teal' : 'bg-pair-border-light dark:bg-pair-border-dark'}`}
                    />
                  ))}
                </div>
                <span className='sr-only'>Automation level {mode.level} of 3</span>
              </div>
              <h3 className='mb-1 font-sans text-xl font-bold'>{mode.name}</h3>
              <p className='mb-1 text-sm font-medium'>{mode.analogy}</p>
              <p className='text-xs font-semibold uppercase tracking-wide'>Scope: {mode.scope}</p>
              <p className='mb-4 text-xs font-semibold uppercase tracking-wide'>{mode.human}</p>
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
