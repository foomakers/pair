import { URLS } from './constants'

export function WhatsNewBanner() {
  return (
    <section
      aria-label='What is new'
      className='border-b border-pair-border-light px-6 py-4 text-center text-sm dark:border-pair-border-dark'>
      <h2 className='inline font-sans font-bold'>New in v0.5.0:</h2>{' '}
      <span className='text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        delivery workflow, lifecycle modes, autonomous backlog delivery.
      </span>{' '}
      <a href={URLS.WHATS_NEW} className='font-medium text-pair-blue underline underline-offset-4'>
        Read what&apos;s new
      </a>
    </section>
  )
}
