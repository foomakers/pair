import type { ReactNode } from 'react'
import { Card } from '@pair/brand'
import { GridPlusIcon, ShieldCheckIcon, FolderIcon, UsersIcon } from './icons'

interface PainPoint {
  question: string
  detail: string
  icon: ReactNode
}

const PAIN_POINTS: PainPoint[] = [
  {
    question: 'Who owns the process when AI writes the code?',
    detail: 'AI generates code fast — but without process, you ship debt faster.',
    icon: <GridPlusIcon className='h-6 w-6' />,
  },
  {
    question: 'How do you keep quality consistent across AI-assisted sprints?',
    detail: 'Different prompts, different outputs. No shared standards, no consistency.',
    icon: <ShieldCheckIcon className='h-6 w-6' />,
  },
  {
    question: 'Where do architectural decisions live when agents switch context?',
    detail: 'Decisions are lost between sessions. Every new prompt starts from zero.',
    icon: <FolderIcon className='h-6 w-6' />,
  },
  {
    question: 'How does your team scale AI collaboration without chaos?',
    detail: 'One dev uses Cursor, another uses Copilot. No shared conventions.',
    icon: <UsersIcon className='h-6 w-6' />,
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
