import { Card, Button } from '$components'
import { Section } from './primitives'

export function ButtonSection() {
  return (
    <Section title='Buttons'>
      <Card>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Button variant='primary'>Primary Button</Button>
          <Button variant='secondary'>Secondary Button</Button>
          <Button variant='ghost'>Ghost Button</Button>
          <Button variant='outline'>Outline Button</Button>
          <Button as='a' href='#'>
            Link Button
          </Button>
          <Button variant='primary' disabled>
            Disabled
          </Button>
        </div>
      </Card>
    </Section>
  )
}
