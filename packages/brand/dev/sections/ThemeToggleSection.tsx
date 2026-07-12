import { Card, ThemeToggle } from '$components'
import { Section } from './primitives'

export function ThemeToggleSection() {
  return (
    <Section title='ThemeToggle'>
      <Card>
        <p style={{ fontSize: '0.875rem', color: 'var(--pair-text-muted)', marginBottom: '1rem' }}>
          Fixed-position toggle (top-right corner). Uses next-themes useTheme hook.
        </p>
        <div
          style={{
            position: 'relative',
            height: '60px',
            border: '1px dashed var(--pair-border)',
            borderRadius: '8px',
          }}>
          <ThemeToggle />
        </div>
      </Card>
    </Section>
  )
}
