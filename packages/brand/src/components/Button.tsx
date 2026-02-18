import type { ReactNode, ButtonHTMLAttributes } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  children: ReactNode
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const baseClass =
    'pair-button px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'

  const variantClasses = {
    primary: 'bg-pair-blue text-white hover:opacity-90',
    secondary: 'bg-pair-teal text-white hover:opacity-90',
    ghost: 'bg-transparent border border-current hover:bg-slate-100 dark:hover:bg-slate-800',
  }

  const combinedClass = `${baseClass} ${variant} ${variantClasses[variant]} ${className}`.trim()

  return (
    <button className={combinedClass} {...props}>
      {children}
    </button>
  )
}
