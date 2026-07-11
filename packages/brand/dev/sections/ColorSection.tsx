import { Card } from '$components'
import { PAIR_BLUE, PAIR_TEAL, LIGHT_BG, LIGHT_TEXT_MAIN, DARK_BG, DARK_TEXT_MAIN } from '$tokens'
import { Section, ColorSwatch } from './primitives'

export function ColorSection() {
  return (
    <Section title='Color Palette'>
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
          }}>
          <ColorSwatch color={PAIR_BLUE} label='PAIR Blue' />
          <ColorSwatch color={PAIR_TEAL} label='PAIR Teal' />
          <ColorSwatch color={LIGHT_BG} label='Light BG' border />
          <ColorSwatch color={LIGHT_TEXT_MAIN} label='Light Text' />
          <ColorSwatch color={DARK_BG} label='Dark BG' />
          <ColorSwatch color={DARK_TEXT_MAIN} label='Dark Text' border />
        </div>
      </Card>
    </Section>
  )
}
