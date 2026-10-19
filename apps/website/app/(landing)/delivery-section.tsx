import type { ReactNode } from 'react'
import { Button, CodeIcon, ShieldCheckIcon, CheckCircleIcon, FolderIcon } from '@pair/brand'
import { URLS } from './constants'

interface Step {
  name: string
  description: string
  icon: ReactNode
}

const STEPS: Step[] = [
  {
    name: 'Implement',
    description: 'Tests and code, test-first, one pull request per story.',
    icon: <CodeIcon className='h-6 w-6' />,
  },
  {
    name: 'Verify',
    description: 'An independent reviewer checks the exact PR head. The implementer never reviews.',
    icon: <ShieldCheckIcon className='h-6 w-6' />,
  },
  {
    name: 'Fix inside a seal',
    description:
      'Every finding gets a failing test first, sealed byte for byte. The fix lands above it and cannot weaken it.',
    icon: <CheckCircleIcon className='h-6 w-6' />,
  },
  {
    name: 'Resume anywhere',
    description: 'State is files, not a chat. An interruption costs nothing.',
    icon: <FolderIcon className='h-6 w-6' />,
  },
]

export function DeliverySection() {
  return (
    <section
      aria-label='Delivery workflow'
      className='border-y border-pair-border-light px-6 py-20 dark:border-pair-border-dark md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <h2 className='mb-4 text-center font-sans text-3xl font-extrabold md:text-5xl'>
          AI should not grade its own work.
        </h2>
        <p className='mx-auto mb-16 max-w-xl text-center text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          One card, one state machine, independent roles. The delivery workflow takes a Ready card
          to a review-approved PR.
        </p>
        <div className='grid gap-8 sm:grid-cols-2'>
          {STEPS.map(step => (
            <div
              key={step.name}
              className='card-glow rounded-2xl border border-pair-border-light bg-pair-bg-light p-8 dark:border-pair-border-dark dark:bg-pair-bg-dark'>
              <div className='mb-4 text-pair-blue'>{step.icon}</div>
              <h3 className='mb-2 font-sans text-lg font-bold'>{step.name}</h3>
              <p className='text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
                {step.description}
              </p>
            </div>
          ))}
        </div>
        <div className='mt-12 text-center'>
          <Button
            as='a'
            variant='outline'
            href={URLS.DELIVERY_WORKFLOW}
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base'>
            See the delivery workflow
          </Button>
        </div>
      </div>
    </section>
  )
}
