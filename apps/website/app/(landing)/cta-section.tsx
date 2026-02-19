import { Button } from '@pair/brand'

export function CTASection() {
  return (
    <section
      aria-label='Call to action'
      className='relative overflow-hidden px-6 py-20 text-center md:py-28'>
      <div className='absolute inset-0 bg-gradient-to-b from-pair-border-light to-pair-bg-light dark:from-pair-border-dark dark:to-pair-bg-dark' />
      <div className='relative'>
        <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-5xl'>
          Ready to <span className='gradient-text'>start?</span>
        </h2>
        <p className='mb-10 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Add pair to your project in under a minute.
        </p>
        <div className='flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
          <Button
            as='a'
            variant='primary'
            href='https://github.com/foomakers/pair/releases/latest'
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base shadow-lg shadow-pair-blue/25 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
            Get pair
          </Button>
          <Button
            as='a'
            variant='outline'
            href='/docs'
            className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-8 py-3 text-base'>
            Read the docs
          </Button>
        </div>
      </div>
    </section>
  )
}
