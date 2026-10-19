import type { ReactNode } from 'react'
import { Card, GridPlusIcon, ShieldCheckIcon, FolderIcon, SlidersIcon } from '@pair/brand'

interface PainPoint {
  question: string
  detail: string
  icon: ReactNode
}

const PAIN_POINTS: PainPoint[] = [
  {
    question: 'Who owns the process when AI writes the code?',
    detail: 'Fast code without a process is fast debt.',
    icon: <GridPlusIcon className='h-6 w-6' />,
  },
  {
    question: "Who checks the AI's work?",
    detail: 'An agent that writes, judges and merges its own PR grades its own homework.',
    icon: <ShieldCheckIcon className='h-6 w-6' />,
  },
  {
    question: 'Where do decisions live between sessions?',
    detail: 'Every new prompt starts from zero unless decisions are files.',
    icon: <FolderIcon className='h-6 w-6' />,
  },
  {
    question: 'How far do you let it run?',
    detail: 'All or nothing is not a policy. You need gates, tiers and a way to take the wheel.',
    icon: <SlidersIcon className='h-6 w-6' />,
  },
]

export function PainPointsSection() {
  return (
    <section aria-label='Pain points' className='px-6 py-20 md:py-28'>
      <div className='mx-auto max-w-5xl'>
        <h2 className='mb-4 text-center font-sans text-2xl font-extrabold md:text-3xl'>
          <span className='gradient-text'>Sound familiar?</span>
        </h2>
        <p className='mx-auto mb-12 max-w-md text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          These are the questions every team hits when AI enters the workflow.
        </p>
        <div className='grid gap-6 md:grid-cols-2'>
          {PAIN_POINTS.map(point => (
            <Card
              key={point.question}
              variant='glow'
              className='bg-pair-bg-light dark:bg-pair-bg-dark'>
              <div className='mb-3 text-pair-blue'>{point.icon}</div>
              <p className='mb-2 font-sans text-lg font-bold text-pair-text-light dark:text-pair-text-dark'>
                {point.question}
              </p>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {point.detail}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
