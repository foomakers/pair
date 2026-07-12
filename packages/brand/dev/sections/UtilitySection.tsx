import { Section, UtilityCard } from './primitives'

export function UtilitySection() {
  return (
    <Section title='Utility Classes'>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        <UtilityCard className='gradient-brand' label='gradient-brand' />
        <UtilityCard className='glass-effect' label='glass-effect'>
          <div
            style={{
              position: 'relative',
              height: '100px',
              borderRadius: '8px',
              marginBottom: '0.5rem',
              overflow: 'hidden',
            }}>
            <div
              className='gradient-brand'
              style={{ position: 'absolute', inset: 0, opacity: 0.8 }}
            />
            <div
              className='glass-effect'
              style={{ position: 'absolute', inset: '15%', borderRadius: '8px' }}
            />
          </div>
        </UtilityCard>
        <UtilityCard className='text-gradient' label='text-gradient'>
          <h3
            className='text-gradient'
            style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            pair
          </h3>
        </UtilityCard>
        <UtilityCard className='gradient-border' label='gradient-border' />
        <UtilityCard className='card-glow' label='card-glow'>
          <div
            className='card-glow'
            style={{
              height: '100px',
              borderRadius: '8px',
              marginBottom: '0.5rem',
              border: '1px solid var(--pair-border)',
            }}
          />
        </UtilityCard>
      </div>
    </Section>
  )
}
