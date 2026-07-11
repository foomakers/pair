import { Card } from '$components'
import { Section, TypoBlock } from './primitives'

export function TypographySection() {
  return (
    <Section title='Typography'>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <TypoBlock title='Headings (Plus Jakarta Sans)'>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700 }}>Heading 1</h1>
            <h2 style={{ fontSize: '2rem', fontWeight: 700 }}>Heading 2</h2>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Heading 3</h3>
          </TypoBlock>
          <TypoBlock title='Body Text (Plus Jakarta Sans)'>
            <p style={{ fontSize: '1rem' }}>
              This is regular body text. pair is an AI-assisted development tool built for pragmatic
              developers.
            </p>
          </TypoBlock>
          <TypoBlock title='Code (JetBrains Mono)'>
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                backgroundColor: 'rgba(0,0,0,0.1)',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
              }}>
              import &#123; PairLogo &#125; from '@pair/brand'
            </code>
          </TypoBlock>
        </div>
      </Card>
    </Section>
  )
}
