import { PAIR_BLUE, PAIR_TEAL } from '../tokens/colors'

export interface PairLogoProps {
  variant?: 'favicon' | 'navbar' | 'full'
  animate?: boolean
  className?: string
  size?: number
}

const ANIMATION_STYLES = `
  .pair-logo-animate .pair-pill-blue { transform: translateY(-4px); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .pair-logo-animate .pair-pill-teal { transform: translateY(4px); transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
  .pair-logo-animate:hover .pair-pill-blue { transform: translateY(0); }
  .pair-logo-animate:hover .pair-pill-teal { transform: translateY(0); }
  @media (prefers-reduced-motion: reduce) { .pair-logo-animate .pair-pill-blue, .pair-logo-animate .pair-pill-teal { transform: none; transition: none; } }
`

const variants = {
  favicon: { viewBox: '0 0 32 32', width: 32, height: 32, showWordmark: false },
  navbar: { viewBox: '0 0 80 24', width: 80, height: 24, showWordmark: true },
  full: { viewBox: '0 0 40 58', width: 40, height: 58, showWordmark: true },
}

export function PairLogo({
  variant = 'navbar',
  animate = true,
  className = '',
  size,
}: PairLogoProps) {
  const config = variants[variant]
  const containerClass = `pair-logo ${animate ? 'pair-logo-animate' : ''} ${className}`.trim()

  return (
    <div data-logo-container className={containerClass}>
      <svg
        role='img'
        aria-label='pair logo'
        viewBox={config.viewBox}
        width={size || config.width}
        height={size || config.height}
        overflow='visible'
        xmlns='http://www.w3.org/2000/svg'>
        <title>pair logo</title>
        <style>{ANIMATION_STYLES}</style>
        <Pills variant={variant} />
        {config.showWordmark && variant !== 'favicon' && <Wordmark variant={variant} />}
      </svg>
    </div>
  )
}

function Pills({ variant = 'navbar' }: { variant?: 'favicon' | 'navbar' | 'full' }) {
  const coords = {
    favicon: {
      blue: { x: 6, y: 8, width: 8, height: 16, rx: 4 },
      teal: { x: 18, y: 8, width: 8, height: 16, rx: 4 },
    },
    navbar: {
      blue: { x: 2, y: 4, width: 6, height: 16, rx: 3 },
      teal: { x: 12, y: 4, width: 6, height: 16, rx: 3 },
    },
    full: {
      blue: { x: 8, y: 2, width: 10, height: 20, rx: 5 },
      teal: { x: 22, y: 2, width: 10, height: 20, rx: 5 },
    },
  }
  const c = coords[variant]
  return (
    <g className='pair-pills'>
      <rect className='pair-pill-blue' {...c.blue} fill={PAIR_BLUE} />
      <rect className='pair-pill-teal' {...c.teal} fill={PAIR_TEAL} />
    </g>
  )
}

function Wordmark({ variant }: { variant: 'navbar' | 'full' }) {
  const config =
    variant === 'navbar'
      ? { x: 24, y: 18, fontSize: 14, anchor: undefined }
      : { x: 20, y: 48, fontSize: 18, anchor: 'middle' as const }

  return (
    <text
      data-wordmark
      x={config.x}
      y={config.y}
      fontFamily='var(--font-sans)'
      fontSize={config.fontSize}
      fontWeight='600'
      fill='currentColor'
      textAnchor={config.anchor}>
      pair
    </text>
  )
}
