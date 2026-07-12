import { Card } from '$components'
import { Section, LogoVariant } from './primitives'

export function LogoSection() {
  return (
    <Section title='Logo Variants'>
      <Card>
        <div
          style={{
            display: 'flex',
            gap: '3rem',
            alignItems: 'center',
            justifyContent: 'space-around',
            flexWrap: 'wrap',
          }}>
          <LogoVariant variant='favicon' label='Favicon (32x32)' />
          <LogoVariant variant='navbar' label='Navbar (24px)' />
          <LogoVariant variant='full' label='Full (40x52)' />
        </div>
      </Card>
    </Section>
  )
}
