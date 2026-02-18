import type { ReactNode } from 'react'

export interface CalloutProps {
  type?: 'info' | 'warning' | 'tip'
  title?: string
  children: ReactNode
  className?: string
}

export function Callout({ type = 'info', title, children, className = '' }: CalloutProps) {
  const baseClass = 'pair-callout rounded-lg p-4 border-l-4'

  const typeClasses = {
    info: 'bg-blue-50 dark:bg-blue-950 border-pair-blue',
    warning: 'bg-amber-50 dark:bg-amber-950 border-amber-500',
    tip: 'bg-teal-50 dark:bg-teal-950 border-pair-teal',
  }

  const combinedClass = `${baseClass} ${type} ${typeClasses[type]} ${className}`.trim()

  return (
    <div className={combinedClass}>
      {title && <div className='font-semibold mb-2'>{title}</div>}
      <div>{children}</div>
    </div>
  )
}
