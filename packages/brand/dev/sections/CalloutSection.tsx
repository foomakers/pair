import { Callout } from '$components'
import { Section } from './primitives'

export function CalloutSection() {
  return (
    <Section title='Callouts'>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Callout type='info' title='Information'>
          This is an informational callout with blue accent.
        </Callout>
        <Callout type='warning' title='Warning'>
          This is a warning callout with amber accent.
        </Callout>
        <Callout type='tip' title='Pro Tip'>
          This is a tip callout with teal accent.
        </Callout>
      </div>
    </Section>
  )
}
