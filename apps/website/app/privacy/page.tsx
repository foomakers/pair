import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — pair',
  description: 'Privacy policy for the pair documentation website',
}

export default function PrivacyPage() {
  return (
    <main className='mx-auto max-w-2xl px-6 py-16 font-sans text-pair-text-light dark:text-pair-text-dark'>
      <h1 className='text-3xl font-bold'>Privacy Policy</h1>
      <p className='mt-2 text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Last updated: February 2026
      </p>

      <section className='mt-8 space-y-4'>
        <h2 className='text-xl font-semibold'>Analytics</h2>
        <p>
          This site uses{' '}
          <a
            href='https://posthog.com'
            className='text-pair-blue underline'
            target='_blank'
            rel='noopener noreferrer'>
            PostHog
          </a>{' '}
          for anonymous analytics in <strong>cookieless mode</strong>.
        </p>
        <ul className='list-disc pl-6 space-y-1'>
          <li>No cookies are set on your device</li>
          <li>No personally identifiable information (PII) is collected</li>
          <li>Data is stored in memory only for the duration of your visit</li>
          <li>
            Each page visit is treated as a new anonymous session — we cannot track you across
            visits
          </li>
        </ul>
      </section>

      <section className='mt-8 space-y-4'>
        <h2 className='text-xl font-semibold'>What we collect</h2>
        <ul className='list-disc pl-6 space-y-1'>
          <li>Page views (which pages are visited)</li>
          <li>Web Vitals performance metrics (LCP, CLS, INP) — anonymous, aggregated</li>
          <li>Referrer URL (how you found this site)</li>
          <li>Browser and device type (aggregated, not individual)</li>
        </ul>
      </section>

      <section className='mt-8 space-y-4'>
        <h2 className='text-xl font-semibold'>Data processor</h2>
        <p>
          Analytics data is processed by PostHog (PostHog Inc.). PostHog is hosted in the EU. No
          data is shared with third parties.
        </p>
      </section>

      <section className='mt-8 space-y-4'>
        <h2 className='text-xl font-semibold'>Opt out</h2>
        <p>
          You can block all analytics tracking by using any ad blocker (e.g., uBlock Origin). The
          site functions fully without analytics.
        </p>
      </section>

      <section className='mt-8 space-y-4'>
        <h2 className='text-xl font-semibold'>Contact</h2>
        <p>
          For privacy questions, open an issue on{' '}
          <a
            href='https://github.com/foomakers/pair'
            className='text-pair-blue underline'
            target='_blank'
            rel='noopener noreferrer'>
            GitHub
          </a>
          .
        </p>
      </section>
    </main>
  )
}
