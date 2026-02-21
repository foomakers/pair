'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className='fixed right-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-pair-border-light bg-pair-bg-light/80 backdrop-blur-sm transition-all duration-200 hover:bg-slate-100 dark:border-pair-border-dark dark:bg-pair-bg-dark/80 dark:hover:bg-slate-800'
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {isDark ? (
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          className='h-5 w-5'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z'
          />
        </svg>
      ) : (
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.5'
          className='h-5 w-5'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z'
          />
        </svg>
      )}
    </button>
  )
}
