import type { ReactNode } from 'react'
import { AnthropicLogo, CursorLogo, CopilotLogo, WindsurfLogo, OpenAILogo } from './tool-logos'

const TOOL_LOGOS: Record<string, ReactNode> = {
  'Claude Code': <AnthropicLogo className='h-5 w-5' />,
  Cursor: <CursorLogo className='h-5 w-5' />,
  'VS Code Copilot': <CopilotLogo className='h-5 w-5' />,
  Windsurf: <WindsurfLogo className='h-5 w-5' />,
  Codex: <OpenAILogo className='h-5 w-5' />,
}

const TOOLS = [
  { name: 'Claude Code' },
  { name: 'Cursor' },
  { name: 'VS Code Copilot' },
  { name: 'Windsurf' },
  { name: 'Codex' },
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
            {TOOL_LOGOS[tool.name]}
            <span className='font-mono text-sm font-medium'>{tool.name}</span>
          </span>
        ))}
      </div>
    </section>
  )
}
