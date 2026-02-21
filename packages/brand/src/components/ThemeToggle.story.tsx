import { ThemeProvider } from 'next-themes'
import { ThemeToggle } from './ThemeToggle'

export function ThemeToggleLight() {
  return (
    <ThemeProvider defaultTheme='light'>
      <ThemeToggle />
    </ThemeProvider>
  )
}

export function ThemeToggleDark() {
  return (
    <ThemeProvider defaultTheme='dark'>
      <ThemeToggle />
    </ThemeProvider>
  )
}
