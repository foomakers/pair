import type { ReactNode } from 'react'
import { AnthropicLogo, CursorLogo, CopilotLogo, WindsurfLogo, OpenAILogo } from '@pair/brand'

interface Tool {
  name: string
  logo: ReactNode
}

const TOOLS: Tool[] = [
  { name: 'Claude Code', logo: <AnthropicLogo className='h-5 w-5' /> },
  { name: 'Cursor', logo: <CursorLogo className='h-5 w-5' /> },
  { name: 'VS Code Copilot', logo: <CopilotLogo className='h-5 w-5' /> },
  { name: 'Windsurf', logo: <WindsurfLogo className='h-5 w-5' /> },
  { name: 'Codex', logo: <OpenAILogo className='h-5 w-5' /> },
]

export function WorksWithSection() {
  return (
    <section
      aria-label='Works with'
      className='border-y border-pair-border-light px-6 py-12 dark:border-pair-border-dark'>
      <p className='mb-8 text-center text-sm font-medium uppercase tracking-widest text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Works with
      </p>
      <div className='flex flex-wrap items-center justify-center gap-10 md:gap-14'>
        {TOOLS.map(tool => (
          <span
            key={tool.name}
            className='flex items-center gap-2.5 text-pair-text-muted-light transition-colors duration-200 hover:text-pair-text-light dark:text-pair-text-muted-dark dark:hover:text-pair-text-dark'
            role='img'
            aria-label={`${tool.name} logo`}>
            {tool.logo}
            <span className='font-mono text-sm font-medium'>{tool.name}</span>
          </span>
        ))}
      </div>
    </section>
  )
}
