import { useState, useEffect } from 'react'
import { PairLogo, Card, Button, Callout, ThemeToggle } from '$components'
import {
  GridPlusIcon,
  ShieldCheckIcon,
  FolderIcon,
  UsersIcon,
  TerminalIcon,
  TeamIcon,
  BuildingIcon,
  RocketIcon,
  MapIcon,
  CodeIcon,
  CheckCircleIcon,
  BoltIcon,
  BookIcon,
  SlidersIcon,
  LinkIcon,
  GitHubIcon,
} from '$components'
import { AnthropicLogo, CursorLogo, CopilotLogo, WindsurfLogo, OpenAILogo } from '$components'
import { PAIR_BLUE, PAIR_TEAL, LIGHT_BG, LIGHT_TEXT_MAIN, DARK_BG, DARK_TEXT_MAIN } from '$tokens'

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

function Header({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
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

function LogoSection() {
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

function LogoVariant({
  variant,
  label,
}: {
  variant: 'favicon' | 'navbar' | 'full'
  label: string
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <PairLogo variant={variant} />
      <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>{label}</p>
    </div>
  )
}

function IconsSection() {
  const icons = [
    { name: 'GridPlusIcon', Icon: GridPlusIcon },
    { name: 'ShieldCheckIcon', Icon: ShieldCheckIcon },
    { name: 'FolderIcon', Icon: FolderIcon },
    { name: 'UsersIcon', Icon: UsersIcon },
    { name: 'TerminalIcon', Icon: TerminalIcon },
    { name: 'TeamIcon', Icon: TeamIcon },
    { name: 'BuildingIcon', Icon: BuildingIcon },
    { name: 'RocketIcon', Icon: RocketIcon },
    { name: 'MapIcon', Icon: MapIcon },
    { name: 'CodeIcon', Icon: CodeIcon },
    { name: 'CheckCircleIcon', Icon: CheckCircleIcon },
    { name: 'BoltIcon', Icon: BoltIcon },
    { name: 'BookIcon', Icon: BookIcon },
    { name: 'SlidersIcon', Icon: SlidersIcon },
    { name: 'LinkIcon', Icon: LinkIcon },
    { name: 'GitHubIcon', Icon: GitHubIcon },
  ]
  return (
    <Section title='Icons (16)'>
      <Card>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: '1.5rem',
          }}>
          {icons.map(({ name, Icon }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <Icon style={{ width: 28, height: 28, margin: '0 auto' }} />
              <p
                style={{
                  fontSize: '0.7rem',
                  marginTop: '0.4rem',
                  color: 'var(--pair-text-muted)',
                }}>
                {name}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  )
}

function ToolLogosSection() {
  const logos = [
    { name: 'Anthropic', Logo: AnthropicLogo },
    { name: 'Cursor', Logo: CursorLogo },
    { name: 'Copilot', Logo: CopilotLogo },
    { name: 'Windsurf', Logo: WindsurfLogo },
    { name: 'OpenAI', Logo: OpenAILogo },
  ]
  return (
    <Section title='Tool Logos (5)'>
      <Card>
        <div
          style={{
            display: 'flex',
            gap: '3rem',
            alignItems: 'center',
            justifyContent: 'space-around',
            flexWrap: 'wrap',
          }}>
          {logos.map(({ name, Logo }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <Logo style={{ width: 32, height: 32, margin: '0 auto' }} />
              <p
                style={{
                  fontSize: '0.75rem',
                  marginTop: '0.4rem',
                  color: 'var(--pair-text-muted)',
                }}>
                {name}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  )
}

function ThemeToggleSection() {
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

function ButtonSection() {
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

function CardSection() {
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

function CalloutSection() {
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

function ColorSection() {
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

function TypographySection() {
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

function TypoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: '0.875rem', color: 'var(--pair-text-muted)', marginBottom: '0.5rem' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function UtilityCard({
  className,
  label,
  children,
}: {
  className: string
  label: string
  children?: React.ReactNode
}) {
  const swatch = { height: '100px', borderRadius: '8px', marginBottom: '0.5rem' } as const
  return (
    <Card>
      {children ?? <div className={className} style={swatch} />}
      <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>.{label}</p>
    </Card>
  )
}

function UtilitySection() {
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '4rem' }}>
      <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1.5rem' }}>{title}</h2>
      {children}
    </section>
  )
}

function ColorSwatch({ color, label, border }: { color: string; label: string; border?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: '100%',
          height: '80px',
          backgroundColor: color,
          borderRadius: '8px',
          marginBottom: '0.5rem',
          border: border ? '1px solid #ccc' : 'none',
        }}
      />
      <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{label}</p>
      <p
        style={{
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--pair-text-muted)',
        }}>
        {color}
      </p>
    </div>
  )
}

export default App
