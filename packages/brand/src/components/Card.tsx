import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
  glass?: boolean
}

export function Card({ children, className = '', glass = false }: CardProps) {
  const baseClass =
    'pair-card rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm'
  const glassClass = glass ? 'glass-effect' : ''
  const combinedClass = `${baseClass} ${glassClass} ${className}`.trim()

  return <div className={combinedClass}>{children}</div>
}
