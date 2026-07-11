import { Card } from '$components'
import { Section } from './primitives'

export function CardSection() {
  return (
    <Section title='Cards'>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        <Card>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Standard Card
          </h3>
          <p style={{ color: 'var(--pair-text-muted)' }}>
            Basic card with rounded corners, border, and shadow.
          </p>
        </Card>
        <Card glass={true}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Glass Effect Card
          </h3>
          <p style={{ color: 'var(--pair-text-muted)' }}>Card with glass-effect backdrop blur.</p>
        </Card>
        <Card variant='glow'>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Glow Card
          </h3>
          <p style={{ color: 'var(--pair-text-muted)' }}>
            Card with glow hover and gradient border.
          </p>
        </Card>
      </div>
    </Section>
  )
}
