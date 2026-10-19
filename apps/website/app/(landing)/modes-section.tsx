import type { ReactNode } from 'react'
import { Button } from '@pair/brand'
import { URLS } from './constants'

interface Mode {
  name: string
  analogy: string
  description: string
  human: string
  level: number
  pictogram: { title: string; shape: ReactNode }
}

/** Small person glyph: head + shoulders. The human cue, always pair-blue. */
function Person({ x, y }: { x: number; y: number }) {
  return (
    <g className='text-pair-blue' fill='currentColor'>
      <circle cx={x} cy={y} r={3} />
      <path d={`M${x - 5} ${y + 10} a5 5 0 0 1 10 0 z`} />
    </g>
  )
}

const MODES: Mode[] = [
  {
    name: 'Assisted',
    analogy: 'You drive, pair helps.',
    description: 'pair guides every phase with AI. You run each skill and approve each step.',
    human: 'You: every step',
    level: 1,
    pictogram: {
      title: 'Assisted: four steps in a row, a person on each one',
      shape: (
        <>
          <path d='M8 42h144' className='opacity-30' stroke='currentColor' strokeWidth={2} />
          {[12, 52, 92, 132].map(x => (
            <g key={x}>
              <rect
                x={x}
                y={34}
                width={24}
                height={16}
                rx={3}
                fill='none'
                stroke='currentColor'
                strokeWidth={2}
              />
              <Person x={x + 12} y={14} />
            </g>
          ))}
        </>
      ),
    },
  },
  {
    name: 'Supervised',
    analogy: 'pair drives one stretch, you take over when asked.',
    description:
      'pair automates one card end to end, from Ready to a review-approved PR, and stops at a checkpoint or an escalation.',
    human: 'You: at checkpoints and escalations',
    level: 2,
    pictogram: {
      title: 'Supervised: one card moves through three stages, a person waits at the checkpoint',
      shape: (
        <>
          <path d='M38 42h92' className='text-pair-teal' stroke='currentColor' strokeWidth={3} />
          <rect
            x={8}
            y={30}
            width={28}
            height={24}
            rx={3}
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
          />
          {[60, 84, 108].map(x => (
            <circle key={x} cx={x} cy={42} r={5} className='text-pair-teal' fill='currentColor' />
          ))}
          <path d='M134 32v20' stroke='currentColor' strokeWidth={2} strokeDasharray='3 3' />
          <Person x={146} y={14} />
        </>
      ),
    },
  },
  {
    name: 'Autonomous',
    analogy: 'pair drives inside the area you define.',
    description:
      'pair watches the backlog and processes every card matching a criterion you set, for example risk:green, and hands a card back when a human is needed.',
    human: 'You: only on escalation',
    level: 3,
    pictogram: {
      title:
        'Autonomous: a backlog passes a filter into an automated lane, an arrow escalates back to a person',
      shape: (
        <>
          {[8, 14, 20].map((y, i) => (
            <rect
              key={y}
              x={8 + i * 3}
              y={y + i * 2}
              width={28}
              height={18}
              rx={3}
              fill='none'
              stroke='currentColor'
              strokeWidth={2}
              className={i < 2 ? 'opacity-40' : ''}
            />
          ))}
          <path
            d='M48 20h28l-8 14v14l-12 0v-14z'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
          />
          <path d='M80 42h44' className='text-pair-teal' stroke='currentColor' strokeWidth={3} />
          <rect
            x={90}
            y={34}
            width={18}
            height={16}
            rx={3}
            className='text-pair-teal'
            fill='currentColor'
          />
          <path
            d='M112 34q18-26 32-10'
            fill='none'
            className='text-pair-blue'
            stroke='currentColor'
            strokeWidth={2}
            strokeDasharray='3 3'
          />
          <Person x={146} y={12} />
        </>
      ),
    },
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
                aria-label={mode.pictogram.title}
                viewBox='0 0 160 56'
                className='mb-5 h-14 w-full max-w-[200px]'>
                <title>{mode.pictogram.title}</title>
                {mode.pictogram.shape}
              </svg>
              <div className='mb-4 flex items-center gap-2' aria-hidden='true'>
                {[1, 2, 3].map(i => (
                  <span
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${i <= mode.level ? 'bg-pair-teal' : 'bg-pair-border-light dark:bg-pair-border-dark'}`}
                  />
                ))}
              </div>
              <h3 className='mb-1 font-sans text-xl font-bold'>{mode.name}</h3>
              <p className='mb-1 text-sm font-medium'>{mode.analogy}</p>
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
