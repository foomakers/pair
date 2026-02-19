import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
  glass?: boolean
  variant?: 'default' | 'glow'
}

export function Card({ children, className = '', glass = false, variant = 'default' }: CardProps) {
  const baseClass =
    'pair-card rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm'
  const glassClass = glass ? 'glass-effect' : ''
  const variantClass = variant === 'glow' ? 'card-glow gradient-border' : ''
  const combinedClass = `${baseClass} ${glassClass} ${variantClass} ${className}`.trim()

  return <div className={combinedClass}>{children}</div>
}
