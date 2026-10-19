import type { ReactNode } from 'react'
import { AnthropicLogo, CursorLogo, CopilotLogo, WindsurfLogo, OpenAILogo } from '@pair/brand'

interface Tool {
  name: string
  logo?: ReactNode
}

// pi and opencode ship as text chips until their logos clear the trademark check.
const TOOLS: Tool[] = [
  { name: 'Claude Code', logo: <AnthropicLogo className='h-5 w-5' /> },
  { name: 'Codex', logo: <OpenAILogo className='h-5 w-5' /> },
  { name: 'pi' },
  { name: 'opencode' },
  { name: 'Cursor', logo: <CursorLogo className='h-5 w-5' /> },
  { name: 'VS Code Copilot', logo: <CopilotLogo className='h-5 w-5' /> },
  { name: 'Windsurf', logo: <WindsurfLogo className='h-5 w-5' /> },
]

const chipClass =
  'flex items-center gap-2.5 text-pair-text-muted-light transition-colors duration-200 hover:text-pair-text-light dark:text-pair-text-muted-dark dark:hover:text-pair-text-dark'

export function WorksWithSection() {
  return (
    <section
      aria-label='Works with'
      className='border-y border-pair-border-light px-6 py-12 dark:border-pair-border-dark'>
      <h2 className='mb-8 text-center text-sm font-medium uppercase tracking-widest text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Works with
      </h2>
      <div className='flex flex-wrap items-center justify-center gap-10 md:gap-14'>
        {TOOLS.map(tool =>
          tool.logo ? (
            <span
              key={tool.name}
              className={chipClass}
              role='img'
              aria-label={`${tool.name} logo`}>
              {tool.logo}
              <span className='font-mono text-sm font-medium'>{tool.name}</span>
            </span>
          ) : (
            <span key={tool.name} className={`${chipClass} font-mono text-sm font-medium`}>
              {tool.name}
            </span>
          ),
        )}
      </div>
      <p className='mx-auto mt-8 max-w-2xl text-center text-sm text-pair-text-muted-light dark:text-pair-text-muted-dark'>
        Assisted mode on every tool. Supervised and Autonomous need a harness with subagents or an
        engine: Claude Code, Codex, pi, opencode.
      </p>
    </section>
  )
}
