import type { Config } from 'tailwindcss'
import brandPreset from './src/tailwind-preset'

export default {
  content: ['./dev/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [brandPreset],
  darkMode: 'class',
} satisfies Config
