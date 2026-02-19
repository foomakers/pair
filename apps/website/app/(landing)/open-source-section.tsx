import { Button } from '@pair/brand'
import { GitHubIcon } from './icons'

export function OpenSourceSection() {
  return (
    <section
      aria-label='Open source'
      className='border-t border-pair-border-light px-6 py-20 text-center dark:border-pair-border-dark'>
      <h2 className='mb-4 font-sans text-3xl font-extrabold md:text-4xl'>Open Source</h2>
      <p className='mb-8 text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        pair is free, open source, and community-driven.
      </p>
      <Button
        as='a'
        variant='outline'
        href='https://github.com/foomakers/pair'
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex min-h-[48px] items-center gap-3 rounded-xl px-6 py-3'
        aria-label='View pair on GitHub'>
        <GitHubIcon width={22} height={22} />
        foomakers/pair
      </Button>
    </section>
  )
}
