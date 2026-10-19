import { PairLogo, Button } from '@pair/brand'
import { INSTALL_COMMAND, URLS } from './constants'

export function HeroSection() {
  return (
    <section
      aria-label='Hero'
      className='relative flex flex-col items-center overflow-hidden px-6 pb-20 pt-28 text-center md:pb-28 md:pt-36'>
      <div className='hero-glow animate-float' />
      <PairLogo variant='full' animate size={120} className='relative z-10 mb-10' />
      <h1 className='relative z-10 font-sans text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl'>
        Code is the <span className='gradient-text'>easy part.</span>
      </h1>
      <p className='relative z-10 mt-6 max-w-2xl text-lg text-pair-text-muted-light dark:text-pair-text-muted-dark md:text-xl'>
        <strong className='text-pair-text-light dark:text-pair-text-dark'>pair</strong> runs your
        development process with AI, from PRD to merged PR.
        <br />
        Assisted, supervised or autonomous:
      </p>
      <p className='relative z-10 mt-2 text-xl font-bold md:text-2xl'>
        <span className='gradient-text'>you decide who drives.</span>
      </p>
      <div className='relative z-10 mt-10'>
        <Button
          as='a'
          variant='primary'
          href={URLS.QUICKSTART}
          className='inline-flex min-h-[48px] items-center justify-center rounded-xl px-10 py-3 text-base shadow-lg shadow-pair-blue/25 hover:shadow-xl hover:shadow-pair-blue/30 hover:-translate-y-0.5'>
          Get started
        </Button>
      </div>
      <p className='relative z-10 mt-8 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        <code className='rounded-lg border border-pair-border-light bg-pair-bg-light px-3 py-1.5 font-mono text-pair-text-light dark:border-pair-border-dark dark:bg-pair-bg-dark dark:text-pair-text-dark'>
          {INSTALL_COMMAND}
        </code>
      </p>
      <p className='relative z-10 mt-3 text-xs text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Claude Code plugin, optional: <code className='font-mono'>/plugin install pair@pair</code>
      </p>
    </section>
  )
}
