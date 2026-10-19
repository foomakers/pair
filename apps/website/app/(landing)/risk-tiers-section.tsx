import { Button } from '@pair/brand'
import { URLS } from './constants'

export function RiskTiersSection() {
  return (
    <section aria-label='Risk tiers and gates' className='px-6 py-16 text-center md:py-20'>
      <div className='mx-auto max-w-2xl'>
        <h2 className='mb-4 font-sans text-2xl font-extrabold md:text-3xl'>
          Risk tiers decide the ceremony.
        </h2>
        <p className='mb-8 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Every story carries a risk tier. The tier decides the gate, the review depth and whether a
          PR may merge without a human. Review can raise a tier, never lower it. Escalation reaches
          a human only when the tier says so.
        </p>
        <Button
          as='a'
          variant='outline'
          href={URLS.TAG_AUTOMATION}
          className='inline-flex min-h-[44px] items-center justify-center rounded-xl px-6 py-2 text-sm'>
          How tags drive automation
        </Button>
      </div>
    </section>
  )
}
