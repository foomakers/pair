import { PairLogo, Card } from '$components'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '4rem' }}>
      <h2 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '1.5rem' }}>{title}</h2>
      {children}
    </section>
  )
}

export function LogoVariant({
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

export function ColorSwatch({
  color,
  label,
  border,
}: {
  color: string
  label: string
  border?: boolean
}) {
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

export function TypoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: '0.875rem', color: 'var(--pair-text-muted)', marginBottom: '0.5rem' }}>
        {title}
      </p>
      {children}
    </div>
  )
}

export function UtilityCard({
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
