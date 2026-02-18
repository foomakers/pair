// Tailwind preset for Pair brand
// Consumers use: presets: [require('@pair/brand/tailwind-preset')]

import type { Config } from 'tailwindcss'

const brandPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        'pair-blue': '#0062FF',
        'pair-teal': '#00D1FF',
        'pair-bg-light': '#FFFFFF',
        'pair-bg-dark': '#0A0D14',
        'pair-text-light': '#0A0D14',
        'pair-text-dark': '#F8FAFC',
        'pair-text-muted-light': '#4B5563',
        'pair-text-muted-dark': '#94A3B8',
        'pair-border-light': '#F1F5F9',
        'pair-border-dark': '#1E293B',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        pair: '1rem',
        'pair-lg': '1.5rem',
        'pair-xl': '2rem',
      },
      transitionTimingFunction: {
        elastic: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
}

export { brandPreset }
export default brandPreset
