import { useState, useEffect } from 'react'
import {
  Header,
  LogoSection,
  IconsSection,
  ToolLogosSection,
  ThemeToggleSection,
  ButtonSection,
  CardSection,
  CalloutSection,
  ColorSection,
  TypographySection,
  UtilitySection,
} from './sections'

function App() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  return (
    <>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--pair-bg)',
          color: 'var(--pair-text-main)',
          padding: '2rem',
        }}>
        <Header isDark={isDark} onToggle={() => setIsDark(!isDark)} />
        <LogoSection />
        <IconsSection />
        <ToolLogosSection />
        <ThemeToggleSection />
        <ButtonSection />
        <CardSection />
        <CalloutSection />
        <ColorSection />
        <TypographySection />
        <UtilitySection />
      </div>
    </>
  )
}

export default App
