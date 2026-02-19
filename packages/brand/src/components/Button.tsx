import type { ReactNode, ButtonHTMLAttributes, AnchorHTMLAttributes } from 'react'

type BaseProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline'
  children: ReactNode
  className?: string
}

type AsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & {
    as?: 'button'
  }

type AsAnchor = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    as: 'a'
  }

export type ButtonProps = AsButton | AsAnchor

export function Button(props: ButtonProps) {
  const { variant = 'primary', children, className = '', as: Tag, ...rest } = props

  const baseClass =
    'pair-button px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pair-blue focus-visible:ring-offset-2'

  const variantClasses = {
    primary: 'bg-pair-blue text-white hover:opacity-90',
    secondary: 'bg-pair-teal text-white hover:opacity-90',
    ghost:
      'bg-transparent border border-current hover:bg-pair-border-light dark:hover:bg-pair-border-dark',
    outline: 'gradient-border hover:bg-pair-border-light/50 dark:hover:bg-pair-border-dark/50',
  }

  const combinedClass = `${baseClass} ${variant} ${variantClasses[variant]} ${className}`.trim()

  if (Tag === 'a') {
    const anchorProps = rest as Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps>
    return (
      <a className={combinedClass} {...anchorProps}>
        {children}
      </a>
    )
  }

  const buttonProps = rest as Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps>
  return (
    <button className={combinedClass} {...buttonProps}>
      {children}
    </button>
  )
}
