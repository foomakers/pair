import { Button } from '$components'

export function Header({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '1rem' }}>
        @pair/brand Component Showcase
      </h1>
      <p style={{ fontSize: '1.125rem', color: 'var(--pair-text-muted)' }}>
        Brand identity component library
      </p>
      <Button variant='ghost' onClick={onToggle} style={{ marginTop: '1rem' }}>
        Toggle {isDark ? 'Light' : 'Dark'} Mode
      </Button>
    </header>
  )
}
