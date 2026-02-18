import type { Config } from 'tailwindcss'
import { createPreset } from 'fumadocs-ui/tailwind-plugin'
import brandPreset from '../../packages/brand/src/tailwind-preset'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.mdx',
    './node_modules/fumadocs-ui/dist/**/*.js',
  ],
  darkMode: 'class',
  presets: [createPreset(), brandPreset as Partial<Config>],
} satisfies Config
