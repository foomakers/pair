import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'pair — Code is the easy part.',
  description:
    'pair enables seamless dev-AI collaboration for any engineering team way of working.',
}

export default function HomePage() {
  return (
    <main className='flex min-h-screen flex-col items-center justify-center bg-pair-bg-light dark:bg-pair-bg-dark'>
      <div className='text-center'>
        <h1 className='text-5xl font-bold font-sans text-pair-text-light dark:text-pair-text-dark'>
          pair
        </h1>
        <p className='mt-4 text-xl text-pair-text-muted-light dark:text-pair-text-muted-dark'>
          Code is the easy part.
        </p>
        <div className='mt-8 flex gap-4 justify-center'>
          <Link
            href='/docs'
            className='rounded-pair bg-pair-blue px-6 py-3 font-semibold text-white transition-all hover:opacity-90'>
            Documentation
          </Link>
        </div>
      </div>
    </main>
  )
}
